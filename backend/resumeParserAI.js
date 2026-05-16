const Groq = require('groq-sdk');

let _client = null;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `You are a resume parser. Extract structured data from raw resume text.

CRITICAL: You MUST extract EVERY SINGLE job in the document. Read the ENTIRE text from top to bottom. Do not stop after the first page or first few roles. Include all jobs — recent AND older ones.

Return ONLY this JSON — no markdown, no extra keys:
{
  "full_name": "Candidate full name or empty string",
  "contact_line": "Email / phone / LinkedIn / location on one line, or empty string",
  "summary_section_title": "Exact heading used for the profile/summary section (e.g. 'Professional Profile', 'Summary', 'About', 'Objective') or empty string if none",
  "summary": "Full text of the profile/summary/about section, or empty string if none",
  "skills": ["skill1", "skill2"],
  "location": "City, Province/State or empty string",
  "city": "City name only or empty string",
  "province": "Province or State abbreviation only or empty string",
  "country": "Two-letter ISO country code (CA, US, GB, AU, etc.) inferred from city/province context, or empty string",
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "period": "Date range e.g. Jan 2020 – Present",
      "description": "All bullet points and responsibilities as one string"
    }
  ],
  "projects": [
    {
      "name": "Project name",
      "description": "All project details, tech stack, and achievements as one string"
    }
  ],
  "education": [
    {
      "institution": "School name",
      "degree": "Degree name",
      "year": "Graduation year"
    }
  ]
}`;

// Shared token counter — imported by server.js health route
const tokenStats = { totalUsed: 0, requests: 0, lastRequestTokens: 0 };

async function parseResumeAI(rawText) {
  const completion = await getClient().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Parse this resume. Extract ALL jobs:\n\n${rawText.slice(0, 8000)}` },
    ],
    max_tokens: 4000,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const used = completion.usage?.total_tokens ?? 0;
  tokenStats.totalUsed += used;
  tokenStats.requests++;
  tokenStats.lastRequestTokens = used;
  console.log(`[groq] tokens used this request: ${used} | session total: ${tokenStats.totalUsed}`);

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from Groq resume parser');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Groq parser returned invalid JSON: ${raw.slice(0, 200)}`, { cause: e });
  }

  return {
    full_name:             parsed.full_name             || '',
    contact_line:          parsed.contact_line          || '',
    summary_section_title: parsed.summary_section_title || '',
    summary:               parsed.summary               || '',
    skills: parsed.skills || [],
    location: parsed.location || '',
    city: parsed.city || '',
    province: parsed.province || '',
    country: parsed.country || '',
    experience: (parsed.experience || []).map(e => ({
      title: e.title || '',
      company: e.company || '',
      period: e.period || '',
      description: e.description || '',
    })),
    projects: (parsed.projects || []).map(p => ({
      name: p.name || '',
      description: p.description || '',
    })),
    education: parsed.education || [],
    most_recent_job_title: parsed.experience?.[0]?.title || '',
    all_job_titles: (parsed.experience || []).map(e => e.title).filter(Boolean),
  };
}

module.exports = { parseResumeAI, tokenStats, _resetClientForTesting: () => { _client = null; } };
