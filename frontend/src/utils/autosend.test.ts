import { describe, it, expect } from 'vitest';
import { filterAutoQualify, shouldRunNow, DEFAULT_AUTOSEND_SETTINGS } from './autosend';
import type { Job } from '../types';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    job_id: 'job-1',
    job_title: 'Engineer',
    company: 'Acme',
    match_score: 90,
    url: 'https://example.com/apply',
    ...overrides,
  };
}

describe('filterAutoQualify', () => {
  it('returns empty array when jobs list is empty', () => {
    expect(filterAutoQualify([], new Set(), 85)).toEqual([]);
  });

  it('includes jobs at or above the threshold', () => {
    const jobs = [makeJob({ match_score: 85 }), makeJob({ match_score: 90, url: 'https://b.com' })];
    const result = filterAutoQualify(jobs, new Set(), 85);
    expect(result).toHaveLength(2);
  });

  it('excludes jobs below the threshold', () => {
    const jobs = [makeJob({ match_score: 84 })];
    expect(filterAutoQualify(jobs, new Set(), 85)).toHaveLength(0);
  });

  it('excludes jobs without an apply URL', () => {
    const jobs = [makeJob({ url: undefined }), makeJob({ url: '' })];
    expect(filterAutoQualify(jobs, new Set(), 85)).toHaveLength(0);
  });

  it('excludes jobs whose URL is already in the applied set', () => {
    const url = 'https://example.com/apply';
    const jobs = [makeJob({ url })];
    expect(filterAutoQualify(jobs, new Set([url]), 85)).toHaveLength(0);
  });

  it('only includes jobs not in the applied set', () => {
    const applied = 'https://applied.com';
    const fresh   = 'https://fresh.com';
    const jobs    = [makeJob({ url: applied }), makeJob({ url: fresh })];
    const result  = filterAutoQualify(jobs, new Set([applied]), 85);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(fresh);
  });

  it('handles threshold boundary: score equal to threshold is included', () => {
    expect(filterAutoQualify([makeJob({ match_score: 99 })], new Set(), 99)).toHaveLength(1);
  });
});

describe('shouldRunNow', () => {
  it('returns true when never run before', () => {
    expect(shouldRunNow(null, 30)).toBe(true);
  });

  it('returns false when last run was less than interval ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(shouldRunNow(fiveMinutesAgo, 30)).toBe(false);
  });

  it('returns true when last run was exactly the interval ago', () => {
    const exactlyIntervalAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(shouldRunNow(exactlyIntervalAgo, 30)).toBe(true);
  });

  it('returns true when last run was more than interval ago', () => {
    const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(shouldRunNow(longAgo, 30)).toBe(true);
  });
});

describe('DEFAULT_AUTOSEND_SETTINGS', () => {
  it('has expected shape', () => {
    expect(DEFAULT_AUTOSEND_SETTINGS).toMatchObject({
      enabled: false,
      scoreThreshold: 85,
      intervalMinutes: 30,
    });
  });
});
