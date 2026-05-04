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
  "skills": ["skill1", "skill2"],
  "location": "City, Province/State or empty string",
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "period": "Date range e.g. Jan 2020 – Present",
      "description": "All bullet points and responsibilities as one string"
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

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from Groq resume parser');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Groq parser returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    skills: parsed.skills || [],
    location: parsed.location || '',
    experience: (parsed.experience || []).map(e => ({
      title: e.title || '',
      company: e.company || '',
      period: e.period || '',
      description: e.description || '',
    })),
    education: parsed.education || [],
    most_recent_job_title: parsed.experience?.[0]?.title || '',
    all_job_titles: (parsed.experience || []).map(e => e.title).filter(Boolean),
  };
}

module.exports = { parseResumeAI };
