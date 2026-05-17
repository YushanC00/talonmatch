require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
// Use internal path to skip pdf-parse's test-file side-effect on require
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const cors = require('cors');
const { parseResumeAI, tokenStats } = require('./resumeParserAI');
const { fetchJobs } = require('./jobFetcher');
const { scoreAndRank } = require('./matchScorer');
const { streamTailorResume } = require('./tailorResume');
const { sendNotification } = require('./emailService');
const { evaluateNarrative } = require('./src/services/narrativeAuditor');
const { clearCache } = require('./jobFetcher');
const { extractDesignDNA } = require('./designDNA');

const app = express();
app.use(cors());
app.use(express.json());

// ── Request logger ─────────────────────────────────────────────────────────────
const _tokenLog = { used: 0, requests: 0, errors: 0 };
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const flag = res.statusCode >= 400 ? '✗' : '✓';
    console.log(`${flag} ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    if (res.statusCode >= 500) _tokenLog.errors++;
  });
  next();
});

const verifyStats = { requests: 0, urlsChecked: 0, expiredFound: 0, unknownCount: 0 };

const EXPIRED_KEYWORDS = [
  'no longer accepting',
  'position has been filled',
  'job has expired',
  'listing is closed',
  'this job is no longer',
  'application closed',
];

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

// Track Groq status from real requests — no probe calls that waste tokens
const groqState = { status: 'unknown', detail: null, lastOk: null, lastError: null };

app.get('/api/health', (req, res) => {
  const groqStatus = groqState.status;
  const groqDetail = groqState.detail;
  const resendStatus = process.env.RESEND_API_KEY ? 'ok' : 'not_configured';

  if (req.accepts('html')) {
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = `${h}h ${m}m ${s}s`;
    const mem = process.memoryUsage();
    const mb = (b) => `${Math.round(b / 1024 / 1024)}MB`;
    const dot  = (st) => st === 'ok' ? '#4ade80' : st === 'rate_limited' ? '#facc15' : st === 'unknown' ? '#6b7280' : '#f87171';
    const label = (st) => st === 'ok' ? 'Operational' : st === 'rate_limited' ? 'Rate limited' : st === 'unknown' ? 'No requests yet' : 'Error';
    const TPD_LIMIT = 500_000;
    const tokenPct = Math.min(100, Math.round((tokenStats.totalUsed / TPD_LIMIT) * 100));
    const tokenBarColor = tokenPct > 80 ? '#f87171' : tokenPct > 60 ? '#facc15' : '#4ade80';
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>TalonMatch · Health</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1113;color:#e2e8f0;font-family:'JetBrains Mono',ui-monospace,monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#1a1d21;border:1px solid #2d3139;width:100%;max-width:480px;padding:36px}
  .logo{font-size:11px;letter-spacing:.18em;color:#6b7280;text-transform:uppercase;margin-bottom:28px}
  .logo span{color:#a85e3e}
  h1{font-size:22px;font-weight:600;letter-spacing:-.01em;margin-bottom:32px;color:#f1f5f9}
  .row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #23272e}
  .row:last-child{border-bottom:none}
  .service{font-size:12px;letter-spacing:.06em;color:#94a3b8;text-transform:uppercase}
  .badge{display:flex;align-items:center;gap:8px;font-size:13px}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .detail{font-size:11px;color:#6b7280;margin-top:4px}
  .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:14px 0;border-bottom:1px solid #23272e}
  .stat-label{font-size:11px;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
  .stat-val{font-size:20px;font-weight:500;color:#f1f5f9}
  .bar-wrap{padding:14px 0;border-bottom:1px solid #23272e}
  .bar-header{display:flex;justify-content:space-between;margin-bottom:8px}
  .bar-bg{background:#23272e;height:6px;width:100%}
  .bar-fill{height:6px;transition:width .3s}
  .ts{font-size:11px;color:#4b5563;margin-top:20px;display:flex;justify-content:space-between}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Talon<span>Match</span> · Status</div>
  <h1>System Health</h1>

  <div class="row">
    <div><div class="service">API Server</div></div>
    <div class="badge"><div class="dot" style="background:#4ade80"></div>Operational</div>
  </div>

  <div class="row">
    <div>
      <div class="service">Groq / LLM</div>
      ${groqDetail ? `<div class="detail">${groqDetail}</div>` : ''}
      ${groqState.lastOk ? `<div class="detail">last ok: ${new Date(groqState.lastOk).toUTCString()}</div>` : ''}
      ${groqState.lastError ? `<div class="detail" style="color:#f87171">last error: ${new Date(groqState.lastError).toUTCString()}</div>` : ''}
    </div>
    <div class="badge">
      <div class="dot" style="background:${dot(groqStatus)}"></div>
      ${label(groqStatus)}
    </div>
  </div>

  <div class="row">
    <div><div class="service">Email / Resend</div></div>
    <div class="badge">
      <div class="dot" style="background:${resendStatus === 'ok' ? '#4ade80' : '#f87171'}"></div>
      ${resendStatus === 'ok' ? 'Configured' : 'Not configured'}
    </div>
  </div>

  <div class="bar-wrap">
    <div class="bar-header">
      <span class="service">Groq tokens (session)</span>
      <span class="detail" style="color:#94a3b8">${tokenStats.totalUsed.toLocaleString()} / ${TPD_LIMIT.toLocaleString()} &nbsp;·&nbsp; ${tokenPct}%</span>
    </div>
    <div class="bar-bg"><div class="bar-fill" style="width:${tokenPct}%;background:${tokenBarColor}"></div></div>
    <div class="detail" style="margin-top:6px">${tokenStats.requests} parse requests &nbsp;·&nbsp; last: ${tokenStats.lastRequestTokens.toLocaleString()} tokens</div>
  </div>

  <div class="stat-grid">
    <div>
      <div class="stat-label">Uptime</div>
      <div class="stat-val">${uptimeStr}</div>
    </div>
    <div>
      <div class="stat-label">Heap used</div>
      <div class="stat-val">${mb(mem.heapUsed)} <span style="font-size:13px;color:#6b7280">/ ${mb(mem.heapTotal)}</span></div>
    </div>
    <div>
      <div class="stat-label">RSS</div>
      <div class="stat-val">${mb(mem.rss)}</div>
    </div>
    <div>
      <div class="stat-label">Errors (500)</div>
      <div class="stat-val" style="color:${_tokenLog.errors > 0 ? '#f87171' : '#4ade80'}">${_tokenLog.errors}</div>
    </div>
  </div>

  <div class="ts">
    <span>auto-refresh every 30s</span>
    <span>checked ${new Date().toUTCString()}</span>
  </div>
</div>
</body>
</html>`);
  }

  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), groq: groqStatus, groqDetail, resend: resendStatus });
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
      const daysAgo = 3 + Math.floor(Math.random() * 27);
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
    // Parse resume text + extract design DNA in parallel
    const pdfData = await pdfParse(req.file.buffer);
    // Strip U+00CF (Ï) from line-starts: pdfjs encodes ● as this when font uses custom glyph map
    const resumeText = pdfData.text.replace(/^Ï\s*/gm, '');
    const [resume, styleConfig] = await Promise.all([
      parseResumeAI(resumeText).then(r => {
        groqState.status = 'ok';
        groqState.detail = null;
        groqState.lastOk = new Date().toISOString();
        return r;
      }),
      extractDesignDNA(req.file.buffer).catch(err => {
        console.warn('[designDNA] extraction failed (non-fatal):', err.message);
        return null;
      }),
    ]);

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
      const daysAgo = 3 + Math.floor(Math.random() * 27);
      return { ...job, postedAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString() };
    });

    const searchQueryUsed = titles.join(', ');

    console.log('Successfully parsed jobs:', resume.experience.map(e => e.title));
    console.log('[postedAt sample]', rankedWithDates.slice(0, 3).map(j => ({ title: j.job_title, postedAt: j.postedAt })));

    console.log('[designDNA] result:', JSON.stringify(styleConfig));

    res.json({
      resume_full_name: resume.full_name || '',
      resume_contact_line: resume.contact_line || '',
      resume_summary_section_title: resume.summary_section_title || '',
      resume_summary: resume.summary || '',
      resume_skills: resume.skills,
      most_recent_job_title: resume.most_recent_job_title,
      all_job_titles: resume.all_job_titles,
      resume_location: resume.location,
      resume_city: resume.city || '',
      resume_province: resume.province || '',
      resume_experience: resume.experience,
      resume_projects:   resume.projects   || [],
      resume_education:  resume.education  || [],
      style_config: styleConfig,
      search_query_used: searchQueryUsed,
      count: rankedWithDates.length,
      jobs: rankedWithDates,
    });
  } catch (err) {
    console.error('[/api/match error]', err);
    if (err.status === 429) {
      const retryAfter = err.headers?.get?.('retry-after');
      groqState.status = 'rate_limited';
      groqState.detail = retryAfter ? `retry in ${retryAfter}s` : err.error?.error?.message ?? err.message;
      groqState.lastError = new Date().toISOString();
    } else if (err.message?.includes('groq') || err.message?.includes('Groq') || err.constructor?.name?.includes('API')) {
      groqState.status = 'error';
      groqState.detail = err.message;
      groqState.lastError = new Date().toISOString();
    }
    res.status(500).json({ error: 'Match failed', details: err.message });
  }
});

app.post('/api/tailor-resume', async (req, res) => {
  const { parsed_resume, job_description, preferences } = req.body;

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
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[tailor] client disconnected +${Date.now() - t_route}ms`);
      clearInterval(keepalive);
      ac.abort();
    }
  });

  try {
    for await (const event of streamTailorResume({
      parsedResume:   parsed_resume,
      jobDescription: job_description,
      preferences:    Array.isArray(preferences) ? preferences : undefined,
      signal:         ac.signal,
    })) {
      if (res.writableEnded || ac.signal.aborted) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }

    if (!res.writableEnded && !ac.signal.aborted) {
      try {
        const insight = evaluateNarrative(parsed_resume, job_description);
        console.log(`[narrativeAuditor] status:${insight.status}`);
        res.write(`data: ${JSON.stringify({ type: 'narrative', insight })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      } catch (err) {
        console.error('[narrativeAuditor] failed:', err);
      }
    }
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message?.toLowerCase().includes('aborted');
    if (isAbort) {
      console.log('[tailor] stream aborted (client gone)');
    } else {
      console.error('[tailor] stream error:', err.message);
      if (err.status === 429) {
        const retryAfter = err.headers?.get?.('retry-after') ?? err.headers?.['retry-after'];
        groqState.status = 'rate_limited';
        groqState.detail = retryAfter ? `retry in ${retryAfter}s` : err.error?.error?.message ?? err.message;
        groqState.lastError = new Date().toISOString();
      } else if (!isAbort) {
        groqState.status = 'error';
        groqState.detail = err.message;
        groqState.lastError = new Date().toISOString();
      }
      if (!res.writableEnded)
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }
  } finally {
    clearInterval(keepalive);
    if (!res.writableEnded) res.end();
  }
});

app.post('/api/jobs/verify', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls must be an array' });
  if (urls.length > 50) return res.status(400).json({ error: 'max 50 urls per request' });

  const validUrls = urls.filter(u => typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://')));
  if (validUrls.length === 0) return res.json({ results: {} });

  verifyStats.requests++;
  verifyStats.urlsChecked += validUrls.length;

  const results = {};

  await Promise.allSettled(validUrls.map(async (url) => {
    try {
      const headRes = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' });
      if (!headRes.ok || headRes.status >= 400) {
        results[url] = 'expired';
        verifyStats.expiredFound++;
        return;
      }
      try {
        const getRes = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
        const body = (await getRes.text()).toLowerCase();
        if (EXPIRED_KEYWORDS.some(kw => body.includes(kw))) {
          results[url] = 'expired';
          verifyStats.expiredFound++;
        } else {
          results[url] = 'active';
        }
      } catch {
        results[url] = 'unknown';
        verifyStats.unknownCount++;
      }
    } catch {
      results[url] = 'unknown';
      verifyStats.unknownCount++;
    }
  }));

  res.json({ results });
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

app.post('/api/notify', async (req, res) => {
  const { to, applications } = req.body;
  if (!to || !Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: 'to and non-empty applications array required' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email not configured — set RESEND_API_KEY in .env' });
  }
  try {
    await sendNotification({ to, applications });
    res.json({ sent: applications.length });
  } catch (err) {
    console.error('[notify]', err.message);
    res.status(500).json({ error: 'Failed to send notification', details: err.message });
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

module.exports = { app, _groqState: groqState };
