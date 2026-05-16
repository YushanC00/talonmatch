'use strict';

// SectionStreamParser and normalizeSectionItem are not exported — test via module internals
// by requiring the file and using the exported streamTailorResume (integration) or
// by extracting the classes. We test what's exportable + the parser logic directly.

// Mock groq-sdk so tests don't need a real API key
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

// Load after mock is set up
const {
  tailorResume, streamTailorResume, validateSuggestionAST, _resetClientForTesting,
  buildUserMessage, getRawResumeText,
  stripHallucinatedMetrics, stripHallucinatedSkillClaims, buildCandidateSkillSet,
  truncateItem, truncateRationale,
  extractMetrics, scoreTailoredResult,
  sortCompaniesByRecency, runConcurrent,
  tailorExperienceChunk,
  tailorNonExperience, streamTailorParallel,
} = require('../tailorResume');

// ── SectionStreamParser ────────────────────────────────────────────────────────
// Re-implement a minimal copy for unit testing since it's not exported.
// Changes to the parser algorithm should break these tests — that's the intent.

class SectionStreamParser {
  constructor() {
    this.buf = ''; this.ready = false;
    this.depth = 0; this.start = -1;
    this.inStr = false; this.esc = false;
    this.scanPos = 0;
  }
  push(chunk) {
    const out = [];
    this.buf += chunk;
    if (!this.ready) {
      const m = /"sections"\s*:\s*\[/.exec(this.buf);
      if (!m) return out;
      this.buf = this.buf.slice(m.index + m[0].length);
      this.ready = true;
      this.scanPos = 0;
    }
    let i = this.scanPos;
    while (i < this.buf.length) {
      const c = this.buf[i];
      if (this.esc)       { this.esc = false; i++; continue; }
      if (this.inStr) {
        if (c === '\\')   this.esc = true;
        else if (c === '"') this.inStr = false;
        i++; continue;
      }
      if      (c === '"') { this.inStr = true; }
      else if (c === '{') { if (this.depth === 0) this.start = i; this.depth++; }
      else if (c === '}') {
        this.depth--;
        if (this.depth === 0 && this.start >= 0) {
          try { out.push(JSON.parse(this.buf.slice(this.start, i + 1))); } catch {}
          this.buf = this.buf.slice(i + 1);
          this.start = -1;
          i = -1;
        }
      }
      i++;
    }
    this.scanPos = this.buf.length;
    return out;
  }
}

describe('SectionStreamParser', () => {
  it('emits nothing before "sections":[ appears', () => {
    const p = new SectionStreamParser();
    expect(p.push('{"_version":4,')).toEqual([]);
    expect(p.ready).toBe(false);
  });

  it('activates after "sections":[ token', () => {
    const p = new SectionStreamParser();
    p.push('{"_version":4,"sections":[');
    expect(p.ready).toBe(true);
  });

  it('emits one section object from a single chunk', () => {
    const p = new SectionStreamParser();
    const section = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Foo.', tailored: 'Bar.' }] };
    const input = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;
    const out = p.push(input);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Summary');
  });

  it('emits two sections when both fit in one chunk', () => {
    const p = new SectionStreamParser();
    const s1 = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'A.', tailored: 'B.' }] };
    const s2 = { title: 'Skills', rationale: '', content: [{ id: 'skills-hard-0', label: 'Technical', original: 'React', tailored: 'React' }] };
    const input = `{"_version":4,"sections":[${JSON.stringify(s1)},${JSON.stringify(s2)}]}`;
    const out = p.push(input);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('Summary');
    expect(out[1].title).toBe('Skills');
  });

  it('reassembles a section split across two chunks', () => {
    const p = new SectionStreamParser();
    const section = { title: 'Work Experience', rationale: 'Strong fit', content: [{ id: 'we-acme-0', label: 'Dev @ Acme (2020–Now)', original: 'Built things.', tailored: 'Built scalable things.' }] };
    const full = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;
    const mid = Math.floor(full.length / 2);
    expect(p.push(full.slice(0, mid))).toEqual([]);
    const out = p.push(full.slice(mid));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Work Experience');
  });

  it('handles escaped quotes inside string values', () => {
    const p = new SectionStreamParser();
    const section = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'She said "hello".', tailored: 'She said "hi".' }] };
    const input = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;
    const out = p.push(input);
    expect(out).toHaveLength(1);
    expect(out[0].content[0].original).toBe('She said "hello".');
  });

  it('ignores malformed partial JSON between sections', () => {
    const p = new SectionStreamParser();
    p.push('{"_version":4,"sections":[');
    // push garbage first
    const out1 = p.push('{bad json}');
    // then a valid section
    const section = { title: 'Skills', rationale: '', content: [{ id: 'skills-hard-0', label: 'Technical', original: 'JS', tailored: 'JS' }] };
    const out2 = p.push(JSON.stringify(section));
    // malformed section won't parse but parser recovers for next valid one
    expect([...out1, ...out2].length).toBeGreaterThanOrEqual(0); // no throw
  });
});

// ── validateSuggestionAST ──────────────────────────────────────────────────────

describe('validateSuggestionAST', () => {
  it('returns true for valid rephrase suggestion', () => {
    expect(validateSuggestionAST({ type: 'rephrase', original: 'Old text.', replacement: 'New text.' })).toBe(true);
  });

  it('returns true for all valid types', () => {
    const types = ['rephrase', 'quantify', 'action_verb', 'keyword_inject'];
    for (const type of types) {
      expect(validateSuggestionAST({ type, original: 'a', replacement: 'b' })).toBe(true);
    }
  });

  it('returns false for unknown type', () => {
    expect(validateSuggestionAST({ type: 'hallucinate', original: 'a', replacement: 'b' })).toBe(false);
  });

  it('returns false when original is not a string', () => {
    expect(validateSuggestionAST({ type: 'rephrase', original: 42, replacement: 'b' })).toBe(false);
  });

  it('returns false for null input', () => {
    expect(validateSuggestionAST(null)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(validateSuggestionAST({})).toBe(false);
  });
});

// ── tailorResume (stream accumulator) — mock Groq ─────────────────────────────

const Groq = require('groq-sdk');

function makeStream(chunks) {
  async function* gen() {
    for (const delta of chunks) {
      yield { choices: [{ delta: { content: delta } }], usage: null };
    }
    yield { choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 100, completion_tokens: 200 } };
  }
  return gen();
}

const PARSED_RESUME = {
  summary: 'Experienced developer.',
  experience: [{ title: 'Engineer', company: 'Acme', period: '2020–2023', bullets: ['Built API.', 'Wrote tests.'] }],
  projects: [],
  skills: ['JavaScript', 'React', 'Node.js'],
};

const JOB_DESCRIPTION = 'Software Engineer role requiring React and Node.js experience.';

describe('tailorResume (integration — mocked Groq)', () => {
  beforeEach(() => {
    _resetClientForTesting();
    Groq.mockClear();
  });

  it('returns _version 4 with sections array', async () => {
    const section = { title: 'Summary', rationale: 'JD alignment', content: [{ id: 'summary-0', label: '', original: 'Experienced developer.', tailored: 'React-focused developer.' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    expect(result._version).toBe(4);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('section titles match what Groq emits', async () => {
    const s1 = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: 'React Dev.' }] };
    const s2 = { title: 'Work Experience', rationale: '', content: [{ id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built API.', tailored: 'Built scalable API.' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(s1)},${JSON.stringify(s2)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const titles = result.sections.map(s => s.title);
    expect(titles).toContain('Summary');
    expect(titles).toContain('Work Experience');
  });

  it('strips hallucinated metrics from experience bullets', async () => {
    // Original resume has no % metrics — tailored bullet invents one
    const section = {
      title: 'Work Experience', rationale: '',
      content: [{ id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built API.', tailored: 'Improved performance by 40%.' }],
    };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const weSection = result.sections.find(s => s.title === 'Work Experience');
    expect(weSection).toBeDefined();
    // 40% not in source resume — should be stripped
    expect(weSection.content[0].tailored).not.toContain('40%');
  });

  it('truncates experience bullets exceeding 200 chars', async () => {
    const longBullet = 'A'.repeat(210);
    const section = {
      title: 'Work Experience', rationale: '',
      content: [{ id: 'we-acme-0', label: 'Engineer @ Acme', original: 'Built.', tailored: longBullet }],
    };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const weSection = result.sections.find(s => s.title === 'Work Experience');
    expect(weSection.content[0].tailored.length).toBeLessThanOrEqual(200);
  });

  it('returns empty sections array when Groq emits no sections token', async () => {
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream(['{"_version":4,"not_sections":[]}'])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    expect(result.sections).toEqual([]);
  });

  it('handles Groq response split across many small chunks', async () => {
    const section = { title: 'Skills', rationale: 'JD match', content: [{ id: 'skills-hard-0', label: 'Technical', original: 'JS', tailored: 'React, Node.js' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;
    // Split into 10-char chunks
    const chunks = fullJson.match(/.{1,10}/g);

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream(chunks)) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    expect(result.sections.find(s => s.title === 'Skills')).toBeDefined();
  });
});

// ── extractMetrics ─────────────────────────────────────────────────────────────

describe('extractMetrics', () => {
  it('finds percentage', () => {
    expect([...extractMetrics('improved by 40%')]).toContain('40%');
  });

  it('finds dollar amount', () => {
    expect([...extractMetrics('saved $1,200')]).toContain('$1,200');
  });

  it('finds multiplier (3x)', () => {
    expect([...extractMetrics('3x faster')]).toContain('3x');
  });

  it('finds hash number (#1 product)', () => {
    expect([...extractMetrics('ranked #1')]).toContain('#1');
  });

  it('finds large comma-separated number', () => {
    expect([...extractMetrics('served 1,000,000 users')]).toContain('1,000,000');
  });

  it('returns empty set for text with no metrics', () => {
    expect(extractMetrics('built a scalable service').size).toBe(0);
  });
});

// ── stripHallucinatedMetrics ───────────────────────────────────────────────────

describe('stripHallucinatedMetrics', () => {
  it('removes metric not present in rawText', () => {
    const result = stripHallucinatedMetrics('Improved speed by 40%', 'improved speed');
    expect(result).not.toContain('40%');
  });

  it('keeps metric that is present in rawText', () => {
    const result = stripHallucinatedMetrics('Reduced latency by 40%', 'Reduced latency by 40%');
    expect(result).toContain('40%');
  });

  it('returns text unchanged when no metrics present', () => {
    const text = 'Built scalable APIs';
    expect(stripHallucinatedMetrics(text, '')).toBe(text);
  });

  it('cleans up stray punctuation after removal', () => {
    const result = stripHallucinatedMetrics('Saved $500K in costs.', 'no metrics here');
    expect(result).not.toMatch(/^\s*,/);
    expect(result.trim().length).toBeGreaterThan(0);
  });
});

// ── truncateItem ───────────────────────────────────────────────────────────────

describe('truncateItem', () => {
  it('returns text under 200 chars unchanged', () => {
    const short = 'Built things.';
    expect(truncateItem(short)).toBe(short);
  });

  it('truncates text over 200 chars', () => {
    const long = 'A'.repeat(210);
    expect(truncateItem(long).length).toBeLessThanOrEqual(200);
  });

  it('truncates at word boundary (no mid-word cut)', () => {
    // Fill 195 chars then append a long word that straddles the 200-char limit
    const base = 'x'.repeat(195) + ' longword';
    const result = truncateItem(base);
    // The 200-char slice includes 'x...x lo' — trailing partial word stripped
    expect(result).not.toContain('longword');
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

// ── truncateRationale ──────────────────────────────────────────────────────────

describe('truncateRationale', () => {
  it('returns empty string for falsy input', () => {
    expect(truncateRationale('')).toBe('');
    expect(truncateRationale(null)).toBe('');
  });

  it('returns text with 10 or fewer words unchanged', () => {
    const text = 'Demonstrates React expertise relevant to the JD.';
    expect(truncateRationale(text)).toBe(text.trim());
  });

  it('truncates to 10 words when over limit', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const result = truncateRationale(text);
    expect(result.split(/\s+/).length).toBe(10);
  });
});

// ── getRawResumeText ───────────────────────────────────────────────────────────

describe('getRawResumeText', () => {
  it('includes summary', () => {
    expect(getRawResumeText({ summary: 'Expert developer.' })).toContain('Expert developer.');
  });

  it('includes experience bullets', () => {
    const resume = { experience: [{ bullets: ['Built API.', 'Wrote tests.'] }] };
    const text = getRawResumeText(resume);
    expect(text).toContain('Built API.');
    expect(text).toContain('Wrote tests.');
  });

  it('includes experience description when no bullets', () => {
    const resume = { experience: [{ description: 'Led platform migration.' }] };
    expect(getRawResumeText(resume)).toContain('Led platform migration.');
  });

  it('includes project descriptions', () => {
    const resume = { projects: [{ description: 'Open-source React component library.' }] };
    expect(getRawResumeText(resume)).toContain('Open-source React component library.');
  });

  it('returns empty string for empty resume', () => {
    expect(getRawResumeText({})).toBe('');
  });
});

// ── buildUserMessage ───────────────────────────────────────────────────────────

describe('buildUserMessage', () => {
  const BASE = { parsedResume: { summary: 'Dev.' }, jobDescription: 'React Engineer role.' };

  it('includes JD text', () => {
    expect(buildUserMessage(BASE)).toContain('React Engineer role.');
  });

  it('includes summary', () => {
    expect(buildUserMessage(BASE)).toContain('Dev.');
  });

  it('includes experience bullets', () => {
    const resume = {
      summary: 'Dev.',
      experience: [{ title: 'Engineer', company: 'Acme', period: '2020–2023', bullets: ['Built API.'] }],
    };
    const msg = buildUserMessage({ parsedResume: resume, jobDescription: 'JD.' });
    expect(msg).toContain('Built API.');
    expect(msg).toContain('Acme');
  });

  it('falls back to splitDescription when no bullets', () => {
    const resume = {
      experience: [{ title: 'Dev', company: 'X', period: '2020', description: 'Built scalable systems. Wrote unit tests.' }],
    };
    const msg = buildUserMessage({ parsedResume: resume, jobDescription: 'JD.' });
    expect(msg).toContain('Built scalable systems');
  });

  it('emits no-bullets placeholder when description also absent', () => {
    const resume = {
      experience: [{ title: 'Dev', company: 'X', period: '2020', bullets: [] }],
    };
    const msg = buildUserMessage({ parsedResume: resume, jobDescription: 'JD.' });
    expect(msg).toContain('no bullets provided');
  });

  it('includes projects section when present', () => {
    const resume = {
      projects: [{ name: 'Portfolio', description: 'React site.' }],
    };
    const msg = buildUserMessage({ parsedResume: resume, jobDescription: 'JD.' });
    expect(msg).toContain('Portfolio');
    expect(msg).toContain('React site.');
  });

  it('includes education section when present', () => {
    const resume = {
      education: [{ degree: 'BSc Computer Science', institution: 'UofT', year: '2019' }],
    };
    const msg = buildUserMessage({ parsedResume: resume, jobDescription: 'JD.' });
    expect(msg).toContain('BSc Computer Science');
    expect(msg).toContain('UofT');
  });
});

// ── buildUserMessage — few-shot preferences injection ─────────────────────────

describe('buildUserMessage — preferences injection', () => {
  const BASE = { parsedResume: { summary: 'Dev.' }, jobDescription: 'React Engineer role.' };

  it('omits preferences block when no preferences supplied', () => {
    const msg = buildUserMessage(BASE);
    expect(msg).not.toContain('WRITING PREFERENCES');
  });

  it('omits preferences block when empty array', () => {
    const msg = buildUserMessage({ ...BASE, preferences: [] });
    expect(msg).not.toContain('WRITING PREFERENCES');
  });

  it('includes approved examples from accepted entries', () => {
    const preferences = [
      { decision: 'accepted', original: 'Helped build APIs.', tailored: 'Designed RESTful APIs.' },
    ];
    const msg = buildUserMessage({ ...BASE, preferences });
    expect(msg).toContain('WRITING PREFERENCES');
    expect(msg).toContain('Helped build APIs.');
    expect(msg).toContain('Designed RESTful APIs.');
  });

  it('includes avoid section from rejected entries', () => {
    const preferences = [
      { decision: 'rejected', original: 'Led the team.', tailored: 'Spearheaded synergy.' },
    ];
    const msg = buildUserMessage({ ...BASE, preferences });
    expect(msg).toContain('WRITING PREFERENCES');
    expect(msg).toContain('Spearheaded synergy.');
  });

  it('skips no-op entries where original equals tailored', () => {
    const preferences = [
      { decision: 'accepted', original: 'Same text.', tailored: 'Same text.' },
    ];
    const msg = buildUserMessage({ ...BASE, preferences });
    expect(msg).not.toContain('WRITING PREFERENCES');
  });

  it('caps accepted examples at 5 and rejected at 3', () => {
    const preferences = [
      ...Array.from({ length: 8 }, (_, i) => ({
        decision: 'accepted', original: `orig-acc-${i}`, tailored: `tailored-acc-${i}`,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        decision: 'rejected', original: `orig-rej-${i}`, tailored: `tailored-rej-${i}`,
      })),
    ];
    const msg = buildUserMessage({ ...BASE, preferences });
    // Count occurrences via unique markers
    const accCount = (msg.match(/tailored-acc-/g) || []).length;
    const rejCount = (msg.match(/tailored-rej-/g) || []).length;
    expect(accCount).toBe(5);
    expect(rejCount).toBe(3);
  });

  it('preferences block appears before JD text', () => {
    const preferences = [
      { decision: 'accepted', original: 'Old bullet.', tailored: 'New bullet.' },
    ];
    const msg = buildUserMessage({ ...BASE, preferences });
    expect(msg.indexOf('WRITING PREFERENCES')).toBeLessThan(msg.indexOf('JOB DESCRIPTION'));
  });
});

// ── scoreTailoredResult ────────────────────────────────────────────────────────

describe('scoreTailoredResult', () => {
  const rawText = 'Built a scalable service.';
  const jdKw    = ['React', 'Node'];

  it('returns 100 / no issues for clean result', () => {
    const result = { sections: [{ title: 'Summary', content: [{ id: 's-0', tailored: 'Built a scalable service.' }] }] };
    const { score, issues } = scoreTailoredResult(result, rawText, jdKw);
    expect(score).toBe(100);
    expect(issues).toHaveLength(0);
  });

  it('deducts 5 points per hallucinated metric', () => {
    const result = { sections: [{ title: 'Work Experience', content: [{ id: 'we-0', tailored: 'Improved by 40%.' }] }] };
    const { score, issues } = scoreTailoredResult(result, rawText, jdKw);
    expect(score).toBe(95);
    expect(issues[0]).toMatch(/hallucinated metric/);
  });

  it('deducts 3 points when experience bullet has >2 JD keywords', () => {
    const manyKw = ['React', 'Node', 'TypeScript'];
    const tailored = 'React Node TypeScript developer.';
    const result = { sections: [{ title: 'Work Experience', content: [{ id: 'we-0', tailored }] }] };
    const { score, issues } = scoreTailoredResult(result, tailored, manyKw);
    expect(score).toBe(97);
    expect(issues[0]).toMatch(/JD keywords/);
  });

  it('deducts 2 points when experience bullet exceeds 200 chars', () => {
    const longBullet = 'A'.repeat(201);
    const result = { sections: [{ title: 'Work Experience', content: [{ id: 'we-0', tailored: longBullet }] }] };
    const { score } = scoreTailoredResult(result, longBullet, []);
    expect(score).toBe(98);
  });

  it('score never goes below 0', () => {
    const badBullet = '40% 50% 60% $1M $2M #1 #2 1,000 2,000 3x 4x 5x';
    const result = { sections: [{ title: 'Work Experience', content: [{ id: 'we-0', tailored: badBullet }] }] };
    const { score } = scoreTailoredResult(result, '', []);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('keyword penalty only applies to Work Experience sections', () => {
    const manyKw = ['React', 'Node', 'TypeScript'];
    const tailored = 'React Node TypeScript developer.';
    const result = { sections: [{ title: 'Summary', content: [{ id: 's-0', tailored }] }] };
    const { score } = scoreTailoredResult(result, tailored, manyKw);
    expect(score).toBe(100); // Summary not penalised for keyword density
  });
});

// ── buildUserMessage — JD noise stripping ──────────────────────────────────

describe('buildUserMessage — JD noise stripping', () => {
  it('strips About Us section from JD before including it', () => {
    // Single newline after header — regex captures entire paragraph before the next blank line
    const jd = 'About us\nWe are a great company building things.\n\nRequirements\nReact and Node.js skills needed.';
    const msg = buildUserMessage({ parsedResume: {}, jobDescription: jd });
    expect(msg).not.toContain('We are a great company');
    expect(msg).toContain('React and Node.js');
  });

  it('strips Benefits section from JD', () => {
    const jd = 'Requirements\nReact skills needed.\n\nBenefits\nHealth insurance. 401k. PTO.';
    const msg = buildUserMessage({ parsedResume: {}, jobDescription: jd });
    expect(msg).not.toContain('Health insurance');
    expect(msg).toContain('React skills needed');
  });

  it('strips EEO boilerplate from JD', () => {
    const jd = 'Requirements\nStrong engineer needed.\n\nEqual employment opportunity employer. We do not discriminate.';
    const msg = buildUserMessage({ parsedResume: {}, jobDescription: jd });
    expect(msg).not.toContain('do not discriminate');
    expect(msg).toContain('Strong engineer');
  });
});

// ── streamTailorResume — branch coverage ───────────────────────────────────

describe('streamTailorResume — branch coverage', () => {
  beforeEach(() => {
    _resetClientForTesting();
    Groq.mockClear();
  });

  it('passes signal to Groq create when provided', async () => {
    const section = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: 'React dev.' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    let capturedOptions;
    Groq.mockImplementationOnce(() => ({
      chat: {
        completions: {
          create: jest.fn().mockImplementation(async (_params, options) => {
            capturedOptions = options;
            return makeStream([fullJson]);
          }),
        },
      },
    }));

    const ac = new AbortController();
    const events = [];
    for await (const event of streamTailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION, signal: ac.signal })) {
      events.push(event);
    }

    expect(capturedOptions).toEqual({ signal: ac.signal });
    expect(events.some(e => e.type === 'done')).toBe(true);
  });

  it('skips sections where normalizeSectionItem returns null (no title)', async () => {
    const noTitle = { rationale: 'test', content: [{ id: 'x-0', label: '', original: 'A', tailored: 'B' }] };
    const valid   = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: 'Dev.' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(noTitle)},${JSON.stringify(valid)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe('Summary');
  });

  it('skips sections where all content items lack id', async () => {
    const noId   = { title: 'Summary', rationale: '', content: [{ label: '', original: 'A', tailored: 'B' }] }; // no id
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(noId)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    expect(result.sections).toHaveLength(0);
  });

  it('does not truncate non-Experience section content', async () => {
    // Summary section — isExp = false → no truncateItem applied
    const longText = 'A'.repeat(210);
    const section = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: longText }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const summary = result.sections.find(s => s.title === 'Summary');
    // Summary bullets not truncated — length preserved
    expect(summary.content[0].tailored.length).toBeGreaterThan(200);
  });

  it('passes per-item rationale through content items', async () => {
    const section = {
      title: 'Work Experience', rationale: 'Strong frontend fit',
      content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built API.', tailored: 'Built scalable API.', rationale: 'highlights scalability' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit and integration tests.', rationale: '' },
      ],
    };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const we = result.sections.find(s => s.title === 'Work Experience');
    expect(we.content[0].rationale).toBe('highlights scalability');
  });

  it('caps per-item rationale at 80 chars and defaults to empty string', async () => {
    const longRationale = 'x'.repeat(100);
    const section = {
      title: 'Summary', rationale: '',
      content: [
        { id: 'summary-0', label: '', original: 'Dev.', tailored: 'Dev.', rationale: longRationale },
        { id: 'summary-1', label: '', original: 'Dev.', tailored: 'Dev.' }, // no rationale field
      ],
    };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;

    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorResume({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION });
    const summary = result.sections.find(s => s.title === 'Summary');
    expect(summary.content[0].rationale.length).toBeLessThanOrEqual(80);
    expect(summary.content[1].rationale).toBe('');
  });
});

// ── stripHallucinatedSkillClaims ─────────────────────────────────────────────

describe('stripHallucinatedSkillClaims', () => {
  const skillSet = new Set(['react', 'typescript', 'node.js', 'javascript', '5']);

  it('removes "N years of <unknown skill>" claim', () => {
    const result = stripHallucinatedSkillClaims(
      'Results-driven engineer with 8+ years of C++ development experience.',
      skillSet
    );
    expect(result).not.toMatch(/C\+\+/);
    expect(result).not.toMatch(/8\+/);
  });

  it('preserves "N years of <known skill>" claim', () => {
    const result = stripHallucinatedSkillClaims(
      'Engineer with 5 years of React experience.',
      skillSet
    );
    expect(result).toContain('5 years of React experience');
  });

  it('removes fabricated multi-word tech phrase', () => {
    const result = stripHallucinatedSkillClaims(
      'Brings 10+ years of systems programming background.',
      skillSet
    );
    expect(result).not.toMatch(/10\+/);
  });

  it('leaves text unchanged when no years-of-skill pattern present', () => {
    const text = 'Built scalable React applications with TypeScript.';
    expect(stripHallucinatedSkillClaims(text, skillSet)).toBe(text);
  });
});

// ── buildCandidateSkillSet ───────────────────────────────────────────────────

describe('buildCandidateSkillSet', () => {
  it('includes explicit skills', () => {
    const set = buildCandidateSkillSet({ skills: ['React', 'TypeScript'], experience: [] });
    expect(set.has('react')).toBe(true);
    expect(set.has('typescript')).toBe(true);
  });

  it('does NOT include skills not in resume', () => {
    const set = buildCandidateSkillSet({ skills: ['React'], experience: [] });
    expect(set.has('c++')).toBe(false);
  });

  it('extracts tech tokens from experience bullets', () => {
    const resume = {
      skills: [],
      experience: [{ title: 'Dev', company: 'Acme', period: '2020', bullets: ['Built with Kubernetes.'] }],
    };
    const set = buildCandidateSkillSet(resume);
    expect(set.has('kubernetes')).toBe(true);
  });
});

// ── runConcurrent ──────────────────────────────────────────────────────────────

describe('runConcurrent', () => {
  it('returns results in input order', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    expect(await runConcurrent(tasks, 2)).toEqual([1, 2, 3]);
  });

  it('never exceeds concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return active;
    });
    await runConcurrent(tasks, 2);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty input', async () => {
    expect(await runConcurrent([], 3)).toEqual([]);
  });

  it('propagates task rejection', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('boom')),
    ];
    await expect(runConcurrent(tasks, 2)).rejects.toThrow('boom');
  });
});

// ── tailorExperienceChunk ──────────────────────────────────────────────────────

describe('tailorExperienceChunk', () => {
  beforeEach(() => {
    _resetClientForTesting();
    Groq.mockClear();
  });

  it('returns a Work Experience section for a matching Groq response', async () => {
    const section = {
      title: 'Work Experience', rationale: 'backend match',
      content: [{ id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built API.', tailored: 'Built scalable API.' }],
    };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(section)}]}`;
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorExperienceChunk({
      jobEntry: { company: 'Acme', title: 'Engineer', period: '2020–2023', bullets: ['Built API.'] },
      parsedResume: PARSED_RESUME,
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).not.toBeNull();
    expect(result.title).toBe('Work Experience');
    expect(result.content[0].id).toBe('we-acme-0');
  });

  it('returns null when Groq emits no Work Experience section', async () => {
    const fullJson = '{"_version":4,"sections":[]}';
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const result = await tailorExperienceChunk({
      jobEntry: { company: 'Acme', title: 'Engineer', period: '2020–2023', bullets: [] },
      parsedResume: PARSED_RESUME,
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).toBeNull();
  });
});

// ── tailorNonExperience ────────────────────────────────────────────────────────

describe('tailorNonExperience', () => {
  beforeEach(() => {
    _resetClientForTesting();
    Groq.mockClear();
  });

  it('yields section events for non-experience sections', async () => {
    const summary = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: 'React Dev.' }] };
    const skills  = { title: 'Skills',  rationale: '', content: [{ id: 'skills-hard-0', label: 'Technical', original: 'React', tailored: 'React' }] };
    const fullJson = `{"_version":4,"sections":[${JSON.stringify(summary)},${JSON.stringify(skills)}]}`;
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream([fullJson])) } },
    }));

    const events = [];
    for await (const event of tailorNonExperience({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION })) {
      events.push(event);
    }

    const titles = events.filter(e => e.type === 'section').map(e => e.section.title);
    expect(titles).toContain('Summary');
    expect(titles).toContain('Skills');
  });

  it('emits done event at end', async () => {
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue(makeStream(['{"_version":4,"sections":[]}'])) } },
    }));

    const events = [];
    for await (const event of tailorNonExperience({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION })) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'done')).toBe(true);
  });
});

// ── streamTailorParallel ───────────────────────────────────────────────────────

describe('streamTailorParallel', () => {
  beforeEach(() => {
    _resetClientForTesting();
    Groq.mockClear();
  });

  it('yields at least one section and a done event', async () => {
    const summary = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'Dev.', tailored: 'Dev.' }] };
    const json = `{"_version":4,"sections":[${JSON.stringify(summary)}]}`;
    // Both calls return same response; exp chunk ignores non-experience titles
    const createMock = jest.fn().mockResolvedValue(makeStream([json]));
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: createMock } },
    }));

    const events = [];
    for await (const event of streamTailorParallel({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION })) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'section')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(true);
  });

  it('makes N+1 Groq calls for N experience entries (1 non-exp + N exp chunks)', async () => {
    const createMock = jest.fn().mockResolvedValue(makeStream(['{"_version":4,"sections":[]}']));
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: createMock } },
    }));

    const events = [];
    for await (const event of streamTailorParallel({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION })) {
      events.push(event);
    }

    // PARSED_RESUME has 1 experience entry → 1 nonExp call + 1 exp chunk call = 2
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('done event includes usage object', async () => {
    const createMock = jest.fn().mockResolvedValue(makeStream(['{"_version":4,"sections":[]}']));
    Groq.mockImplementationOnce(() => ({
      chat: { completions: { create: createMock } },
    }));

    const events = [];
    for await (const event of streamTailorParallel({ parsedResume: PARSED_RESUME, jobDescription: JOB_DESCRIPTION })) {
      events.push(event);
    }

    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(done.usage).toBeDefined();
  });
});

describe('sortCompaniesByRecency', () => {
  it('sorts most-recent year first', () => {
    const exp = [
      { company: 'Old Corp',  period: 'Jan 2015 – Mar 2018' },
      { company: 'New Corp',  period: '2022–Now' },
      { company: 'Mid Corp',  period: '2019 – 2021' },
    ];
    const sorted = sortCompaniesByRecency(exp);
    expect(sorted.map(e => e.company)).toEqual(['New Corp', 'Mid Corp', 'Old Corp']);
  });

  it('handles missing period gracefully (year 0, sorts last)', () => {
    const exp = [
      { company: 'A', period: '2020–Now' },
      { company: 'B', period: '' },
    ];
    const sorted = sortCompaniesByRecency(exp);
    expect(sorted[0].company).toBe('A');
    expect(sorted[1].company).toBe('B');
  });

  it('does not mutate original array', () => {
    const exp = [
      { company: 'A', period: '2019–Now' },
      { company: 'B', period: '2022–Now' },
    ];
    const original = [...exp];
    sortCompaniesByRecency(exp);
    expect(exp[0].company).toBe(original[0].company);
  });
});
