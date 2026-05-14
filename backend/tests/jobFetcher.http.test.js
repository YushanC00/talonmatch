'use strict';

// Separate file so jest.mock('https') is scoped here only.

jest.mock('https');

const https    = require('https');
const events   = require('events');
const os       = require('os');
const path     = require('path');
const fs       = require('fs');

const {
  fetchFromRemotive, fetchJobs, fetchFromJSearch,
  cacheGet, cacheSet, clearCache,
  _setCacheDirForTesting,
} = require('../jobFetcher');

const TEST_CACHE_DIR = path.join(os.tmpdir(), `jf-http-test-${process.pid}`);

beforeAll(() => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
  _setCacheDirForTesting(TEST_CACHE_DIR);
});
afterAll(() => {
  _setCacheDirForTesting(null);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});
beforeEach(() => {
  clearCache();
  delete process.env.OPENWEBNINJA_KEY;
  delete process.env.RAPIDAPI_KEY;
  delete process.env.USE_MOCK_DATA;
  delete process.env.DRY_RUN;
  https.get.mockReset();
});

// Helper — emits a fake https response
function mockHttps(statusCode, body) {
  https.get.mockImplementation((url, opts, cb) => {
    const res = new events.EventEmitter();
    res.statusCode = statusCode;
    process.nextTick(() => {
      cb(res);
      res.emit('data', body);
      res.emit('end');
    });
    const req = new events.EventEmitter();
    return req;
  });
}

// ── fetchFromRemotive ──────────────────────────────────────────────────────────

describe('fetchFromRemotive', () => {
  const REMOTE_JOB = {
    title: 'Frontend Dev',
    company_name: 'Remote Co',
    description: 'Build React apps.',
    url: 'https://remotive.com/job/42',
    publication_date: '2024-03-01T00:00:00Z',
    candidate_required_location: 'Canada',
  };

  it('returns transformed jobs from Remotive API', async () => {
    mockHttps(200, JSON.stringify({ jobs: [REMOTE_JOB] }));
    const jobs = await fetchFromRemotive({ title: 'Frontend Dev', userLocation: 'Toronto, ON' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].job_title).toBe('Frontend Dev');
    expect(jobs[0].is_remote).toBe(true);
  });

  it('filters to compatible locations when matches exist', async () => {
    const ukJob = { ...REMOTE_JOB, candidate_required_location: 'United Kingdom', url: 'https://remotive.com/job/99' };
    mockHttps(200, JSON.stringify({ jobs: [REMOTE_JOB, ukJob] }));
    const jobs = await fetchFromRemotive({ title: 'Dev', userLocation: 'Toronto, ON, CA' });
    // Only the Canada-compatible job should pass the filter
    expect(jobs.every(j => j.url !== 'https://remotive.com/job/99')).toBe(true);
  });

  it('returns all jobs when none match location filter', async () => {
    const ukJob = { ...REMOTE_JOB, candidate_required_location: 'United Kingdom' };
    mockHttps(200, JSON.stringify({ jobs: [ukJob] }));
    const jobs = await fetchFromRemotive({ title: 'Dev', userLocation: 'Toronto, ON, CA' });
    // No compatible → fall back to all
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('strips _candidateLocation from returned jobs', async () => {
    mockHttps(200, JSON.stringify({ jobs: [REMOTE_JOB] }));
    const [job] = await fetchFromRemotive({ title: 'Dev', userLocation: '' });
    expect(job._candidateLocation).toBeUndefined();
  });

  it('throws on non-200 status', async () => {
    mockHttps(503, '');
    await expect(fetchFromRemotive({ title: 'Dev', userLocation: '' })).rejects.toThrow('503');
  });

  it('throws on invalid JSON body', async () => {
    mockHttps(200, '{bad json');
    await expect(fetchFromRemotive({ title: 'Dev', userLocation: '' })).rejects.toThrow(/parse error/i);
  });
});

// ── fetchJobs routing ──────────────────────────────────────────────────────────

describe('fetchJobs routing', () => {
  it('routes to fetchFromRemotive when no API key set', async () => {
    mockHttps(200, JSON.stringify({ jobs: [] }));
    const result = await fetchJobs({ title: 'Engineer', userLocation: 'Toronto', resultsPerPage: 5 });
    expect(Array.isArray(result)).toBe(true);
    expect(https.get).toHaveBeenCalled();
  });

  it('routes to fetchFromJSearch (USE_MOCK_DATA) when API key present', async () => {
    process.env.USE_MOCK_DATA = 'true';
    process.env.OPENWEBNINJA_KEY = 'key';
    const result = await fetchJobs({ title: 'Engineer', titles: ['Engineer'], userLocation: 'Toronto' });
    expect(Array.isArray(result)).toBe(true);
    // Remotive https.get should NOT have been called — JSearch mock path used
    expect(https.get).not.toHaveBeenCalled();
  });

  it('backfills postedAt when job has no date', async () => {
    mockHttps(200, JSON.stringify({ jobs: [{ title: 'Dev', company_name: 'Co', url: 'https://x.com', candidate_required_location: '' }] }));
    const [job] = await fetchJobs({ title: 'Dev', userLocation: '' });
    expect(job.postedAt).toBeTruthy();
  });
});

// ── fetchOneTitle via cache miss + JSearch API ─────────────────────────────────

describe('fetchFromJSearch — live HTTP path via fetchOneTitle', () => {
  beforeEach(() => {
    process.env.OPENWEBNINJA_KEY = 'test-key';
  });
  afterEach(() => {
    delete process.env.OPENWEBNINJA_KEY;
    clearCache();
  });

  const JSEARCH_JOB = {
    job_title: 'Software Engineer',
    employer_name: 'Acme',
    job_description: 'Build React and Node.js apps.',
    job_highlights: null,
    job_city: 'Toronto', job_state: 'ON', job_country: 'CA',
    job_is_remote: false,
    job_apply_link: 'https://example.com/apply',
    job_google_link: '',
    job_posted_at_datetime_utc: '2024-01-01T00:00:00Z',
    job_min_salary: null, job_max_salary: null,
    job_salary_currency: 'CAD', job_salary_period: 'YEAR',
  };

  it('fetches from API on cache miss and caches result', async () => {
    mockHttps(200, JSON.stringify({ data: [JSEARCH_JOB] }));
    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    expect(result.some(j => j.job_title === 'Software Engineer')).toBe(true);
    // Result should now be cached
    const query = 'Engineer Toronto';
    expect(cacheGet(query)).not.toBeNull();
  });

  it('throws on JSearch API error status', async () => {
    mockHttps(429, JSON.stringify({ message: 'Rate limit exceeded' }));
    await expect(
      fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' })
    ).rejects.toThrow(/429/);
  });

  it('throws on invalid JSON from JSearch', async () => {
    mockHttps(200, 'not json');
    await expect(
      fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' })
    ).rejects.toThrow(/parse error/i);
  });
});
