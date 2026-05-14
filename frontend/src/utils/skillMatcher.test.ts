import { describe, it, expect } from 'vitest';
import { normalizeSkill, skillMatches, partitionSkills, isNearMe } from './skillMatcher';

describe('normalizeSkill', () => {
  it('lowercases', () => {
    expect(normalizeSkill('React')).toBe('react');
  });
  it('strips .js suffix', () => {
    expect(normalizeSkill('React.js')).toBe('react');
  });
  it('strips JS suffix (ReactJS)', () => {
    expect(normalizeSkill('ReactJS')).toBe('react');
  });
  it('strips Node.js', () => {
    expect(normalizeSkill('Node.js')).toBe('node');
  });
  it('strips VueJS', () => {
    expect(normalizeSkill('VueJS')).toBe('vue');
  });
  it('strips AngularJS', () => {
    expect(normalizeSkill('AngularJS')).toBe('angular');
  });
  it('preserves multi-word skills', () => {
    expect(normalizeSkill('Design Systems')).toBe('design systems');
  });
  it('preserves TypeScript (no JS suffix trim)', () => {
    expect(normalizeSkill('TypeScript')).toBe('typescript');
  });
});

describe('skillMatches', () => {
  it('matches React in resume to React.js requirement', () => {
    expect(skillMatches(['React', 'CSS'], 'React.js')).toBe(true);
  });
  it('matches React in resume to ReactJS requirement', () => {
    expect(skillMatches(['React'], 'ReactJS')).toBe(true);
  });
  it('matches React.js in resume to React requirement', () => {
    expect(skillMatches(['React.js'], 'React')).toBe(true);
  });
  it('matches Node.js in resume to Node requirement', () => {
    expect(skillMatches(['Node.js'], 'Node')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(skillMatches(['REACT'], 'react')).toBe(true);
  });
  it('returns false for a truly missing skill', () => {
    expect(skillMatches(['React'], 'Kubernetes')).toBe(false);
  });
  it('returns false for empty resume', () => {
    expect(skillMatches([], 'React')).toBe(false);
  });
});

describe('partitionSkills', () => {
  it('puts React.js in matched when resume has React', () => {
    const { matched, missing } = partitionSkills(['React', 'TypeScript'], ['React.js', 'Vue', 'TypeScript']);
    expect(matched).toContain('React.js');
    expect(matched).toContain('TypeScript');
    expect(missing).toContain('Vue');
    expect(missing).not.toContain('React.js');
  });

  it('handles empty requirements', () => {
    const { matched, missing } = partitionSkills(['React'], []);
    expect(matched).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('handles empty resume skills', () => {
    const { matched, missing } = partitionSkills([], ['React', 'Vue']);
    expect(matched).toEqual([]);
    expect(missing).toEqual(['React', 'Vue']);
  });
});

describe('isNearMe', () => {
  it('matches when city in job location', () => {
    expect(isNearMe('Quebec City, QC', 'Quebec City, QC')).toBe(true);
  });
  it('matches partial city name', () => {
    expect(isNearMe('Toronto, ON, Canada', 'Toronto, ON')).toBe(true);
  });
  it('returns false when city differs', () => {
    expect(isNearMe('Vancouver, BC', 'Toronto, ON')).toBe(false);
  });
  it('returns false when either is empty', () => {
    expect(isNearMe('', 'Toronto, ON')).toBe(false);
    expect(isNearMe('Toronto, ON', '')).toBe(false);
  });
  it('returns false for very short city name (avoids false positives)', () => {
    expect(isNearMe('ON, Canada', 'ON')).toBe(false);
  });
});
