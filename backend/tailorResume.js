const Groq = require('groq-sdk');

let _client = null;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 30_000 });
  return _client;
}

async function groqJSON(systemPrompt, userMessage) {
  const completion = await getClient().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 3000,
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

// ── Dynamic section prompt (v4) ────────────────────────────────────────────────

const DYNAMIC_SYSTEM = `You are a professional resume writer with expertise in ATS optimization and achievement-oriented copywriting.

TONE: "Professional & Achiever" — confident, results-driven, no filler words.

BULLET FORMULA: Action Verb + Task + Result. Front-load impact.
Good: "Reduced onboarding time by redesigning the intake workflow, cutting support tickets by half."
Bad: "Responsible for managing the onboarding process and supporting new users."

NUMERICAL INTEGRITY (NON-NEGOTIABLE):
- NEVER change, inflate, or fabricate years of experience, graduation dates, or employment timelines
- NEVER invent metrics (%, $, #, multipliers) not present in the candidate's original resume bullets
- If JD asks for "7 years" but candidate has "5 years," use qualitative framing instead
- Any years figure in Summary MUST derive from provided employment dates, never from the JD

ATS RULES:
- Max 2 JD keywords per bullet — weave them naturally, do NOT keyword-stuff
- Plain text only, no special Unicode characters or symbols

RULES:
1. NEVER invent skills, titles, companies, dates, or accomplishments not in the input
2. ONLY reframe existing facts using JD vocabulary — no fabrication
3. NO AI buzzwords: leverage, spearheaded, synergy, cutting-edge, transformative, revolutionize, etc.
4. Skills: pick up to 10 from the candidate's actual skills list, ordered by JD relevance
5. Summary: 2-3 sentences, no first-person pronoun
6. Work Experience: 3-5 bullets per entry. ALWAYS include every job. NEVER return empty array. Each bullet max 200 characters.
7. Projects: one concise description sentence per project using JD vocabulary.
8. De-duplicate: if same company appears multiple times in input, merge into ONE entry with the best bullets.

Return ONLY valid JSON — no markdown fences, no extra keys:
{
  "_version": 3,
  "Summary": "<tailored 2-3 sentence summary>",
  "Work Experience": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "period": "<date range or empty string>",
      "bullets": ["<bullet>", "<bullet>", "<bullet>"]
    }
  ],
  "Projects": [
    {
      "name": "<project name>",
      "description": "<1 sentence description>"
    }
  ],
  "Skills": ["<skill>", "<skill>"]
}`;

// ── Build user message from resume data ────────────────────────────────────────

function getBullets(job) {
  if (Array.isArray(job.bullets) && job.bullets.length > 0) return job.bullets.slice(0, 6);
  if (!job.description) return [];
  return job.description.split(/[.!?]\s+/).filter(s => s.trim().length > 10).slice(0, 6);
}

function buildUserMessage({ parsedResume, jobDescription }) {
  const skills = parsedResume.skills || [];
  const experience = parsedResume.experience || [];
  const projects = parsedResume.projects || [];

  const expLines = experience.map(job => {
    const bullets = getBullets(job);
    return `Role: ${job.title || ''}
Company: ${job.company || ''}
Period: ${job.period || ''}
Bullets:
${bullets.map(b => `- ${b}`).join('\n') || '(none)'}`;
  }).join('\n---\n');

  const projLines = projects.map(proj => {
    const bullets = proj.description
      ? proj.description.split(/[.!?]\s+/).filter(s => s.trim().length > 10).slice(0, 4)
      : [];
    return `Name: ${proj.name || ''}
Description:
${bullets.map(b => `- ${b}`).join('\n') || '(none)'}`;
  }).join('\n---\n');

  return `JOB DESCRIPTION:
${jobDescription.slice(0, 2500)}

CANDIDATE SKILLS: ${skills.join(', ')}

EXPERIENCE:
${expLines || '(none)'}

PROJECTS:
${projLines || '(none)'}`;
}

// ── Post-processing helpers ────────────────────────────────────────────────────

// Extracts numeric metrics: 40%, $1M, #5, 10x, 1,000
function extractMetrics(text) {
  const patterns = [
    /\d+%/g,
    /\$[\d,]+(?:\.\d+)?[KMBkm]?/g,
    /#\d+/g,
    /\b\d{1,3}(?:,\d{3})+\b/g,
    /\b\d+x\b/gi,
  ];
  const found = new Set();
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.add(m[0]);
  }
  return found;
}

function getRawResumeText(parsedResume) {
  const parts = [];
  if (parsedResume.summary) parts.push(parsedResume.summary);
  for (const job of (parsedResume.experience || [])) {
    if (job.description) parts.push(job.description);
    if (Array.isArray(job.bullets)) parts.push(job.bullets.join(' '));
  }
  for (const proj of (parsedResume.projects || [])) {
    if (proj.description) parts.push(proj.description);
    if (Array.isArray(proj.bullets)) parts.push(proj.bullets.join(' '));
  }
  return parts.join(' ');
}

function stripHallucinatedMetrics(bullet, rawText) {
  let cleaned = bullet;
  for (const metric of extractMetrics(bullet)) {
    if (!rawText.includes(metric)) {
      // Remove the fabricated metric and clean up surrounding punctuation/spaces
      cleaned = cleaned
        .replace(metric, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,;.])/g, '$1')
        .replace(/^[,;.\s]+/, '')
        .trim();
    }
  }
  return cleaned;
}

// Returns unique JD keywords: capitalized terms and acronyms appearing 2+ times
function extractJdKeywords(jobDescription) {
  const words = jobDescription.match(/\b[A-Z][a-zA-Z]{3,}\b|\b[A-Z]{2,}\b/g) || [];
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.keys(freq).filter(w => freq[w] >= 2 || /^[A-Z]{2,}$/.test(w));
}

function countJdKeywords(bullet, jdKeywords) {
  const lower = bullet.toLowerCase();
  return jdKeywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

function truncateBullet(bullet) {
  // ~2 lines at ~100 chars/line
  if (bullet.length <= 200) return bullet;
  return bullet.slice(0, 200).replace(/\s+\S*$/, '').trim();
}

// Merge same-company entries — keep best bullets (up to 5)
function deduplicateExperience(experience) {
  const merged = [];
  for (const entry of experience) {
    const key = (entry.company || '').toLowerCase().trim();
    const existing = key ? merged.find(e => (e.company || '').toLowerCase().trim() === key) : null;
    if (existing) {
      const combined = [...existing.bullets, ...entry.bullets];
      // Dedupe bullets by normalized text
      const seen = new Set();
      existing.bullets = combined.filter(b => {
        const norm = b.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      }).slice(0, 5);
      if (!existing.period && entry.period) existing.period = entry.period;
    } else {
      merged.push({ ...entry, bullets: [...(entry.bullets || [])] });
    }
  }
  return merged;
}

function postProcessResult(result, parsedResume) {
  const rawText = getRawResumeText(parsedResume);

  if (Array.isArray(result['Work Experience'])) {
    result['Work Experience'] = deduplicateExperience(result['Work Experience']);
    for (const entry of result['Work Experience']) {
      entry.bullets = (entry.bullets || [])
        .map(b => truncateBullet(stripHallucinatedMetrics(b, rawText)))
        .filter(Boolean);
    }
  }

  return result;
}

// ── Validation scoring ─────────────────────────────────────────────────────────

function scoreTailoredResult(result, rawText, jdKeywords) {
  let score = 100;
  const issues = [];

  const allBullets = (result['Work Experience'] || []).flatMap(e => e.bullets || []);

  for (const bullet of allBullets) {
    for (const metric of extractMetrics(bullet)) {
      if (!rawText.includes(metric)) {
        score -= 5;
        issues.push(`hallucinated metric "${metric}" in: ${bullet.slice(0, 60)}`);
      }
    }

    const kwCount = countJdKeywords(bullet, jdKeywords);
    if (kwCount > 2) {
      score -= 3;
      issues.push(`${kwCount} JD keywords in bullet (max 2): ${bullet.slice(0, 60)}`);
    }

    if (bullet.length > 200) {
      score -= 2;
      issues.push(`bullet ${bullet.length} chars (max 200)`);
    }
  }

  // Duplicate companies = structural failure
  const companies = (result['Work Experience'] || []).map(e => (e.company || '').toLowerCase().trim());
  if (companies.length !== new Set(companies.filter(Boolean)).size) {
    score -= 10;
    issues.push('duplicate company entries remain');
  }

  return { score: Math.max(0, score), issues };
}

// ── Normalize Groq output ──────────────────────────────────────────────────────

function normalizeResult(raw) {
  console.log('[tailor] raw keys:', Object.keys(raw));

  if (raw._version === 3) {
    const exp = Array.isArray(raw['Work Experience']) ? raw['Work Experience'] : [];
    const proj = Array.isArray(raw['Projects']) ? raw['Projects'] : [];
    console.log('[tailor] v3 | exp:', exp.length, '| proj:', proj.length, '| skills:', (raw['Skills'] || []).length);
    return {
      _version: 3,
      'Summary': typeof raw['Summary'] === 'string' ? raw['Summary'] : '',
      'Work Experience': exp.map(e => ({
        title:   e.title   || '',
        company: e.company || '',
        period:  e.period  || '',
        bullets: Array.isArray(e.bullets) ? e.bullets.filter(Boolean) : [],
      })),
      'Projects': proj.map(p => ({
        name:        p.name        || '',
        description: p.description || '',
      })),
      'Skills': Array.isArray(raw['Skills']) ? raw['Skills'].slice(0, 10) : [],
    };
  }

  // Legacy v1/v2 fallback
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const expSource = Array.isArray(raw.experience) ? raw.experience
                  : Array.isArray(raw.tailored_experience) ? raw.tailored_experience : [];
  const tailored_experience = expSource.map(e => ({
    title:   e.title   || e.role    || '',
    company: e.company || '',
    period:  e.period  || '',
    bullets: Array.isArray(e.bullets)          ? e.bullets.filter(Boolean)
           : Array.isArray(e.tailored_bullets) ? e.tailored_bullets.filter(Boolean)
           : [],
  }));
  const projSource = Array.isArray(raw.projects) ? raw.projects
                   : Array.isArray(raw.tailored_projects) ? raw.tailored_projects : [];
  const tailored_projects = projSource.map(p => ({
    name:    p.name  || p.title || '',
    bullets: typeof p.description          === 'string' ? [p.description].filter(Boolean)
           : typeof p.tailored_description === 'string' ? [p.tailored_description].filter(Boolean)
           : Array.isArray(p.bullets)                   ? p.bullets.filter(Boolean)
           : [],
  }));
  const skills = Array.isArray(raw.skills) ? raw.skills.slice(0, 10) : [];
  console.log('[tailor] legacy | exp:', tailored_experience.length, '| proj:', tailored_projects.length);
  return { summary, tailored_experience, tailored_projects, skills };
}

// ── Public API ─────────────────────────────────────────────────────────────────

const MAX_TAILOR_ATTEMPTS = 2;

async function tailorResume({ parsedResume, jobDescription }) {
  const experience = parsedResume.experience || [];
  const projects = parsedResume.projects || [];
  console.log('Dynamic-section tailor v4 | jobs:', experience.length, '| projects:', projects.length);

  const rawText = getRawResumeText(parsedResume);
  const jdKeywords = extractJdKeywords(jobDescription);
  const userMessage = buildUserMessage({ parsedResume, jobDescription });

  let best = null;
  let bestScore = -1;

  for (let attempt = 1; attempt <= MAX_TAILOR_ATTEMPTS; attempt++) {
    const raw = await groqJSON(DYNAMIC_SYSTEM, userMessage);
    let result = normalizeResult(raw);
    result = postProcessResult(result, parsedResume);

    const { score, issues } = scoreTailoredResult(result, rawText, jdKeywords);
    console.log(`[tailor] attempt ${attempt} | validation_score: ${score} | issues: ${issues.length}`);
    if (issues.length) console.log('[tailor] issues:', issues.slice(0, 5));

    if (score > bestScore) {
      best = result;
      bestScore = score;
    }

    if (score >= 95) break;
    if (attempt < MAX_TAILOR_ATTEMPTS) console.log('[tailor] score < 95, retrying...');
  }

  if (bestScore < 95) console.warn(`[tailor] best score ${bestScore} after ${MAX_TAILOR_ATTEMPTS} attempts`);
  return best;
}

// ── Suggestion Validation ─────────────────────────────────────────────────────
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
