import { describe, it, expect } from 'vitest';
import { isFresh, sortByFreshnessThenScore, makeFreshnessComparator, filterExpired } from './jobSort';

const MS_DAY = 24 * 60 * 60 * 1000;

function makeJob(overrides: Record<string, unknown>) {
  return { url: 'https://example.com/job/1', match_score: 70, postedAt: null, ...overrides };
}

// ── isFresh ──────────────────────────────────────────────────────────────────

describe('isFresh', () => {
  it('returns true for job posted 1 hour ago', () => {
    const j = makeJob({ postedAt: new Date(Date.now() - MS_DAY / 24).toISOString() });
    expect(isFresh(j)).toBe(true);
  });

  it('returns false for job posted 3 days ago', () => {
    const j = makeJob({ postedAt: new Date(Date.now() - 3 * MS_DAY).toISOString() });
    expect(isFresh(j)).toBe(false);
  });

  it('returns false when postedAt is null', () => {
    expect(isFresh(makeJob({ postedAt: null }))).toBe(false);
  });

  it('returns false when postedAt is invalid date string', () => {
    expect(isFresh(makeJob({ postedAt: 'not-a-date' }))).toBe(false);
  });
});

// ── sortByFreshnessThenScore ──────────────────────────────────────────────────

describe('sortByFreshnessThenScore', () => {
  it('fresh job sorts before older job even when older has higher score', () => {
    const fresh = makeJob({ postedAt: new Date(Date.now() - MS_DAY / 2).toISOString(), match_score: 60 });
    const old   = makeJob({ postedAt: new Date(Date.now() - 4 * MS_DAY).toISOString(), match_score: 95 });
    const sorted = [old, fresh].sort(sortByFreshnessThenScore);
    expect(sorted[0]).toBe(fresh);
  });

  it('within fresh tier, higher match score sorts first', () => {
    const a = makeJob({ postedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), match_score: 80 });
    const b = makeJob({ postedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), match_score: 90 });
    const sorted = [a, b].sort(sortByFreshnessThenScore);
    expect(sorted[0]).toBe(b);
  });

  it('within old tier, higher match score sorts first', () => {
    const a = makeJob({ postedAt: new Date(Date.now() - 5 * MS_DAY).toISOString(), match_score: 70 });
    const b = makeJob({ postedAt: new Date(Date.now() - 6 * MS_DAY).toISOString(), match_score: 85 });
    const sorted = [a, b].sort(sortByFreshnessThenScore);
    expect(sorted[0]).toBe(b);
  });

  it('jobs with no postedAt sort by score in old tier', () => {
    const a = makeJob({ postedAt: null, match_score: 50 });
    const b = makeJob({ postedAt: null, match_score: 80 });
    const sorted = [a, b].sort(sortByFreshnessThenScore);
    expect(sorted[0]).toBe(b);
  });

  it('company sort: within fresh tier sorts alphabetically by company', () => {
    const cmp = makeFreshnessComparator('company');
    const a = makeJob({ postedAt: new Date(Date.now() - 3600 * 1000).toISOString(), company: 'Zebra Inc' });
    const b = makeJob({ postedAt: new Date(Date.now() - 3600 * 1000).toISOString(), company: 'Alpha Co' });
    const sorted = [a, b].sort(cmp);
    expect(sorted[0]).toBe(b);
  });

  it('company sort: fresh tier still sorts above old tier regardless of company name', () => {
    const cmp = makeFreshnessComparator('company');
    const fresh = makeJob({ postedAt: new Date(Date.now() - 3600 * 1000).toISOString(), company: 'Zebra Inc' });
    const old   = makeJob({ postedAt: new Date(Date.now() - 5 * MS_DAY).toISOString(), company: 'Alpha Co' });
    const sorted = [old, fresh].sort(cmp);
    expect(sorted[0]).toBe(fresh);
  });
});

// ── filterExpired ─────────────────────────────────────────────────────────────

describe('filterExpired', () => {
  it('removes job whose url is in expiredUrls set', () => {
    const expired = makeJob({ url: 'https://example.com/dead' });
    const alive   = makeJob({ url: 'https://example.com/alive' });
    const result  = [expired, alive].filter(filterExpired(new Set(['https://example.com/dead'])));
    expect(result).toEqual([alive]);
  });

  it('keeps all jobs when expiredUrls is empty', () => {
    const jobs = [makeJob({ url: 'https://a.com' }), makeJob({ url: 'https://b.com' })];
    expect(jobs.filter(filterExpired(new Set()))).toHaveLength(2);
  });

  it('keeps job with no url (null) — never sent to verify, never removed', () => {
    const noUrl = makeJob({ url: null });
    expect([noUrl].filter(filterExpired(new Set(['https://anything.com'])))).toHaveLength(1);
  });
});
