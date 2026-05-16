const Groq = require('groq-sdk');
const { validateAndPatchSection, buildStaticEducationSection, isEducationTitle } = require('./src/workers/streamTailor');
const { auditSection } = require('./src/services/auditorAgent');

let _client = null;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60_000 });
  return _client;
}


// ── System prompt ──────────────────────────────────────────────────────────────

const DYNAMIC_SYSTEM = `ATS resume writer. Tailor candidate resume to JD. Return JSON only — no prose.

PERSONA: Write as an elite, understated systems engineer explaining a code change to a senior peer in a pull request. Practical, blunt, zero emotional padding. Replace evaluative language ("passionate leader", "dynamic professional") with concrete role descriptions ("systems engineer", "backend developer"). Assume the reader is technical and unimpressed by adjectives.

INTEGRITY (non-negotiable):
• Never invent metrics, dates, skills, or companies not in source text
• TECHNOLOGY LOCK: Only name tools/languages/frameworks that appear in CANDIDATE RESUME skills or experience. If JD mentions C++, Go, Rust, etc. but candidate resume does not — NEVER write those in tailored output. This applies to every section including Summary.
• EXPERIENCE LOCK: Never write "X years of Y" unless both X and Y come verbatim from candidate resume. Do not derive years from the JD.
• If JD requires more experience than candidate has: qualitative framing, never fabricate years
• Copy bullet verbatim into tailored if no meaningful improvement fits
• Match seniority — never upgrade title tier (junior stays junior)
• No buzzwords: leverage, spearheaded, synergy, cutting-edge, passionate, results-driven

VOICE:
• Every bullet must begin with a direct, past-tense action verb that reflects real human work: Built, Led, Designed, Wrote, Scaled, Resolved, Migrated, Debugged, Shipped, Refactored, Deployed, Integrated, Automated, Reviewed, Reduced, Improved, Replaced, Extended, Configured, Tested, Documented, Optimized
• BANNED SENTENCE STARTERS: Never begin a bullet with Leveraging, Spearheading, Driving, Ensuring, Fostering, Capitalizing, Optimizing — these are AI tells; use a concrete verb instead
• Active voice. No passive constructions ("was responsible for", "helped to", "assisted in")

CONTENT:
• Bullets: Action Verb + Result, max 200 chars. Quantify only if metric exists in original
• ALL experience bullets must appear — omitting any is a critical failure
• Skills hard: top 10 from candidate's list by JD relevance. No invented skills
• Skills soft: max 5, only when evidenced in experience text
• Plain text — no markdown, no Unicode
• Never split a word mid-string or append a stray hyphen when rewriting a phrase

IDs: summary-0 | we-{co_slug}-{N} | proj-{slug}-0 | skills-hard-0 / skills-soft-0 | edu-{N}
Work Experience label = "Role @ Company (Period)" on every item.

Each section gets ONE rationale field (max 12 words explaining JD alignment).
Each content item gets a rationale field (max 8 words, WHY this change matches JD; empty string if tailored equals original).
Output the profile/summary section FIRST so the frontend can render immediately.
Include ONLY sections present in the source resume.
SECTION TITLE LOCK: Use the EXACT section title from the source resume. If source says "Professional Profile", output title "Professional Profile". Never rename sections.

OUTPUT FORMAT:
{"_version":4,"sections":[{"title":"<exact source section title>","rationale":"<12w>","content":[{"id":"summary-0","label":"","original":"...","tailored":"...","rationale":"<8w or empty>"}]},{"title":"Work Experience","rationale":"<12w>","content":[{"id":"we-acme-0","label":"Sr Engineer @ Acme (2021–Now)","original":"Built API...","tailored":"Designed high-throughput API...","rationale":"highlights distributed systems expertise"}]},{"title":"Skills","rationale":"<12w>","content":[{"id":"skills-hard-0","label":"Technical","original":"React, TS...","tailored":"React, TS...","rationale":""}]}]}`;

// ── JD context stripping ───────────────────────────────────────────────────────

const JD_NOISE_PATTERNS = [
  /\b(?:about us|about the company|who we are|our story|our mission|company overview)\b[\s\S]*?(?=\n{2,}|\b(?:responsibilities|requirements|qualifications|what you.ll do|the role)\b|$)/gi,
  /\b(?:benefits?|perks?|what we offer|compensation|salary|equity|stock|401k|health insurance|dental|vision|pto|paid time off|parental leave|remote work policy)\b[\s\S]*?(?=\n{2,}|\b(?:responsibilities|requirements|qualifications)\b|$)/gi,
  /\b(?:equal employment opportunity|eeo|diversity|inclusion|we celebrate|we do not discriminate|criminal history|fair chance|background check|background screening)\b[\s\S]*$/gi,
  /\bwe may use artificial intelligence[\s\S]*$/gi,
];

function stripJdNoise(jd) {
  let cleaned = jd;
  for (const re of JD_NOISE_PATTERNS) {
    cleaned = cleaned.replace(re, '');
  }
  // Collapse 3+ blank lines into 2, trim
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Build user message ─────────────────────────────────────────────────────────

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15);
}

function extractStartYear(period) {
  const m = (period || '').match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

function sortCompaniesByRecency(experience) {
  return [...experience].sort((a, b) => extractStartYear(b.period) - extractStartYear(a.period));
}

function splitDescription(description) {
  if (!description) return [];
  return description
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function buildUserMessage({ parsedResume, jobDescription }) {
  const lines = [];
  const cleanedJd = stripJdNoise(jobDescription).slice(0, 1800);
  lines.push(`JOB DESCRIPTION:\n${cleanedJd}\n`);

  // Pass original section titles so AI preserves them exactly
  const originalSections = parsedResume.style_config?.sections;
  if (originalSections?.length) {
    lines.push(`ORIGINAL SECTION TITLES (use these exactly): ${originalSections.join(', ')}`);
  }

  lines.push('CANDIDATE RESUME:');

  if (parsedResume.summary) {
    const summaryTitle = parsedResume.summary_section_title || 'Summary';
    lines.push(`\n=== ${summaryTitle} ===`);
    lines.push(parsedResume.summary);
  }

  const experience = parsedResume.experience || [];
  if (experience.length > 0) {
    lines.push('\n=== Work Experience ===');
    for (const job of experience) {
      const slug = slugify(job.company);
      lines.push(`\n[Company: ${job.company} | Role: ${job.title} | Period: ${job.period} | id_prefix: we-${slug}]`);
      const bullets = Array.isArray(job.bullets) && job.bullets.length > 0
        ? job.bullets.slice(0, 6)
        : splitDescription(job.description).slice(0, 6);
      if (bullets.length === 0) {
        lines.push('Bullet 0: (no bullets provided)');
      } else {
        bullets.forEach((b, i) => lines.push(`Bullet ${i}: ${b}`));
      }
    }
  }

  const projects = parsedResume.projects || [];
  if (projects.length > 0) {
    lines.push('\n=== Projects ===');
    for (const proj of projects) {
      lines.push(`\n${proj.name}: ${proj.description}`);
    }
  }

  const skills = parsedResume.skills || [];
  if (skills.length > 0) {
    const skillsTitle = originalSections?.find(s => /skills|tech|stack|tool/i.test(s)) || 'Skills';
    lines.push(`\n=== ${skillsTitle} ===`);
    lines.push(skills.join(', '));
  }

  const education = parsedResume.education || [];
  if (education.length > 0) {
    const eduTitle = originalSections?.find(s => /edu/i.test(s)) || 'Education';
    lines.push(`\n=== ${eduTitle} ===`);
    for (const edu of education) {
      lines.push(`${edu.degree || ''} — ${edu.institution || edu.school || ''} (${edu.year || ''})`);
    }
  }

  return lines.join('\n');
}

// ── Post-processing helpers ────────────────────────────────────────────────────

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
  }
  return parts.join(' ');
}

function buildCandidateSkillSet(parsedResume) {
  const rawText = getRawResumeText(parsedResume).toLowerCase();
  const set = new Set();
  for (const s of (parsedResume.skills || [])) {
    set.add(s.toLowerCase().trim());
  }
  // Also extract capitalised/acronym tech tokens from raw resume text
  const techTokens = rawText.match(/\b[a-z][a-z0-9+#./]{1,}\b/g) || [];
  for (const t of techTokens) set.add(t);
  return set;
}

// Strip "N+ years of <tech>" claims where <tech> is not in candidate resume
function stripHallucinatedSkillClaims(text, candidateSkillSet) {
  return text.replace(
    /\b(\d+\+?\s+years?\s+(?:of\s+)?)([\w+#./]+(?:\s+[\w+#./]+){0,2})\s+(experience|expertise|development|programming|background)\b/gi,
    (match, prefix, techPhrase, _suffix) => {
      const normalized = techPhrase.toLowerCase().trim();
      // Check each word in techPhrase against skill set
      const words = normalized.split(/\s+/);
      const allKnown = words.every(w => candidateSkillSet.has(w) || w.length <= 2);
      return allKnown ? match : '';
    }
  ).replace(/\s{2,}/g, ' ').replace(/\s+([,;.])/g, '$1').trim();
}

function stripHallucinatedMetrics(text, rawText) {
  let cleaned = text;
  for (const metric of extractMetrics(text)) {
    if (!rawText.includes(metric)) {
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

function truncateItem(text) {
  if (text.length <= 200) return text;
  return text.slice(0, 200).replace(/\s+\S*$/, '').trim();
}

function extractJdKeywords(jobDescription) {
  const words = jobDescription.match(/\b[A-Z][a-zA-Z]{3,}\b|\b[A-Z]{2,}\b/g) || [];
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.keys(freq).filter(w => freq[w] >= 2 || /^[A-Z]{2,}$/.test(w));
}

function countJdKeywords(text, jdKeywords) {
  const lower = text.toLowerCase();
  return jdKeywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

// ── Post-process ───────────────────────────────────────────────────────────────

function truncateRationale(text) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  return words.length <= 10 ? text.trim() : words.slice(0, 10).join(' ');
}

// ── Validation scoring ─────────────────────────────────────────────────────────

function scoreTailoredResult(result, rawText, jdKeywords) {
  let score = 100;
  const issues = [];

  for (const section of (result.sections || [])) {
    const isExp = /experience/i.test(section.title);
    for (const item of (section.content || [])) {
      for (const metric of extractMetrics(item.tailored)) {
        if (!rawText.includes(metric)) {
          score -= 5;
          issues.push(`hallucinated metric "${metric}" in: ${item.tailored.slice(0, 60)}`);
        }
      }
      if (isExp) {
        const kwCount = countJdKeywords(item.tailored, jdKeywords);
        if (kwCount > 2) {
          score -= 3;
          issues.push(`${kwCount} JD keywords in bullet (max 2): ${item.tailored.slice(0, 60)}`);
        }
        if (item.tailored.length > 200) {
          score -= 2;
          issues.push(`bullet ${item.tailored.length} chars (max 200)`);
        }
      }
    }
  }

  return { score: Math.max(0, score), issues };
}

// ── Streaming section parser ───────────────────────────────────────────────────
// Stateful parser that feeds raw token chunks and emits complete section objects.

class SectionStreamParser {
  constructor() {
    this.buf     = '';
    this.ready   = false;  // true once we've consumed past "sections":[
    this.depth   = 0;      // brace nesting inside sections array
    this.start   = -1;     // index of current section's opening {
    this.inStr   = false;
    this.esc     = false;
    this.scanPos = 0;      // resume point — avoids re-scanning already-processed bytes
  }

  push(chunk) {
    const out = [];
    this.buf += chunk;

    if (!this.ready) {
      const m = /"sections"\s*:\s*\[/.exec(this.buf);
      if (!m) return out;
      this.buf     = this.buf.slice(m.index + m[0].length);
      this.ready   = true;
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
          try { out.push(JSON.parse(this.buf.slice(this.start, i + 1))); } catch { /* partial */ }
          this.buf     = this.buf.slice(i + 1);
          this.start   = -1;
          i            = -1;
        }
      }
      i++;
    }
    this.scanPos = this.buf.length;
    return out;
  }
}

// ── Per-section normalization (used during streaming) ─────────────────────────

function normalizeSectionItem(raw, parsedResume) {
  if (!raw?.title) return null;
  const rawText        = getRawResumeText(parsedResume);
  const candidateSkills = buildCandidateSkillSet(parsedResume);
  const isExp          = /experience/i.test(raw.title);
  const isSkills       = /skills?|tech|stack|tool/i.test(raw.title);
  const content = (raw.content || []).map(item => {
    let tailored = item.tailored || '';
    tailored = stripHallucinatedSkillClaims(tailored, candidateSkills);
    tailored = stripHallucinatedMetrics(tailored, rawText);
    if (isExp) tailored = truncateItem(tailored);
    // Safety net: prevent empty tailored from causing full strikethrough in diff view.
    // Skills items are exempt — empty tailored means the LLM intentionally removed them.
    if (!tailored && !isSkills) tailored = item.original || '';
    return {
      id:        item.id       || '',
      label:     item.label    || '',
      original:  item.original || '',
      tailored,
      rationale: (item.rationale || '').trim().slice(0, 80),
    };
  }).filter(item => item.id);
  if (!content.length) return null;
  return {
    title:     raw.title,
    rationale: truncateRationale(raw.rationale || ''),
    content,
  };
}

// ── Streaming public API ───────────────────────────────────────────────────────

async function* streamTailorResume({ parsedResume, jobDescription, signal }) {
  const expCount  = (parsedResume.experience || []).length;
  const projCount = (parsedResume.projects   || []).length;
  console.log(`Tailor v6 streaming | exp:${expCount} proj:${projCount}`);

  const userMessage = buildUserMessage({ parsedResume, jobDescription });
  const parser = new SectionStreamParser();
  let usage = null;

  // Education bypasses the LLM entirely — emit source data immediately.
  const staticEdu = buildStaticEducationSection(parsedResume);
  if (staticEdu) {
    console.log(`[tailor] emit "${staticEdu.title}" (static bypass)`);
    yield { type: 'section', section: staticEdu };
  }

  const stream = await getClient().chat.completions.create({
    model:           'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: DYNAMIC_SYSTEM },
      { role: 'user',   content: userMessage    },
    ],
    max_tokens:      3000,
    temperature:     0.3,
    // No response_format here — Groq buffers the *entire* JSON for validation before
    // streaming any tokens when json_object is set. Free-text streaming lets the
    // SectionStreamParser parse sections incrementally as tokens arrive.
    stream:          true,
  }, signal ? { signal } : undefined);

  const t0 = Date.now();
  let rawCapture = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (chunk.usage) usage = chunk.usage;
    if (rawCapture.length < 600) rawCapture += delta;

    for (const rawSec of parser.push(delta)) {
      // Education was already emitted as a static bypass above — drop any LLM version.
      if (isEducationTitle(rawSec?.title || '')) continue;
      const raw = normalizeSectionItem(rawSec, parsedResume);
      if (raw) {
        const layer1 = validateAndPatchSection(raw, parsedResume);
        let layer2Section = layer1.section;
        try {
          layer2Section = auditSection(layer1.section).section;
        } catch (err) {
          console.error('[auditorAgent] failed, using layer1 output:', err);
        }
        console.log(`[tailor] emit "${layer2Section.title}" +${Date.now() - t0}ms`);
        yield { type: 'section', section: layer2Section };
      }
    }
  }

  console.log('[tailor] raw output start:', rawCapture.slice(0, 400));
  console.log('[tailor] parser.ready:', parser.ready, '| buf len:', parser.buf.length);
  const ptok = usage?.prompt_tokens     || 0;
  const ctok = usage?.completion_tokens || 0;
  console.log(`[tailor] stream done | prompt:${ptok} completion:${ctok}`);

  yield { type: 'done', usage: { promptTokens: ptok, completionTokens: ctok } };
}

// ── Batch API (used by perf-check.js) ─────────────────────────────────────────

async function tailorResume({ parsedResume, jobDescription }) {
  const sections = [];
  let usage = null;

  for await (const event of streamTailorResume({ parsedResume, jobDescription })) {
    if (event.type === 'section') sections.push(event.section);
    if (event.type === 'done')    usage = event.usage;
  }

  const result   = { _version: 4, sections };
  const rawText  = getRawResumeText(parsedResume);
  const jdKw     = extractJdKeywords(jobDescription);
  const { score, issues } = scoreTailoredResult(result, rawText, jdKw);
  console.log(`[tailor] validation score:${score} | issues:${issues.length}`);
  if (issues.length) console.log('[tailor] issues:', issues.slice(0, 5));
  if (score < 80)   console.warn('[tailor] quality warning — score:', score);

  result._usage = usage || {};
  return result;
}

// ── Parallel chunking helpers ─────────────────────────────────────────────────

async function runConcurrent(tasks, concurrency = 3) {
  if (!tasks.length) return [];
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function tailorExperienceChunk({ jobEntry, parsedResume, jobDescription, signal }) {
  const focusedResume = { ...parsedResume, experience: [jobEntry] };
  let result = null;
  for await (const event of streamTailorResume({ parsedResume: focusedResume, jobDescription, signal })) {
    if (event.type === 'section' && /experience/i.test(event.section.title)) {
      result = event.section;
    }
  }
  return result;
}

async function* tailorNonExperience({ parsedResume, jobDescription, signal }) {
  const noExpResume = { ...parsedResume, experience: [] };
  yield* streamTailorResume({ parsedResume: noExpResume, jobDescription, signal });
}

async function* streamTailorParallel({ parsedResume, jobDescription, signal }) {
  const sorted = sortCompaniesByRecency(parsedResume.experience || []);
  const totalUsage = { promptTokens: 0, completionTokens: 0 };

  const nonExpSections = [];
  const nonExpPromise = (async () => {
    for await (const event of tailorNonExperience({ parsedResume, jobDescription, signal })) {
      if (event.type === 'section') nonExpSections.push(event.section);
      if (event.type === 'done') {
        totalUsage.promptTokens    += event.usage?.promptTokens    || 0;
        totalUsage.completionTokens += event.usage?.completionTokens || 0;
      }
    }
  })();

  const expTasks   = sorted.map(jobEntry => () => tailorExperienceChunk({ jobEntry, parsedResume, jobDescription, signal }));
  const expResults = await runConcurrent(expTasks);
  await nonExpPromise;

  for (const s of nonExpSections)            yield { type: 'section', section: s };
  for (const s of expResults) if (s)         yield { type: 'section', section: s };
  yield { type: 'done', usage: totalUsage };
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

module.exports = {
  tailorResume, streamTailorResume, validateSuggestionAST,
  // pure utilities — exported for unit testing
  buildUserMessage, getRawResumeText,
  stripHallucinatedMetrics, stripHallucinatedSkillClaims, buildCandidateSkillSet,
  truncateItem, truncateRationale,
  extractMetrics, scoreTailoredResult,
  sortCompaniesByRecency, runConcurrent,
  tailorExperienceChunk, tailorNonExperience, streamTailorParallel,
  _resetClientForTesting: () => { _client = null; },
};
