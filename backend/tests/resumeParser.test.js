'use strict';

const {
  parseResume,
  cleanText, splitLines, extractVocabSkills,
  extractLocation, splitLocation,
  parseJobTitle, looksLikeJobTitle,
  extractExperience, extractEducation,
} = require('../resumeParser');

// ── cleanText ──────────────────────────────────────────────────────────────────

describe('cleanText', () => {
  it('strips HTML tags', () => {
    expect(cleanText('<b>Senior</b> Engineer')).not.toContain('<b>');
    expect(cleanText('<b>Senior</b> Engineer')).toContain('Senior');
  });

  it('collapses triple+ spaces to double newline', () => {
    expect(cleanText('line1   line2')).toContain('\n\n');
  });

  it('returns plain text unchanged', () => {
    expect(cleanText('Software Engineer')).toBe('Software Engineer');
  });
});

// ── splitLines ─────────────────────────────────────────────────────────────────

describe('splitLines', () => {
  it('splits on newlines and trims', () => {
    expect(splitLines('  line1  \n line2 \n')).toEqual(['line1', 'line2']);
  });

  it('filters empty lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', 'b']);
  });
});

// ── extractVocabSkills ─────────────────────────────────────────────────────────

describe('extractVocabSkills', () => {
  it('finds skills present in text', () => {
    const skills = extractVocabSkills('Experience with React and Node.js and Docker.');
    expect(skills.some(s => s.toLowerCase() === 'react')).toBe(true);
    expect(skills.some(s => s.toLowerCase() === 'docker')).toBe(true);
  });

  it('is case-insensitive', () => {
    const skills = extractVocabSkills('FIGMA prototyping TYPESCRIPT');
    expect(skills.some(s => s.toLowerCase() === 'figma')).toBe(true);
  });

  it('returns empty array for text with no vocab matches', () => {
    expect(extractVocabSkills('Hello world generic text.')).toEqual([]);
  });

  it('title-cases multi-word skills', () => {
    const skills = extractVocabSkills('design systems and user research');
    expect(skills).toContain('Design Systems');
    expect(skills).toContain('User Research');
  });
});

// ── extractLocation — Home Base Detection ──────────────────────────────────────

describe('extractLocation (Home Base Detection)', () => {
  it('extracts "City, Province" format', () => {
    const lines = ['John Doe', 'Toronto, ON', 'john@example.com'];
    expect(extractLocation(lines)).toBe('Toronto, ON');
  });

  it('extracts "City, Province, Country" format', () => {
    const lines = ['Jane Smith', 'Vancouver, BC, Canada'];
    expect(extractLocation(lines)).toBe('Vancouver, BC, Canada');
  });

  it('extracts bare country name on its own line', () => {
    const lines = ['Dev Name', 'Canada'];
    expect(extractLocation(lines)).toBe('Canada');
  });

  it('extracts "remote" as location', () => {
    const lines = ['Name', 'Remote'];
    expect(extractLocation(lines)).toBe('Remote');
  });

  it('skips email lines', () => {
    const lines = ['dev@example.com', 'Toronto, ON'];
    expect(extractLocation(lines)).toBe('Toronto, ON');
  });

  it('skips lines longer than 80 chars', () => {
    const longLine = 'A'.repeat(81);
    const lines = [longLine, 'Toronto, ON'];
    expect(extractLocation(lines)).toBe('Toronto, ON');
  });

  it('returns empty string when no location found', () => {
    const lines = ['Software Engineer', 'Agile methodology', 'React developer'];
    expect(extractLocation(lines)).toBe('');
  });

  it('skips lines with more than 6 words', () => {
    const lines = ['Experienced software engineer specializing in React and Node.js', 'Vancouver, BC'];
    expect(extractLocation(lines)).toBe('Vancouver, BC');
  });
});

// ── splitLocation ──────────────────────────────────────────────────────────────

describe('splitLocation', () => {
  it('splits "City, Province"', () => {
    expect(splitLocation('Toronto, ON')).toEqual({ city: 'Toronto', province: 'ON' });
  });

  it('returns first part as city when no comma', () => {
    expect(splitLocation('Canada')).toEqual({ city: 'Canada', province: '' });
  });

  it('returns empty strings for empty input', () => {
    expect(splitLocation('')).toEqual({ city: '', province: '' });
  });

  it('returns empty strings for null/undefined', () => {
    expect(splitLocation(null)).toEqual({ city: '', province: '' });
  });
});

// ── parseJobTitle ──────────────────────────────────────────────────────────────

describe('parseJobTitle', () => {
  it('strips date ranges from title line', () => {
    const result = parseJobTitle('Senior Designer / Jan 2020 – Present');
    expect(result).not.toMatch(/jan|2020|present/i);
    expect(result.toLowerCase()).toContain('senior designer');
  });

  it('takes portion before separator', () => {
    const result = parseJobTitle('UX Lead | Acme Corp');
    expect(result).toBe('UX Lead');
  });

  it('strips trailing punctuation', () => {
    expect(parseJobTitle('Software Engineer,')).toBe('Software Engineer');
  });

  it('handles plain title with no separators', () => {
    expect(parseJobTitle('Product Manager')).toBe('Product Manager');
  });
});

// ── looksLikeJobTitle ──────────────────────────────────────────────────────────

describe('looksLikeJobTitle', () => {
  it('returns true for a standard job title', () => {
    expect(looksLikeJobTitle('Senior Software Engineer')).toBe(true);
  });

  it('returns true for title with date range', () => {
    expect(looksLikeJobTitle('UX Designer / Jan 2021 – Present')).toBe(true);
  });

  it('returns false for bullet lines', () => {
    expect(looksLikeJobTitle('• Built API endpoints for the platform')).toBe(false);
  });

  it('returns false for action-verb sentences', () => {
    expect(looksLikeJobTitle('Led a team of 5 engineers')).toBe(false);
  });

  it('returns false for location lines', () => {
    expect(looksLikeJobTitle('Toronto, Canada')).toBe(false);
  });

  it('returns false for lines starting with lowercase', () => {
    expect(looksLikeJobTitle('built scalable systems')).toBe(false);
  });

  it('returns false for very short lines', () => {
    expect(looksLikeJobTitle('Dev')).toBe(false);
  });
});

// ── extractExperience ──────────────────────────────────────────────────────────

describe('extractExperience', () => {
  it('extracts a single job entry', () => {
    const lines = [
      'Senior Engineer',
      'Built scalable APIs',
      'Used React and Node.js',
    ];
    const exp = extractExperience(lines);
    expect(exp).toHaveLength(1);
    expect(exp[0].title).toContain('Engineer');
  });

  it('extracts multiple job entries', () => {
    const lines = [
      'Senior Engineer',
      'Built APIs.',
      'UX Designer',
      'Designed wireframes.',
    ];
    const exp = extractExperience(lines);
    expect(exp.length).toBeGreaterThanOrEqual(2);
  });

  it('accumulates description lines under each job', () => {
    const lines = [
      'Product Manager',
      'Owned the product roadmap.',
      'Led cross-functional teams.',
    ];
    const [entry] = extractExperience(lines);
    expect(entry.description).toContain('roadmap');
  });

  it('returns empty array for lines with no job titles', () => {
    const lines = ['Built things.', 'managed projects.', 'worked on stuff.'];
    expect(extractExperience(lines)).toHaveLength(0);
  });
});

// ── extractEducation ───────────────────────────────────────────────────────────

describe('extractEducation', () => {
  it('extracts a degree entry', () => {
    const lines = ['Bachelor of Science in Computer Science — University of Toronto 2019'];
    const edu = extractEducation(lines);
    expect(edu).toHaveLength(1);
    expect(edu[0].degree).toMatch(/bachelor/i);
  });

  it('extracts institution line', () => {
    const lines = ['University of British Columbia', 'Computer Science'];
    const edu = extractEducation(lines);
    expect(edu).toHaveLength(1);
    expect(edu[0].institution).toContain('University');
  });

  it('extracts graduation year', () => {
    const lines = ['Master of Science — McGill University 2022'];
    const [entry] = extractEducation(lines);
    expect(entry.year).toBe('2022');
  });

  it('returns empty array when no education lines', () => {
    expect(extractEducation(['Built things.', 'React developer.'])).toHaveLength(0);
  });
});

// ── parseResume (integration) ──────────────────────────────────────────────────

describe('parseResume', () => {
  const SAMPLE = `
John Doe
Toronto, ON
john@example.com

Skills
React, TypeScript, Node.js, Figma, Docker

Experience
Senior Frontend Engineer
Acme Corp | Jan 2021 – Present
Built scalable React components. Led performance optimization.

UX Designer
Beta Studio | Mar 2019 – Dec 2020
Designed wireframes and prototypes. Conducted user research.

Education
Bachelor of Science — University of Toronto 2018
Computer Science
  `.trim();

  let result;
  beforeAll(() => { result = parseResume(SAMPLE); });

  it('extracts skills', () => {
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.some(s => s.toLowerCase() === 'react')).toBe(true);
  });

  it('extracts location and splits into city + province', () => {
    expect(result.location).toContain('Toronto');
    expect(result.city).toBe('Toronto');
    expect(result.province).toBe('ON');
  });

  it('extracts most_recent_job_title', () => {
    expect(result.most_recent_job_title).toMatch(/engineer|designer/i);
  });

  it('extracts all_job_titles array', () => {
    expect(result.all_job_titles.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts experience entries', () => {
    expect(result.experience.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts education entry', () => {
    expect(result.education.length).toBeGreaterThanOrEqual(1);
    expect(result.education[0].year).toBe('2018');
  });

  it('strips HTML before parsing', () => {
    const r = parseResume('<b>React</b> developer\nToronto, ON');
    expect(r.skills.some(s => s.toLowerCase() === 'react')).toBe(true);
  });
});
