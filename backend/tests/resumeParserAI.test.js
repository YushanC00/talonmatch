'use strict';

jest.mock('groq-sdk', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  }))
);

const Groq = require('groq-sdk');
const { parseResumeAI, _resetClientForTesting } = require('../resumeParserAI');

beforeEach(() => {
  _resetClientForTesting();
  Groq.mockClear();
});

function mockGroqResponse(content) {
  Groq.mockImplementationOnce(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        }),
      },
    },
  }));
}

const VALID_PARSED = {
  skills: ['React', 'TypeScript'],
  location: 'Toronto, ON',
  city: 'Toronto',
  province: 'ON',
  country: 'CA',
  experience: [
    { title: 'Senior Engineer', company: 'Acme', period: 'Jan 2021 – Present', description: 'Built APIs.' },
  ],
  projects: [{ name: 'Portfolio', description: 'React site.' }],
  education: [{ institution: 'UofT', degree: 'BSc CS', year: '2019' }],
};

// ── happy path ─────────────────────────────────────────────────────────────────

describe('parseResumeAI — happy path', () => {
  it('returns structured resume data from valid Groq response', async () => {
    mockGroqResponse(JSON.stringify(VALID_PARSED));
    const result = await parseResumeAI('raw resume text');
    expect(result.skills).toEqual(['React', 'TypeScript']);
    expect(result.city).toBe('Toronto');
    expect(result.province).toBe('ON');
    expect(result.country).toBe('CA');
  });

  it('extracts most_recent_job_title from first experience entry', async () => {
    mockGroqResponse(JSON.stringify(VALID_PARSED));
    const result = await parseResumeAI('raw resume text');
    expect(result.most_recent_job_title).toBe('Senior Engineer');
  });

  it('builds all_job_titles array from experience', async () => {
    const parsed = {
      ...VALID_PARSED,
      experience: [
        { title: 'Senior Engineer', company: 'A', period: '2022–Now', description: '' },
        { title: 'Junior Developer', company: 'B', period: '2020–2022', description: '' },
      ],
    };
    mockGroqResponse(JSON.stringify(parsed));
    const result = await parseResumeAI('text');
    expect(result.all_job_titles).toContain('Senior Engineer');
    expect(result.all_job_titles).toContain('Junior Developer');
  });

  it('normalizes experience entries with missing fields', async () => {
    const parsed = { ...VALID_PARSED, experience: [{ title: 'Dev' }] };
    mockGroqResponse(JSON.stringify(parsed));
    const result = await parseResumeAI('text');
    expect(result.experience[0].company).toBe('');
    expect(result.experience[0].period).toBe('');
    expect(result.experience[0].description).toBe('');
  });

  it('normalizes project entries', async () => {
    mockGroqResponse(JSON.stringify(VALID_PARSED));
    const result = await parseResumeAI('text');
    expect(result.projects).toEqual([{ name: 'Portfolio', description: 'React site.' }]);
  });

  it('defaults all fields to empty when Groq returns empty object', async () => {
    mockGroqResponse(JSON.stringify({}));
    const result = await parseResumeAI('text');
    expect(result.skills).toEqual([]);
    expect(result.location).toBe('');
    expect(result.experience).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.most_recent_job_title).toBe('');
    expect(result.all_job_titles).toEqual([]);
  });
});

// ── error handling ─────────────────────────────────────────────────────────────

describe('parseResumeAI — error handling', () => {
  it('throws on empty Groq response', async () => {
    mockGroqResponse('');
    await expect(parseResumeAI('text')).rejects.toThrow(/empty response/i);
  });

  it('throws on invalid JSON from Groq', async () => {
    mockGroqResponse('{bad json}');
    await expect(parseResumeAI('text')).rejects.toThrow(/invalid json/i);
  });

  it('truncates rawText to 8000 chars before sending to Groq', async () => {
    let capturedMessages;
    Groq.mockImplementationOnce(() => ({
      chat: {
        completions: {
          create: jest.fn().mockImplementation(async ({ messages }) => {
            capturedMessages = messages;
            return { choices: [{ message: { content: JSON.stringify(VALID_PARSED) } }] };
          }),
        },
      },
    }));

    const longText = 'x'.repeat(10000);
    await parseResumeAI(longText);
    const userContent = capturedMessages.find(m => m.role === 'user').content;
    // The text portion should be at most 8000 chars
    expect(userContent.length).toBeLessThanOrEqual(8000 + 100); // prefix overhead
  });
});
