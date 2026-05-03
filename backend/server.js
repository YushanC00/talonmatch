require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
// Use internal path to skip pdf-parse's test-file side-effect on require
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const cors = require('cors');
const { parseResume } = require('./resumeParser');
const { parseResumeAI } = require('./resumeParserAI');
const { fetchJobs } = require('./jobFetcher');
const { scoreAndRank } = require('./matchScorer');
const { tailorResume } = require('./tailorResume');

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
      location: location || '',
      resultsPerPage: parseInt(results_per_page) || 10,
    });
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs', details: err.message });
  }
});

// POST /api/match — upload resume PDF, get scored+ranked jobs back
app.post('/api/match', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { location, results_per_page } = req.query;

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

    const jobs = await fetchJobs({
      title: titles[0],
      titles,
      userLocation: resume.location,
      resultsPerPage: parseInt(results_per_page) || 10,
    });

    const ranked = scoreAndRank(resume, jobs);

    const searchQueryUsed = titles.join(', ');

    console.log('Successfully parsed jobs:', resume.experience.map(e => e.title));

    res.json({
      resume_skills: resume.skills,
      most_recent_job_title: resume.most_recent_job_title,
      all_job_titles: resume.all_job_titles,
      resume_location: resume.location,
      resume_experience: resume.experience,
      search_query_used: searchQueryUsed,
      count: ranked.length,
      jobs: ranked,
    });
  } catch (err) {
    res.status(500).json({ error: 'Match failed', details: err.message });
  }
});

app.post('/api/tailor-resume', async (req, res) => {
  const { parsed_resume, job_description } = req.body;

  if (!parsed_resume || !job_description) {
    return res.status(400).json({ error: 'parsed_resume and job_description required' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  try {
    const result = await tailorResume({ parsedResume: parsed_resume, jobDescription: job_description });
    res.json(result);
  } catch (err) {
    console.error('AI API ERROR:', err);
    res.status(500).json({ error: 'Tailoring failed', details: err.message });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
