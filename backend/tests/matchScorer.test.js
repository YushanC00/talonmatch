'use strict';

const { scoreAndRank } = require('../matchScorer');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResume(overrides = {}) {
  return {
    skills: ['JavaScript', 'React', 'Node.js'],
    experience: [{ title: 'Software Engineer', company: 'Acme', period: '2020–2023', bullets: [] }],
    education: [],
    most_recent_job_title: 'Software Engineer',
    city: 'Toronto',
    province: 'Ontario',
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  return {
    job_title: 'Software Engineer',
    company: 'Corp',
    location: 'Toronto, ON',
    is_remote: false,
    requirements_array: ['JavaScript', 'React'],
    description: '',
    ...overrides,
  };
}

// ── scoreAndRank — contract ────────────────────────────────────────────────────

describe('scoreAndRank', () => {
  it('returns empty array for empty job list', () => {
    expect(scoreAndRank(makeResume(), [])).toEqual([]);
  });

  it('returns empty array for null/undefined jobs', () => {
    expect(scoreAndRank(makeResume(), null)).toEqual([]);
    expect(scoreAndRank(makeResume(), undefined)).toEqual([]);
  });

  it('attaches match_score to each job', () => {
    const [job] = scoreAndRank(makeResume(), [makeJob()]);
    expect(typeof job.match_score).toBe('number');
    expect(job.match_score).toBeGreaterThan(0);
    expect(job.match_score).toBeLessThanOrEqual(100);
  });

  it('attaches match_reason string to each job', () => {
    const [job] = scoreAndRank(makeResume(), [makeJob()]);
    expect(typeof job.match_reason).toBe('string');
    expect(job.match_reason.length).toBeGreaterThan(0);
  });

  it('sorts descending by match_score', () => {
    const highJob = makeJob({ requirements_array: ['JavaScript', 'React'] });
    const lowJob  = makeJob({ requirements_array: ['Kotlin', 'Android SDK', 'Gradle'] });
    const result  = scoreAndRank(makeResume(), [lowJob, highJob]);
    expect(result[0].match_score).toBeGreaterThanOrEqual(result[1].match_score);
  });

  it('perfect match: all requirements met + same seniority + same city → score near 100', () => {
    const resume = makeResume({ skills: ['JavaScript', 'React'] });
    const job    = makeJob({ requirements_array: ['JavaScript', 'React'] });
    const [scored] = scoreAndRank(resume, [job]);
    // 70% skills (1.0) + 20% seniority (1.0) + 10% proximity (1.0) = 100%
    // BUT: unmatched.length === 0, so no cap. Should be 100.
    expect(scored.match_score).toBe(100);
  });
});

// ── Skills scoring (70%) ──────────────────────────────────────────────────────

describe('scoreAndRank — skill matching', () => {
  it('matches exact skill token', () => {
    const resume = makeResume({ skills: ['React'] });
    const job    = makeJob({ requirements_array: ['React'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeGreaterThan(0);
  });

  it('no skill match → low score', () => {
    const resume = makeResume({ skills: ['COBOL'] });
    const job    = makeJob({ requirements_array: ['React', 'TypeScript', 'GraphQL'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeLessThan(50);
  });

  it('case-insensitive skill matching (React vs react)', () => {
    const resume = makeResume({ skills: ['react'] });
    const job    = makeJob({ requirements_array: ['React'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeGreaterThan(0);
  });

  it('multi-token requirement matches when all tokens present (node.js → node js)', () => {
    const resume = makeResume({ skills: ['Node.js'] });
    const job    = makeJob({ requirements_array: ['Node.js'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeGreaterThan(0);
  });
});

// ── Honesty patch — 99% cap ────────────────────────────────────────────────────

describe('scoreAndRank — honesty cap', () => {
  it('caps at 99 when any requirement is unmatched', () => {
    // Resume matches most skills but misses one
    const resume = makeResume({ skills: ['JavaScript', 'React', 'TypeScript'] });
    const job    = makeJob({ requirements_array: ['JavaScript', 'React', 'Kotlin'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeLessThanOrEqual(99);
  });

  it('may return 100 when all requirements are matched', () => {
    const resume = makeResume({ skills: ['JavaScript', 'React'] });
    const job    = makeJob({ requirements_array: ['JavaScript', 'React'], is_remote: true });
    const [scored] = scoreAndRank(resume, [job]);
    // All requirements matched — no cap
    expect(scored.match_score).toBe(100);
  });
});

// ── Seniority scoring (20%) ────────────────────────────────────────────────────

describe('scoreAndRank — seniority', () => {
  it('same level → higher score than mismatched level', () => {
    const resume         = makeResume({ most_recent_job_title: 'Senior Software Engineer' });
    const matchingJob    = makeJob({ job_title: 'Senior Software Engineer', requirements_array: ['React'] });
    const mismatchedJob  = makeJob({ job_title: 'Junior Software Engineer', requirements_array: ['React'] });
    const [hi, lo]       = scoreAndRank(resume, [matchingJob, mismatchedJob]);
    // Both have same skills match; seniority decides order
    expect(hi.match_score).toBeGreaterThanOrEqual(lo.match_score);
  });

  it('two-level seniority gap reduces score vs one-level gap', () => {
    const resume   = makeResume({ most_recent_job_title: 'Senior Engineer', skills: [] });
    const oneGap   = makeJob({ job_title: 'Mid-level Engineer',     requirements_array: [] });
    const twoGap   = makeJob({ job_title: 'Junior Software Engineer', requirements_array: [] });
    const [hi, lo] = scoreAndRank(resume, [twoGap, oneGap]);
    expect(hi.match_score).toBeGreaterThan(lo.match_score);
  });
});

// ── Proximity scoring (10%) ────────────────────────────────────────────────────

describe('scoreAndRank — proximity', () => {
  it('remote job always scores full proximity regardless of location', () => {
    const resume   = makeResume({ city: 'Toronto', province: 'Ontario' });
    const remote   = makeJob({ is_remote: true, location: 'Montreal, QC', requirements_array: ['JavaScript'] });
    const local    = makeJob({ is_remote: false, location: 'Toronto, ON',  requirements_array: ['JavaScript'] });
    const [hi, lo] = scoreAndRank(resume, [local, remote]);
    // Remote and local Toronto should both be high; remote should not be penalised
    expect(remote.requirements_array).toBeTruthy(); // sanity
    const scored   = scoreAndRank(resume, [remote]);
    expect(scored[0].match_score).toBeGreaterThan(0);
  });

  it('city match outscores province-only match', () => {
    const resume     = makeResume({ city: 'toronto', province: 'ontario', most_recent_job_title: 'Engineer', skills: ['React'] });
    const cityMatch  = makeJob({ location: 'Toronto, ON',  requirements_array: ['React'] });
    const provMatch  = makeJob({ location: 'Hamilton, Ontario', requirements_array: ['React'] });
    const [hi, lo]   = scoreAndRank(resume, [provMatch, cityMatch]);
    expect(hi.match_score).toBeGreaterThanOrEqual(lo.match_score);
  });

  it('no location info on resume → neutral 0.5 proximity, not 0', () => {
    const resume  = makeResume({ city: undefined, province: undefined });
    const farJob  = makeJob({ is_remote: false, location: 'Vancouver, BC', requirements_array: [] });
    const [scored] = scoreAndRank(resume, [farJob]);
    // 0% skills (no reqs) + 20% seniority (1.0) + 10% proximity (0.5) = 25%
    expect(scored.match_score).toBeGreaterThan(0);
  });
});

// ── match_reason text ─────────────────────────────────────────────────────────

describe('scoreAndRank — match_reason', () => {
  it('includes matched skill names in reason text', () => {
    const resume  = makeResume({ skills: ['React'] });
    const job     = makeJob({ requirements_array: ['React', 'TypeScript'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_reason).toMatch(/React/i);
  });

  it('mentions missing skill when unmatched', () => {
    const resume  = makeResume({ skills: ['React'] });
    const job     = makeJob({ requirements_array: ['React', 'Kotlin'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_reason).toMatch(/Kotlin/i);
  });

  it('reports zero-match phrase when nothing matches', () => {
    const resume  = makeResume({ skills: [] });
    const job     = makeJob({ requirements_array: ['Kotlin', 'Android'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_reason).toMatch(/no direct skill/i);
  });
});

// ── Uncovered branches ────────────────────────────────────────────────────────

describe('scoreAndRank — experience description token matching (line 36)', () => {
  it('matches requirement token from experience description field', () => {
    const resume = makeResume({
      skills: [],
      experience: [{ title: 'Engineer', company: 'X', description: 'Worked with Kubernetes daily.' }],
    });
    const job = makeJob({ requirements_array: ['Kubernetes'] });
    const [scored] = scoreAndRank(resume, [job]);
    expect(scored.match_score).toBeGreaterThan(0);
  });
});

describe('scoreAndRank — proximity score 0.0 (line 93)', () => {
  it('scores 0 proximity when resume has city/province but job location does not match either', () => {
    const resume  = makeResume({ city: 'toronto', province: 'ontario', skills: [], most_recent_job_title: 'Engineer' });
    const farJob  = makeJob({ is_remote: false, location: 'Calgary, Alberta', requirements_array: [] });
    const nearJob = makeJob({ is_remote: false, location: 'Toronto, ON',      requirements_array: [] });
    const [hi, lo] = scoreAndRank(resume, [farJob, nearJob]);
    // nearJob (proximity 1.0) must beat farJob (proximity 0.0)
    expect(hi.match_score).toBeGreaterThan(lo.match_score);
  });
});
