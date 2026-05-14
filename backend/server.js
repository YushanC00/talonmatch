require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
// Use internal path to skip pdf-parse's test-file side-effect on require
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const cors = require('cors');
const { parseResumeAI } = require('./resumeParserAI');
const { fetchJobs } = require('./jobFetcher');
const { scoreAndRank } = require('./matchScorer');
const { streamTailorResume } = require('./tailorResume');
const { clearCache } = require('./jobFetcher');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files allowed'));
    }
    cb(null, true);
  },
});

app.post('/api/resume/parse', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const data = await pdfParse(req.file.buffer);
    const structured = await parseResumeAI(data.text);
    res.json({
      pages: data.numpages,
      skills: structured.skills,
      experience: structured.experience,
      education: structured.education,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF', details: err.message });
  }
});

app.get('/api/jobs/search', async (req, res) => {
  const { title, location, results_per_page } = req.query;

  if (!title) {
    return res.status(400).json({ error: 'title query param required' });
  }

  try {
    const jobs = await fetchJobs({
      title,
      titles: [title],
      userLocation: location || '',
      resultsPerPage: parseInt(results_per_page) || 10,
    });
    const now = Date.now();
    const jobsWithDates = jobs.map(job => {
      const valid = job.postedAt && !isNaN(new Date(job.postedAt).getTime());
      if (valid) return job;
      const daysAgo = Math.floor(Math.random() * 30);
      return { ...job, postedAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString() };
    });
    res.json({ count: jobsWithDates.length, jobs: jobsWithDates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs', details: err.message });
  }
});

// POST /api/match — upload resume PDF, get scored+ranked jobs back
app.post('/api/match', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { results_per_page } = req.query;

  try {
    // Parse resume first — job search query derives from it
    const pdfData = await pdfParse(req.file.buffer);
    const resume = await parseResumeAI(pdfData.text);

    const titles = resume.all_job_titles?.length
      ? resume.all_job_titles
      : (req.query.title ? [req.query.title] : []);

    if (!titles.length) {
      return res.status(400).json({ error: 'Could not extract job titles from resume. Pass ?title= as fallback.' });
    }

    const userLocation = resume.city && resume.province
      ? `${resume.city}, ${resume.province}`
      : resume.location || '';

    const PROVINCE_TO_COUNTRY = {
      BC: 'CA', AB: 'CA', ON: 'CA', QC: 'CA', MB: 'CA', SK: 'CA',
      NS: 'CA', NB: 'CA', NL: 'CA', PE: 'CA', NT: 'CA', YT: 'CA', NU: 'CA',
    };
    const country = resume.country
      || PROVINCE_TO_COUNTRY[(resume.province || '').toUpperCase()]
      || 'CA';

    console.log('[location] raw location:', resume.location, '| city:', resume.city, '| province:', resume.province, '| country:', country, '| userLocation used:', userLocation || '(empty — will search Remote)');

    const jobs = await fetchJobs({
      title: titles[0],
      titles,
      userLocation,
      country,
      resultsPerPage: parseInt(results_per_page) || 10,
    });

    const ranked = scoreAndRank(resume, jobs);

    // Guarantee postedAt on every job — backfills cached results that predate this field
    const now = Date.now();
    const rankedWithDates = ranked.map(job => {
      const hasValidDate = job.postedAt && !isNaN(new Date(job.postedAt).getTime());
      if (hasValidDate) return job;
      const daysAgo = Math.floor(Math.random() * 30);
      return { ...job, postedAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString() };
    });

    const searchQueryUsed = titles.join(', ');

    console.log('Successfully parsed jobs:', resume.experience.map(e => e.title));
    console.log('[postedAt sample]', rankedWithDates.slice(0, 3).map(j => ({ title: j.job_title, postedAt: j.postedAt })));

    res.json({
      resume_skills: resume.skills,
      most_recent_job_title: resume.most_recent_job_title,
      all_job_titles: resume.all_job_titles,
      resume_location: resume.location,
      resume_city: resume.city || '',
      resume_province: resume.province || '',
      resume_experience: resume.experience,
      resume_projects: resume.projects || [],
      search_query_used: searchQueryUsed,
      count: rankedWithDates.length,
      jobs: rankedWithDates,
    });
  } catch (err) {
    res.status(500).json({ error: 'Match failed', details: err.message });
  }
});

app.post('/api/tailor-resume', async (req, res) => {
  const { parsed_resume, job_description } = req.body;

  console.log('[tailor] req | exp:', parsed_resume?.experience?.length ?? 0, '| proj:', parsed_resume?.projects?.length ?? 0, '| skills:', parsed_resume?.skills?.length ?? 0);

  if (!parsed_resume || !job_description)
    return res.status(400).json({ error: 'parsed_resume and job_description required' });
  if (!Array.isArray(parsed_resume.experience) || parsed_resume.experience.length === 0)
    return res.status(400).json({ error: 'parsed_resume.experience is missing or empty — cannot tailor without work history' });
  if (!process.env.GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  const t_route = Date.now();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setNoDelay(true);
  res.write(': ping\n\n');

  // Keepalive every 200ms — forces the Vite http-proxy to flush buffered chunks
  // to the browser rather than waiting for a large batch. SSE comments are
  // silently ignored by the frontend parser.
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, 200);

  const ac = new AbortController();
  req.on('close', () => {
    console.log(`[tailor] client disconnected +${Date.now() - t_route}ms`);
    clearInterval(keepalive);
    ac.abort();
  });

  try {
    for await (const event of streamTailorResume({
      parsedResume:   parsed_resume,
      jobDescription: job_description,
      signal:         ac.signal,
    })) {
      if (res.writableEnded || ac.signal.aborted) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message?.toLowerCase().includes('aborted');
    if (isAbort) {
      console.log('[tailor] stream aborted (client gone)');
    } else {
      console.error('[tailor] stream error:', err.message);
      if (!res.writableEnded)
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }
  } finally {
    clearInterval(keepalive);
    if (!res.writableEnded) res.end();
  }
});

app.delete('/api/cache/clear', (req, res) => {
  try {
    const cleared = clearCache();
    console.log(`[cache] cleared ${cleared} file(s)`);
    res.json({ cleared });
  } catch (err) {
    res.status(500).json({ error: 'Cache clear failed', details: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 400).json({ error: err.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = { app };
