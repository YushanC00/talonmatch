const Groq = require('groq-sdk');

let _client = null;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

async function groqJSON(systemPrompt, userMessage) {
  const completion = await getClient().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1500,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from Groq');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Groq returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

// ── Summary chunk ──────────────────────────────────────────────────────────────

const SUMMARY_SYSTEM = `You are a professional resume writer. Write a resume summary tailored to the job description.

Return ONLY this JSON — no markdown, no extra keys:
{
  "original_text": "<neutral 2-3 sentence summary from the resume facts alone, no JD influence>",
  "tailored_text": "<same summary rewritten with vocabulary and priorities from the job description>",
  "change_reason": "<one sentence: which JD keywords were woven in and why>"
}`;

async function tailorSummary({ skills, experienceTitles, jobDescription }) {
  const user = `JOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}

CANDIDATE SNAPSHOT:
Skills: ${skills.join(', ')}
Roles held: ${experienceTitles.join(', ')}`;

  return groqJSON(SUMMARY_SYSTEM, user);
}

// ── Per-job chunk ──────────────────────────────────────────────────────────────

const JOB_SYSTEM = `You are a professional resume writer. Tailor one job's bullets to match the job description.

RULES:
1. NEVER invent skills or accomplishments not present in the bullets or skills list
2. ONLY reframe existing facts using JD vocabulary
3. NO AI buzzwords
4. You MAY add 1-2 new bullets ONLY for skills in the candidate's skills list that the JD requires — set is_new_suggestion: true

CRITICAL JSON INSTRUCTION: You must copy the original_text EXACTLY character-for-character from the input. DO NOT truncate, summarize, or drop the leading words. Your tailored_text MUST also be a complete, grammatically correct sentence that starts with a capitalized action verb. Do not cut off the beginning of any sentence.

Return ONLY this JSON — no markdown, no extra keys:
{
  "title": "<original job title>",
  "company": "<company name>",
  "period": "<date range or empty string>",
  "bullets": [
    {
      "original_text": "<original bullet verbatim, empty string for new suggestions>",
      "tailored_text": "<rewritten or new bullet>",
      "change_reason": "<one sentence: which JD keywords were added and why>",
      "is_new_suggestion": false
    }
  ]
}`;

async function tailorJob({ job, skills, jobDescription }) {
  const bullets = job.description
    ? job.description.split(/[.!?]\s+/).filter(s => s.trim().length > 10).slice(0, 6)
    : [];

  const user = `JOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}

CANDIDATE SKILLS: ${skills.join(', ')}

JOB TO TAILOR:
Title: ${job.title}
Company: ${job.company || ''}
Period: ${job.period || ''}
Bullets:
${bullets.map(b => `- ${b}`).join('\n') || '(none)'}`;

  return groqJSON(JOB_SYSTEM, user);
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function tailorResume({ parsedResume, jobDescription }) {
  const skills = parsedResume.skills || [];
  const experience = parsedResume.experience || [];
  const experienceTitles = experience.map(e => e.title).filter(Boolean);

  console.log('Total jobs parsed:', experience.length);

  // Sequential to avoid Groq free-tier concurrency limits
  const summaryResult = await tailorSummary({ skills, experienceTitles, jobDescription });

  const jobResults = [];
  for (const job of experience) {
    const result = await tailorJob({ job, skills, jobDescription });
    jobResults.push(result);
  }

  return {
    summary: summaryResult,
    tailored_experience: jobResults,
  };
}

// ── Suggestion Validation (placeholder for writing suggestion engine) ─────────
// Validates a suggestion object conforms to the expected schema before it is
// applied to resume text. Expand VALID_TYPES as the AST shape grows.
function validateSuggestionAST(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return false;
  const { type, original, replacement } = suggestion;
  if (typeof type !== 'string' || !type) return false;
  if (typeof original !== 'string') return false;
  if (typeof replacement !== 'string') return false;
  const VALID_TYPES = ['rephrase', 'quantify', 'action_verb', 'keyword_inject'];
  return VALID_TYPES.includes(type);
}

module.exports = { tailorResume, validateSuggestionAST };
