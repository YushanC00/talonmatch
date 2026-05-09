import { describe, it, expect } from 'vitest';
import { skillMatches, partitionSkills, isNearMe } from './tokenMatcher';

describe('skillMatches — JS/TS abbreviation aliases', () => {
  it('matches JS in resume to JavaScript requirement', () =>
    expect(skillMatches(['JS'], 'JavaScript')).toBe(true));

  it('matches JavaScript in resume to JS requirement', () =>
    expect(skillMatches(['JavaScript'], 'JS')).toBe(true));

  it('matches TS in resume to TypeScript requirement', () =>
    expect(skillMatches(['TS'], 'TypeScript')).toBe(true));

  it('matches TypeScript in resume to TS requirement', () =>
    expect(skillMatches(['TypeScript'], 'TS')).toBe(true));

  it('matches k8s to Kubernetes', () =>
    expect(skillMatches(['k8s'], 'Kubernetes')).toBe(true));

  it('matches pg to PostgreSQL', () =>
    expect(skillMatches(['pg'], 'PostgreSQL')).toBe(true));
});

describe('skillMatches — .js suffix variants (regression)', () => {
  it('matches React to React.js', () =>
    expect(skillMatches(['React'], 'React.js')).toBe(true));

  it('matches React to ReactJS', () =>
    expect(skillMatches(['React'], 'ReactJS')).toBe(true));

  it('matches React.js to React', () =>
    expect(skillMatches(['React.js'], 'React')).toBe(true));

  it('matches Node.js to Node', () =>
    expect(skillMatches(['Node.js'], 'Node')).toBe(true));

  it('matches VueJS to Vue', () =>
    expect(skillMatches(['VueJS'], 'Vue')).toBe(true));
});

describe('skillMatches — slash / pipe tokenization', () => {
  it('matches React from JavaScript/React requirement', () =>
    expect(skillMatches(['React'], 'JavaScript/React')).toBe(true));

  it('matches Python from "Python | Go" requirement', () =>
    expect(skillMatches(['Python'], 'Python | Go')).toBe(true));

  it('does not match Vue when requirement is JavaScript/React', () =>
    expect(skillMatches(['Vue'], 'JavaScript/React')).toBe(false));
});

describe('skillMatches — case insensitive', () => {
  it('handles all-caps resume skill', () =>
    expect(skillMatches(['REACT'], 'react')).toBe(true));
});

describe('skillMatches — no false positives', () => {
  it('returns false for a truly missing skill', () =>
    expect(skillMatches(['React'], 'Kubernetes')).toBe(false));

  it('returns false for empty resume skills', () =>
    expect(skillMatches([], 'React')).toBe(false));
});

describe('partitionSkills — JS alias applied', () => {
  it('moves JavaScript to matched when resume has JS', () => {
    const { matched, missing } = partitionSkills(
      ['JS', 'TypeScript'],
      ['JavaScript', 'Vue', 'TypeScript'],
    );
    expect(matched).toContain('JavaScript');
    expect(matched).toContain('TypeScript');
    expect(missing).toContain('Vue');
    expect(missing).not.toContain('JavaScript');
  });

  it('handles empty requirements array', () => {
    const { matched, missing } = partitionSkills(['React'], []);
    expect(matched).toHaveLength(0);
    expect(missing).toHaveLength(0);
  });

  it('handles null/undefined requirements gracefully', () => {
    // @ts-expect-error intentional null test
    const { matched, missing } = partitionSkills(['React'], null);
    expect(matched).toHaveLength(0);
    expect(missing).toHaveLength(0);
  });
});

describe('isNearMe', () => {
  it('matches when city in job location', () =>
    expect(isNearMe('Vancouver, BC', 'Vancouver, BC')).toBe(true));

  it('returns false when city differs', () =>
    expect(isNearMe('Toronto, ON', 'Vancouver, BC')).toBe(false));

  it('returns false when resume has no location', () =>
    expect(isNearMe('Vancouver, BC', undefined)).toBe(false));

  it('returns false for short city name to avoid false positives', () =>
    expect(isNearMe('ON, Canada', 'ON')).toBe(false));
});
