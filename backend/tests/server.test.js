'use strict';

jest.mock('pdf-parse/lib/pdf-parse.js', () => jest.fn());
jest.mock('../resumeParserAI', () => ({
  parseResumeAI: jest.fn(),
  tokenStats: { totalUsed: 0, requests: 0, lastRequestTokens: 0 },
}));
jest.mock('../jobFetcher', () => ({ fetchJobs: jest.fn(), clearCache: jest.fn() }));
jest.mock('../matchScorer', () => ({ scoreAndRank: jest.fn() }));
jest.mock('../tailorResume', () => ({ streamTailorResume: jest.fn() }));

const request = require('supertest');
const { app, _groqState } = require('../server');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { parseResumeAI } = require('../resumeParserAI');
const { fetchJobs, clearCache } = require('../jobFetcher');
const { scoreAndRank } = require('../matchScorer');
const { streamTailorResume } = require('../tailorResume');

const PARSED_RESUME = {
  skills: ['React', 'Node.js'],
  experience: [{ title: 'Engineer', company: 'Acme', period: '2020–Now', description: 'Built APIs' }],
  projects: [],
  education: [],
  most_recent_job_title: 'Engineer',
  all_job_titles: ['Engineer'],
  location: 'Toronto, ON',
  city: 'Toronto',
  province: 'ON',
  country: 'CA',
};

const ORIG_GROQ_KEY = process.env.GROQ_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GROQ_API_KEY = 'test-key';
  _groqState.status = 'unknown';
  _groqState.detail = null;
  _groqState.lastOk = null;
  _groqState.lastError = null;
});

afterAll(() => {
  process.env.GROQ_API_KEY = ORIG_GROQ_KEY;
});

// ── GET /api/jobs/search ────────────────────────────────────────────────────

describe('GET /api/jobs/search', () => {
  it('returns 400 when title param missing', async () => {
    const res = await request(app).get('/api/jobs/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns jobs array on success', async () => {
    fetchJobs.mockResolvedValue([{ job_title: 'Engineer', postedAt: '2024-01-01T00:00:00Z' }]);
    const res = await request(app).get('/api/jobs/search?title=Engineer');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.jobs).toHaveLength(1);
  });

  it('returns 500 on fetchJobs error', async () => {
    fetchJobs.mockRejectedValue(new Error('API down'));
    const res = await request(app).get('/api/jobs/search?title=Engineer');
    expect(res.status).toBe(500);
  });

  it('backfills postedAt for jobs missing a valid date', async () => {
    fetchJobs.mockResolvedValue([{ job_title: 'Dev', postedAt: null }]);
    const res = await request(app).get('/api/jobs/search?title=Dev');
    expect(res.status).toBe(200);
    expect(new Date(res.body.jobs[0].postedAt).getTime()).not.toBeNaN();
  });
});

// ── DELETE /api/cache/clear ─────────────────────────────────────────────────

describe('DELETE /api/cache/clear', () => {
  it('returns cleared count', async () => {
    clearCache.mockReturnValue(5);
    const res = await request(app).delete('/api/cache/clear');
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(5);
  });

  it('returns 500 on clearCache error', async () => {
    clearCache.mockImplementation(() => { throw new Error('disk error'); });
    const res = await request(app).delete('/api/cache/clear');
    expect(res.status).toBe(500);
  });
});

// ── POST /api/resume/parse ──────────────────────────────────────────────────

describe('POST /api/resume/parse', () => {
  it('returns 400 when no file uploaded', async () => {
    const res = await request(app).post('/api/resume/parse');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  it('returns 400 for non-PDF file type', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', Buffer.from('hello'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('returns parsed data on success', async () => {
    pdfParse.mockResolvedValue({ numpages: 1, text: 'resume text' });
    parseResumeAI.mockResolvedValue(PARSED_RESUME);
    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', Buffer.from('%PDF-1.4'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.skills).toEqual(['React', 'Node.js']);
    expect(res.body.pages).toBe(1);
  });

  it('returns 500 on PDF parse error', async () => {
    pdfParse.mockRejectedValue(new Error('corrupt PDF'));
    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', Buffer.from('%PDF-1.4'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/parse/i);
  });
});

// ── POST /api/match ─────────────────────────────────────────────────────────

describe('POST /api/match', () => {
  it('returns 400 when no file', async () => {
    const res = await request(app).post('/api/match');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  it('returns 400 when resume has no titles and no ?title= fallback', async () => {
    pdfParse.mockResolvedValue({ numpages: 1, text: 'text' });
    parseResumeAI.mockResolvedValue({ ...PARSED_RESUME, all_job_titles: [], most_recent_job_title: '' });
    const res = await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('uses ?title= fallback when resume has no extracted titles', async () => {
    pdfParse.mockResolvedValue({ numpages: 1, text: 'text' });
    parseResumeAI.mockResolvedValue({ ...PARSED_RESUME, all_job_titles: [], most_recent_job_title: '' });
    fetchJobs.mockResolvedValue([]);
    scoreAndRank.mockReturnValue([]);
    const res = await request(app)
      .post('/api/match?title=Developer')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(fetchJobs).toHaveBeenCalledWith(expect.objectContaining({ title: 'Developer' }));
  });

  it('returns ranked jobs on success', async () => {
    pdfParse.mockResolvedValue({ numpages: 1, text: 'text' });
    parseResumeAI.mockResolvedValue(PARSED_RESUME);
    fetchJobs.mockResolvedValue([{ job_title: 'Engineer', postedAt: '2024-01-01T00:00:00Z' }]);
    scoreAndRank.mockReturnValue([{ job_title: 'Engineer', postedAt: '2024-01-01T00:00:00Z', match_score: 80 }]);
    const res = await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.most_recent_job_title).toBe('Engineer');
    expect(res.body.resume_skills).toEqual(['React', 'Node.js']);
  });

  it('backfills postedAt for jobs with invalid date', async () => {
    pdfParse.mockResolvedValue({ numpages: 1, text: 'text' });
    parseResumeAI.mockResolvedValue(PARSED_RESUME);
    fetchJobs.mockResolvedValue([]);
    scoreAndRank.mockReturnValue([{ job_title: 'Dev', postedAt: 'not-a-date', match_score: 50 }]);
    const res = await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(new Date(res.body.jobs[0].postedAt).getTime()).not.toBeNaN();
  });

  it('returns 500 on unhandled error', async () => {
    pdfParse.mockRejectedValue(new Error('disk failure'));
    const res = await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/jobs/verify ───────────────────────────────────────────────────

describe('POST /api/jobs/verify', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns empty results for empty urls array', async () => {
    const res = await request(app).post('/api/jobs/verify').send({ urls: [] });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual({});
  });

  it('returns 400 when urls array exceeds 50', async () => {
    const urls = Array.from({ length: 51 }, (_, i) => `https://example.com/job/${i}`);
    const res = await request(app).post('/api/jobs/verify').send({ urls });
    expect(res.status).toBe(400);
  });

  it('marks url expired when HEAD returns 4xx', async () => {
    const url = 'https://example.com/job/404';
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 });
    const res = await request(app).post('/api/jobs/verify').send({ urls: [url] });
    expect(res.status).toBe(200);
    expect(res.body.results[url]).toBe('expired');
  });

  it('marks url expired when HEAD 200 but body contains expired keyword', async () => {
    const url = 'https://example.com/job/closed';
    fetchSpy
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'This job is no longer accepting applications.' });
    const res = await request(app).post('/api/jobs/verify').send({ urls: [url] });
    expect(res.status).toBe(200);
    expect(res.body.results[url]).toBe('expired');
  });

  it('marks url active when HEAD 200 and body is clean', async () => {
    const url = 'https://example.com/job/open';
    fetchSpy
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'Senior Software Engineer — Apply now!' });
    const res = await request(app).post('/api/jobs/verify').send({ urls: [url] });
    expect(res.status).toBe(200);
    expect(res.body.results[url]).toBe('active');
  });

  it('marks url unknown when fetch throws', async () => {
    const url = 'https://example.com/job/timeout';
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).post('/api/jobs/verify').send({ urls: [url] });
    expect(res.status).toBe(200);
    expect(res.body.results[url]).toBe('unknown');
  });

  it('strips non-http(s) urls — ftp url absent from results', async () => {
    const res = await request(app).post('/api/jobs/verify').send({ urls: ['ftp://example.com/job'] });
    expect(res.status).toBe(200);
    expect(res.body.results['ftp://example.com/job']).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── POST /api/tailor-resume ─────────────────────────────────────────────────

describe('POST /api/tailor-resume', () => {
  it('returns 400 when parsed_resume missing', async () => {
    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ job_description: 'Looking for engineer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parsed_resume/i);
  });

  it('returns 400 when job_description missing', async () => {
    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME });
    expect(res.status).toBe(400);
  });

  it('returns 400 when experience array is empty', async () => {
    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: { ...PARSED_RESUME, experience: [] }, job_description: 'JD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/experience/i);
  });

  it('returns 400 when experience is not an array', async () => {
    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: { ...PARSED_RESUME, experience: null }, job_description: 'JD' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when GROQ_API_KEY not configured', async () => {
    delete process.env.GROQ_API_KEY;
    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME, job_description: 'JD' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/GROQ_API_KEY/i);
  });

  it('sets SSE response headers on valid request', async () => {
    async function* fakeStream() { /* empty — client disconnects quickly in tests */ }
    streamTailorResume.mockReturnValue(fakeStream());

    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME, job_description: 'JD' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('calls streamTailorResume with correct arguments', async () => {
    async function* fakeStream() { /* empty */ }
    streamTailorResume.mockReturnValue(fakeStream());

    await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME, job_description: 'JD' });

    expect(streamTailorResume).toHaveBeenCalledWith(expect.objectContaining({
      parsedResume: PARSED_RESUME,
      jobDescription: 'JD',
    }));
  });

  it('handles non-abort stream error without crashing', async () => {
    async function* errorStream() {
      throw new Error('Groq network timeout');
    }
    streamTailorResume.mockReturnValue(errorStream());

    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME, job_description: 'JD' })
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('handles AbortError during stream without crashing', async () => {
    async function* abortStream() {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
    streamTailorResume.mockReturnValue(abortStream());

    const res = await request(app)
      .post('/api/tailor-resume')
      .send({ parsed_resume: PARSED_RESUME, job_description: 'JD' })
      .buffer(true);

    expect(res.status).toBe(200);
  });
});

// ── GET /api/health ─────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns JSON with status ok when Accept is application/json', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.groq).toBe('unknown');
  });

  it('returns HTML page when Accept is text/html', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/System Health/);
    expect(res.text).toMatch(/API SERVER/i);
    expect(res.text).toMatch(/GROQ \/ LLM/i);
  });

  it('reflects rate_limited groq state after a 429 match error', async () => {
    const rateLimitErr = Object.assign(new Error('rate limit'), {
      status: 429,
      headers: { get: (k) => k === 'retry-after' ? '300' : null },
      error: { error: { message: 'TPD exceeded' } },
    });
    pdfParse.mockRejectedValue(rateLimitErr);
    await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });

    const res = await request(app)
      .get('/api/health')
      .set('Accept', 'application/json');
    expect(res.body.groq).toBe('rate_limited');
    expect(res.body.groqDetail).toMatch(/retry in 300s/);
  });

  it('reflects ok groq state after successful parse', async () => {
    pdfParse.mockResolvedValue({ text: 'resume text' });
    parseResumeAI.mockResolvedValue({ ...PARSED_RESUME });
    fetchJobs.mockResolvedValue([]);
    scoreAndRank.mockReturnValue([]);
    await request(app)
      .post('/api/match')
      .attach('resume', Buffer.from('%PDF'), { filename: 'r.pdf', contentType: 'application/pdf' });

    const res = await request(app)
      .get('/api/health')
      .set('Accept', 'application/json');
    expect(res.body.groq).toBe('ok');
  });
});
