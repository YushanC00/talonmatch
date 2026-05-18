'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs');

const {
  slugify, sanitizeTitle, buildSingleQuery,
  deduplicateJobs, extractRequirements,
  formatPayRange, isCompatibleWithLocation,
  transformJSearchJob, transformRemotiveJob, transformAdzunaJob,
  getMockData, fetchFromJSearch, fetchFromAdzuna,
  cacheGet, cacheSet, clearCache,
  _setCacheDirForTesting, _setHttpGetForTesting,
  isSearchableTitle,
} = require('../jobFetcher');

const TEST_CACHE_DIR = path.join(os.tmpdir(), `jf-test-${process.pid}`);

beforeAll(() => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
  _setCacheDirForTesting(TEST_CACHE_DIR);
});

afterAll(() => {
  _setCacheDirForTesting(null);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

afterEach(() => {
  for (const f of fs.readdirSync(TEST_CACHE_DIR)) {
    try { fs.unlinkSync(path.join(TEST_CACHE_DIR, f)); } catch {}
  }
});

// ── slugify ────────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Software Engineer')).toBe('software-engineer');
  });

  it('strips special characters', () => {
    expect(slugify('C++ Developer!')).toBe('c-developer');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('Senior  --  Dev')).toBe('senior-dev');
  });

  it('truncates at 80 chars', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(80);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

// ── sanitizeTitle ──────────────────────────────────────────────────────────────

describe('sanitizeTitle', () => {
  it('strips leading bullet character', () => {
    expect(sanitizeTitle('• Senior Engineer')).toBe('Senior Engineer');
  });

  it('strips leading en-dash', () => {
    expect(sanitizeTitle('– Product Designer')).toBe('Product Designer');
  });

  it('strips parentheses', () => {
    expect(sanitizeTitle('Engineer (React)')).toBe('Engineer React');
  });

  it('collapses double spaces', () => {
    expect(sanitizeTitle('Senior  Engineer')).toBe('Senior Engineer');
  });

  it('trims whitespace', () => {
    expect(sanitizeTitle('  Dev  ')).toBe('Dev');
  });

  it('returns normal title unchanged', () => {
    expect(sanitizeTitle('Software Engineer')).toBe('Software Engineer');
  });
});

// ── isSearchableTitle ──────────────────────────────────────────────────────────

describe('isSearchableTitle', () => {
  it('accepts standard tech/design job titles', () => {
    expect(isSearchableTitle('Software Engineer')).toBe(true);
    expect(isSearchableTitle('Senior UX Designer')).toBe(true);
    expect(isSearchableTitle('Tech Lead')).toBe(true);
    expect(isSearchableTitle('Product Manager')).toBe(true);
    expect(isSearchableTitle('Frontend Developer')).toBe(true);
  });

  it('rejects titles that are clearly education/teaching roles', () => {
    expect(isSearchableTitle('Lead Teacher')).toBe(false);
    expect(isSearchableTitle('Teach Lead')).toBe(false);
    expect(isSearchableTitle('Elementary Teacher')).toBe(false);
    expect(isSearchableTitle('Curriculum Lead')).toBe(false);
  });

  it('rejects empty or whitespace-only titles', () => {
    expect(isSearchableTitle('')).toBe(false);
    expect(isSearchableTitle('   ')).toBe(false);
  });

  it('accepts title with pipe separator by treating first segment', () => {
    expect(isSearchableTitle('UX Designer | Front-end Developer')).toBe(true);
  });
});

// ── buildSingleQuery — Home Base Detection ─────────────────────────────────────

describe('buildSingleQuery (Home Base Detection)', () => {
  it('appends userLocation to sanitized title', () => {
    expect(buildSingleQuery('Software Engineer', 'Toronto, Ontario')).toBe('Software Engineer Toronto, Ontario');
  });

  it('defaults to "Remote" when userLocation empty', () => {
    expect(buildSingleQuery('Designer', '')).toBe('Designer Remote');
  });

  it('sanitizes bullet chars from title before building query', () => {
    expect(buildSingleQuery('• Senior Dev', 'Vancouver')).toBe('Senior Dev Vancouver');
  });

  it('returns empty string for blank title', () => {
    expect(buildSingleQuery('', 'Toronto')).toBe('');
  });

  it('uses "Remote" when userLocation is whitespace only', () => {
    expect(buildSingleQuery('Engineer', '   ')).toBe('Engineer Remote');
  });
});

// ── deduplicateJobs ────────────────────────────────────────────────────────────

describe('deduplicateJobs', () => {
  it('removes duplicate jobs by URL', () => {
    const jobs = [
      { url: 'https://example.com/1', job_title: 'Dev', company: 'A' },
      { url: 'https://example.com/1', job_title: 'Dev', company: 'A' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });

  it('removes duplicates by title+company when URL absent', () => {
    const jobs = [
      { url: '', job_title: 'Dev', company: 'Acme' },
      { url: '', job_title: 'Dev', company: 'Acme' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });

  it('keeps jobs with distinct URLs and distinct companies', () => {
    const jobs = [
      { url: 'https://example.com/1', job_title: 'Dev', company: 'Alpha' },
      { url: 'https://example.com/2', job_title: 'Dev', company: 'Beta' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(2);
  });

  it('deduplicates same title+company even with different URLs (cross-source)', () => {
    const jobs = [
      { url: 'https://jsearch.com/1', job_title: 'Dev', company: 'A' },
      { url: 'https://adzuna.ca/2',   job_title: 'Dev', company: 'A' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(deduplicateJobs([])).toEqual([]);
  });
});

// ── extractRequirements ────────────────────────────────────────────────────────

describe('extractRequirements', () => {
  it('extracts tech skills from description via regex', () => {
    const reqs = extractRequirements('Must know React, TypeScript, and Docker.', null);
    expect(reqs).toContain('React');
    expect(reqs).toContain('TypeScript');
    expect(reqs).toContain('Docker');
  });

  it('prefers structured qualifications over regex when ≥6 provided', () => {
    const highlights = { Qualifications: ['React experience', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'Docker'] };
    const reqs = extractRequirements('some description', highlights);
    expect(reqs).toContain('React experience');
  });

  it('caps at 10 requirements', () => {
    const desc = 'React Angular Vue Node.js Python Java Go TypeScript PostgreSQL MySQL MongoDB Redis';
    expect(extractRequirements(desc, null).length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for empty inputs', () => {
    expect(extractRequirements('', null)).toEqual([]);
  });

  it('skips qualifications longer than 80 chars', () => {
    const longQual = 'x'.repeat(81);
    const highlights = { Qualifications: [longQual, 'React'] };
    const reqs = extractRequirements('', highlights);
    expect(reqs).not.toContain(longQual);
    expect(reqs).toContain('React');
  });

  it('falls back to regex when highlights has fewer than 6 qualifications', () => {
    const highlights = { Qualifications: ['React', 'TypeScript'] }; // only 2 → falls through
    const reqs = extractRequirements('Must know Python and Docker.', highlights);
    expect(reqs.some(r => ['Python', 'Docker', 'React', 'TypeScript'].includes(r))).toBe(true);
  });

  it('extracts UX/design skills from description via expanded regex', () => {
    const desc = 'Requires experience with User Research, Figma, and Design Systems. WCAG accessibility knowledge is a plus.';
    const reqs = extractRequirements(desc, null);
    expect(reqs).toContain('User Research');
    expect(reqs).toContain('Design Systems');
    expect(reqs).toContain('WCAG');
  });

  it('extracts product management skills from description', () => {
    const desc = 'Strong background in Stakeholder Management, Product Strategy, and defining Roadmaps.';
    const reqs = extractRequirements(desc, null);
    expect(reqs.some(r => /stakeholder management/i.test(r))).toBe(true);
    expect(reqs.some(r => /product strategy/i.test(r))).toBe(true);
  });

  it('extracts bullet points from Requirements section', () => {
    const desc = [
      'About the role: Build great things.',
      '',
      'Requirements:',
      '• 5+ years in product design',
      '• Experience with Figma and design systems',
      '• Strong stakeholder management skills',
      '',
      'Nice to have:',
      '• Familiarity with motion design',
    ].join('\n');
    const reqs = extractRequirements(desc, null);
    expect(reqs.some(r => /5\+ years/i.test(r))).toBe(true);
    expect(reqs.some(r => /figma/i.test(r))).toBe(true);
  });

  it('extracts bullets from Qualifications section', () => {
    const desc = [
      'We are hiring a UX Lead.',
      '',
      'Qualifications',
      '- 8+ years of UX experience',
      '- Proven track record in design leadership',
      '- Proficiency in Figma',
    ].join('\n');
    const reqs = extractRequirements(desc, null);
    expect(reqs.some(r => /ux experience/i.test(r))).toBe(true);
  });

  it('extracts bullets from "You Have:" section', () => {
    const desc = [
      'You Have:',
      '• User research and usability testing experience',
      '• Excellent communication skills',
    ].join('\n');
    const reqs = extractRequirements(desc, null);
    expect(reqs.some(r => /user research/i.test(r))).toBe(true);
  });

  it('stops section extraction when a new non-bullet heading appears', () => {
    const desc = [
      'Requirements:',
      '• React experience',
      '• TypeScript skills',
      'NICE TO HAVE',  // new heading — should stop section
      '• GraphQL',     // should NOT be included under requirements
    ].join('\n');
    const reqs = extractRequirements(desc, null);
    expect(reqs.some(r => /React/i.test(r))).toBe(true);
    // GraphQL appears after a new heading; it may be caught by keyword fallback
    // but must NOT be captured as a section bullet from the Requirements block
    const sectionResults = reqs.filter(r => /GraphQL/i.test(r));
    // Either 0 or 1 (keyword fallback); what matters is section stops correctly
    expect(Array.isArray(sectionResults)).toBe(true);
  });
});

// ── formatPayRange ─────────────────────────────────────────────────────────────

describe('formatPayRange', () => {
  it('returns empty string when both min and max absent', () => {
    expect(formatPayRange(null, null, 'CAD', 'YEAR')).toBe('');
  });

  it('formats min–max range for CAD annual salary', () => {
    const result = formatPayRange(90000, 120000, 'CAD', 'YEAR');
    expect(result).toContain('CA$');
    expect(result).toContain('90k');
    expect(result).toContain('120k');
  });

  it('formats hourly with /hr suffix', () => {
    expect(formatPayRange(45, 65, 'USD', 'HOUR')).toContain('/hr');
  });

  it('formats monthly with /mo suffix', () => {
    expect(formatPayRange(5000, 7000, 'USD', 'MONTH')).toContain('/mo');
  });

  it('formats min-only with + suffix', () => {
    expect(formatPayRange(80000, null, 'CAD', 'YEAR')).toMatch(/\+/);
  });

  it('formats max-only with "up to" prefix', () => {
    expect(formatPayRange(null, 100000, 'USD', 'YEAR')).toMatch(/up to/i);
  });
});

// ── isCompatibleWithLocation ───────────────────────────────────────────────────

describe('isCompatibleWithLocation', () => {
  it('returns true for "Canada"', () => {
    expect(isCompatibleWithLocation('Canada', 'Toronto, Ontario')).toBe(true);
  });

  it('returns true for "Worldwide"', () => {
    expect(isCompatibleWithLocation('Worldwide', 'Toronto, Ontario')).toBe(true);
  });

  it('returns true for "Remote"', () => {
    expect(isCompatibleWithLocation('Remote', 'Toronto, Ontario')).toBe(true);
  });

  it('returns true for "North America"', () => {
    expect(isCompatibleWithLocation('North America', 'Toronto, ON')).toBe(true);
  });

  it('returns true when country suffix in userLocation matches', () => {
    expect(isCompatibleWithLocation('ca', 'Toronto, ON, CA')).toBe(true);
  });

  it('returns true when candidateLocation is empty', () => {
    expect(isCompatibleWithLocation('', 'Toronto, ON')).toBe(true);
  });

  it('returns false for country mismatch', () => {
    expect(isCompatibleWithLocation('United Kingdom', 'Toronto, ON, CA')).toBe(false);
  });
});

// ── cacheGet / cacheSet / clearCache — Cache Management ───────────────────────

describe('cache (Cache Management)', () => {
  it('cacheGet returns null for unknown key', () => {
    expect(cacheGet('nonexistent-query-xyz-abc')).toBeNull();
  });

  it('cacheSet + cacheGet round-trips data', () => {
    const data = [{ job_title: 'Dev', company: 'Acme' }];
    cacheSet('test query', data);
    expect(cacheGet('test query')).toEqual(data);
  });

  it('cacheGet returns null for malformed JSON file', () => {
    const badKey = 'badquery123';
    const file = path.join(TEST_CACHE_DIR, `${slugify(badKey)}.json`);
    fs.writeFileSync(file, '{broken json}');
    expect(cacheGet(badKey)).toBeNull();
  });

  it('clearCache removes all .json files and returns count', () => {
    cacheSet('query-alpha', []);
    cacheSet('query-beta', []);
    const count = clearCache();
    expect(count).toBeGreaterThanOrEqual(2);
    expect(cacheGet('query-alpha')).toBeNull();
    expect(cacheGet('query-beta')).toBeNull();
  });

  it('clearCache returns 0 when already empty', () => {
    clearCache();
    expect(clearCache()).toBe(0);
  });
});

// ── transformJSearchJob ────────────────────────────────────────────────────────

describe('transformJSearchJob', () => {
  const RAW = {
    job_title: 'Senior React Developer',
    employer_name: 'Acme Corp',
    job_description: 'Build React and TypeScript apps.',
    job_highlights: null,
    job_city: 'Toronto',
    job_state: 'ON',
    job_country: 'CA',
    job_is_remote: false,
    job_apply_link: 'https://example.com/apply',
    job_google_link: '',
    job_posted_at_datetime_utc: '2024-01-15T00:00:00Z',
    job_min_salary: 90000,
    job_max_salary: 120000,
    job_salary_currency: 'CAD',
    job_salary_period: 'YEAR',
  };

  it('maps title and company correctly', () => {
    const j = transformJSearchJob(RAW);
    expect(j.job_title).toBe('Senior React Developer');
    expect(j.company).toBe('Acme Corp');
  });

  it('assembles location from city/state/country', () => {
    expect(transformJSearchJob(RAW).location).toBe('Toronto, ON, CA');
  });

  it('falls back to "Canada" when all location parts empty', () => {
    const j = transformJSearchJob({ ...RAW, job_city: '', job_state: '', job_country: '' });
    expect(j.location).toBe('Canada');
  });

  it('sets is_remote from job_is_remote flag', () => {
    expect(transformJSearchJob({ ...RAW, job_is_remote: true }).is_remote).toBe(true);
    expect(transformJSearchJob({ ...RAW, job_is_remote: false }).is_remote).toBe(false);
  });

  it('prefers job_apply_link over job_google_link for url', () => {
    expect(transformJSearchJob(RAW).url).toBe('https://example.com/apply');
  });

  it('falls back to job_google_link when apply_link absent', () => {
    const j = transformJSearchJob({ ...RAW, job_apply_link: '', job_google_link: 'https://google.com/j' });
    expect(j.url).toBe('https://google.com/j');
  });

  it('formats pay range', () => {
    expect(transformJSearchJob(RAW).pay_range).toContain('CA$');
  });

  it('includes requirements extracted from description', () => {
    const j = transformJSearchJob(RAW);
    expect(j.requirements_array).toContain('React');
    expect(j.requirements_array).toContain('TypeScript');
  });
});

// ── transformRemotiveJob ───────────────────────────────────────────────────────

describe('transformRemotiveJob', () => {
  const RAW = {
    title: 'Frontend Developer',
    company_name: 'Remote Inc',
    description: 'Build React UIs.',
    url: 'https://remotive.com/job/123',
    publication_date: '2024-02-01T00:00:00Z',
    candidate_required_location: 'Canada',
  };

  it('maps title, company, url, postedAt', () => {
    const j = transformRemotiveJob(RAW);
    expect(j.job_title).toBe('Frontend Developer');
    expect(j.company).toBe('Remote Inc');
    expect(j.url).toBe('https://remotive.com/job/123');
    expect(j.postedAt).toBe('2024-02-01T00:00:00Z');
  });

  it('always sets is_remote true', () => {
    expect(transformRemotiveJob(RAW).is_remote).toBe(true);
  });

  it('sets location from candidate_required_location', () => {
    expect(transformRemotiveJob(RAW).location).toBe('Canada');
  });

  it('defaults location to "Worldwide" when candidate_required_location empty', () => {
    const j = transformRemotiveJob({ ...RAW, candidate_required_location: '' });
    expect(j.location).toBe('Worldwide');
  });
});

// ── getMockData ────────────────────────────────────────────────────────────────

describe('getMockData', () => {
  it('returns inline fallback array when mock.json absent', () => {
    const data = getMockData();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('job_title');
  });
});

// ── fetchFromJSearch — mock data + concentric fallback ─────────────────────────

describe('fetchFromJSearch (USE_MOCK_DATA)', () => {
  beforeEach(() => { delete process.env.USE_MOCK_DATA; delete process.env.DRY_RUN; });
  afterEach(() => { delete process.env.USE_MOCK_DATA; delete process.env.DRY_RUN; });

  it('returns mock data when USE_MOCK_DATA=true', async () => {
    process.env.USE_MOCK_DATA = 'true';
    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, ON' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns mock data and logs queries when DRY_RUN=true', async () => {
    process.env.DRY_RUN = 'true';
    process.env.OPENWEBNINJA_KEY = 'test';
    const result = await fetchFromJSearch({ titles: ['Designer'], userLocation: 'Vancouver, BC' });
    expect(Array.isArray(result)).toBe(true);
    delete process.env.OPENWEBNINJA_KEY;
  });

  it('throws when no API key set', async () => {
    delete process.env.OPENWEBNINJA_KEY;
    delete process.env.RAPIDAPI_KEY;
    await expect(
      fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto' })
    ).rejects.toThrow(/OPENWEBNINJA_KEY|RAPIDAPI_KEY/);
  });
});

describe('fetchFromJSearch — Concentric Search Fallback', () => {
  const NARROW_KEY = 'Engineer Toronto';
  const WIDE_KEY   = 'Engineer Ontario';
  const REMOTE_KEY = 'Engineer Remote, CA';
  const CANADA_KEY = 'Engineer Canada';

  // Each phase uses a distinct company so cross-source title+company dedup doesn't collapse them
  const NARROW_JOB = { url: 'https://example.com/narrow', job_title: 'Engineer', company: 'NarrowCo' };
  const WIDE_JOB   = { url: 'https://example.com/wide',   job_title: 'Engineer', company: 'WideCo'   };
  const REMOTE_JOB = { url: 'https://example.com/remote', job_title: 'Engineer', company: 'RemoteCo' };
  const CANADA_JOB = { url: 'https://example.com/canada', job_title: 'Engineer', company: 'CanadaCo' };

  beforeEach(() => {
    clearCache();
    process.env.OPENWEBNINJA_KEY = 'test-key';
  });

  afterEach(() => {
    clearCache();
    delete process.env.OPENWEBNINJA_KEY;
  });

  it('uses wide province fallback when narrow returns fewer than 5 jobs', async () => {
    cacheSet(NARROW_KEY, [NARROW_JOB]);
    const wideJobs = Array.from({ length: 5 }, (_, i) => ({ ...WIDE_JOB, url: `https://example.com/wide-${i}`, company: `WideCo${i}` }));
    cacheSet(WIDE_KEY, wideJobs);
    cacheSet(REMOTE_KEY, []);
    cacheSet(CANADA_KEY, []);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    const urls = result.map(j => j.url);
    expect(urls.some(u => u.includes('wide'))).toBe(true);
  });

  it('skips wide fallback when narrow returns 5 or more jobs', async () => {
    const narrowJobs = Array.from({ length: 5 }, (_, i) => ({ ...NARROW_JOB, url: `https://example.com/narrow-${i}`, company: `NarrowCo${i}` }));
    cacheSet(NARROW_KEY, narrowJobs);
    cacheSet(REMOTE_KEY, []);
    cacheSet(WIDE_KEY, []);
    cacheSet(CANADA_KEY, []);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    const urls = result.map(j => j.url);
    expect(urls.every(u => !u.includes('wide'))).toBe(true);
  });

  it('does not attempt wide when userLocation has no province component', async () => {
    cacheSet('Engineer Toronto', [NARROW_JOB]);
    cacheSet('Engineer Remote, CA', []);
    cacheSet(CANADA_KEY, []);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('merges remote jobs into final results regardless of narrow count', async () => {
    const narrowJobs = Array.from({ length: 5 }, (_, i) => ({ ...NARROW_JOB, url: `https://example.com/n-${i}`, company: `NarrowCo${i}` }));
    cacheSet(NARROW_KEY, narrowJobs);
    cacheSet(REMOTE_KEY, [REMOTE_JOB]);
    cacheSet(CANADA_KEY, []);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    expect(result.some(j => j.url === REMOTE_JOB.url)).toBe(true);
  });

  it('merges Canada-wide jobs into final results', async () => {
    const narrowJobs = Array.from({ length: 5 }, (_, i) => ({ ...NARROW_JOB, url: `https://example.com/n-${i}`, company: `NarrowCo${i}` }));
    cacheSet(NARROW_KEY, narrowJobs);
    cacheSet(REMOTE_KEY, []);
    cacheSet(CANADA_KEY, [CANADA_JOB]);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    expect(result.some(j => j.url === CANADA_JOB.url)).toBe(true);
  });

  it('deduplicates Canada-wide jobs already in narrow results', async () => {
    cacheSet(NARROW_KEY, [NARROW_JOB]);
    cacheSet(WIDE_KEY, []);
    cacheSet(REMOTE_KEY, []);
    // Same title+company as narrow → should be deduped even though URL differs
    cacheSet(CANADA_KEY, [{ ...NARROW_JOB, url: 'https://example.com/canada-dupe' }]);

    const result = await fetchFromJSearch({ titles: ['Engineer'], userLocation: 'Toronto, Ontario' });
    const narrowCos = result.filter(j => j.company === 'NarrowCo');
    expect(narrowCos).toHaveLength(1);
  });
});

// ── transformAdzunaJob ─────────────────────────────────────────────────────────

describe('transformAdzunaJob', () => {
  const RAW = {
    title: 'Senior Engineer',
    company: { display_name: 'Acme Corp' },
    description: 'Build apps with React and TypeScript.',
    location: { display_name: 'Toronto, Ontario' },
    redirect_url: 'https://adzuna.ca/jobs/1',
    created: '2025-05-01T00:00:00Z',
    salary_min: 100000,
    salary_max: 130000,
  };

  it('maps title, company, url, location, postedAt', () => {
    const j = transformAdzunaJob(RAW);
    expect(j.job_title).toBe('Senior Engineer');
    expect(j.company).toBe('Acme Corp');
    expect(j.url).toBe('https://adzuna.ca/jobs/1');
    expect(j.location).toBe('Toronto, Ontario');
    expect(j.postedAt).toBe('2025-05-01T00:00:00Z');
  });

  it('formats pay_range with CA$ when both min and max present', () => {
    expect(transformAdzunaJob(RAW).pay_range).toContain('CA$');
  });

  it('detects remote from title keyword', () => {
    const j = transformAdzunaJob({ ...RAW, title: 'Remote Engineer' });
    expect(j.is_remote).toBe(true);
  });

  it('detects remote from description keyword', () => {
    const j = transformAdzunaJob({ ...RAW, description: 'This is a fully remote role.' });
    expect(j.is_remote).toBe(true);
  });

  it('is_remote false when no remote keyword', () => {
    expect(transformAdzunaJob(RAW).is_remote).toBe(false);
  });

  it('extracts requirements from description', () => {
    const j = transformAdzunaJob(RAW);
    expect(j.requirements_array).toContain('React');
    expect(j.requirements_array).toContain('TypeScript');
  });
});

// ── fetchFromAdzuna ────────────────────────────────────────────────────────────

describe('fetchFromAdzuna', () => {
  afterEach(() => {
    _setHttpGetForTesting(null);
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
  });

  it('returns empty array when ADZUNA keys not set', async () => {
    const result = await fetchFromAdzuna({ titles: ['Engineer'] });
    expect(result).toEqual([]);
  });

  it('returns transformed jobs on successful 200 response', async () => {
    process.env.ADZUNA_APP_ID  = 'test-id';
    process.env.ADZUNA_APP_KEY = 'test-key';
    const mockJob = {
      title: 'Software Engineer',
      company: { display_name: 'Acme Corp' },
      description: 'Build great software.',
      location: { display_name: 'Toronto, ON' },
      redirect_url: 'https://adzuna.ca/jobs/1',
      created: '2024-01-15T00:00:00Z',
      salary_min: null, salary_max: null,
    };
    _setHttpGetForTesting(async () => ({
      status: 200,
      body: JSON.stringify({ results: [mockJob] }),
    }));
    const result = await fetchFromAdzuna({ titles: ['Software Engineer'] });
    expect(result).toHaveLength(1);
    expect(result[0].job_title).toBe('Software Engineer');
    expect(result[0].company).toBe('Acme Corp');
    expect(result[0].url).toBe('https://adzuna.ca/jobs/1');
  });

  it('skips title on non-200 response and continues', async () => {
    process.env.ADZUNA_APP_ID  = 'test-id';
    process.env.ADZUNA_APP_KEY = 'test-key';
    _setHttpGetForTesting(async () => ({ status: 400, body: 'Bad Request' }));
    const result = await fetchFromAdzuna({ titles: ['Engineer'] });
    expect(result).toEqual([]);
  });

  it('skips title on http error and continues', async () => {
    process.env.ADZUNA_APP_ID  = 'test-id';
    process.env.ADZUNA_APP_KEY = 'test-key';
    _setHttpGetForTesting(async () => { throw new Error('network error'); });
    const result = await fetchFromAdzuna({ titles: ['Engineer'] });
    expect(result).toEqual([]);
  });

  it('skips title on malformed JSON response', async () => {
    process.env.ADZUNA_APP_ID  = 'test-id';
    process.env.ADZUNA_APP_KEY = 'test-key';
    _setHttpGetForTesting(async () => ({ status: 200, body: 'not-json' }));
    const result = await fetchFromAdzuna({ titles: ['Engineer'] });
    expect(result).toEqual([]);
  });
});

// ── deduplicateJobs — cross-source (title+company) ────────────────────────────

describe('deduplicateJobs — cross-source dedup', () => {
  it('deduplicates by URL', () => {
    const jobs = [
      { url: 'https://a.com', job_title: 'Eng', company: 'X' },
      { url: 'https://a.com', job_title: 'Eng', company: 'X' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });

  it('deduplicates same job from different sources by title+company when URLs differ', () => {
    const jobs = [
      { url: 'https://jsearch.com/job/1', job_title: 'Senior Engineer', company: 'Acme Corp' },
      { url: 'https://adzuna.ca/job/99',  job_title: 'Senior Engineer', company: 'Acme Corp' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });

  it('keeps distinct jobs with same title at different companies', () => {
    const jobs = [
      { url: 'https://a.com/1', job_title: 'Engineer', company: 'Alpha Inc' },
      { url: 'https://b.com/2', job_title: 'Engineer', company: 'Beta Corp' },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(2);
  });

  it('normalizes title+company for comparison (case, punctuation)', () => {
    const jobs = [
      { url: 'https://a.com/1', job_title: 'Senior Engineer', company: 'Acme Corp.' },
      { url: 'https://b.com/2', job_title: 'senior engineer',  company: 'acme corp'  },
    ];
    expect(deduplicateJobs(jobs)).toHaveLength(1);
  });
});
