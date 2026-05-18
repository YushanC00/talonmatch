const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','is','are','was','were','be',
  'been','being','have','has','had','do','does','did','will','would','could',
  'should','may','might','shall','can','need','dare','ought','used','we',
  'you','they','he','she','it','i','my','your','our','their','its','this',
  'that','these','those','who','which','what','when','where','how','all',
  'as','than','then','so','if','not','no','nor','yet','both','either',
  'each','any','some','such','while','during','including','across','team',
  'work','working','strong','good','great','excellent','ability','skills',
  // common job-req qualifiers that add noise when tokenizing requirements
  'experience','knowledge','proficiency','familiar','familiarity',
  'preferred','required','minimum','least','proven','demonstrated',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function normalize(text) {
  return text.toLowerCase().replace(/[-\s.]+/g, '');
}

function buildResumeTokenSet(resume) {
  const tokens = new Set();
  for (const skill of (resume.skills || [])) {
    const norm = normalize(skill);
    tokens.add(norm);
    // Only add sub-tokens for single-word skills; multi-word skills match via normalize()
    const parts = tokenize(skill);
    if (parts.length === 1) parts.forEach(t => tokens.add(t));
  }
  for (const exp of (resume.experience || [])) {
    tokenize(exp.title || '').forEach(t => tokens.add(t));
    // descriptions excluded — generic words inflate cross-domain scores
  }
  for (const edu of (resume.education || [])) {
    tokenize(edu.degree || '').forEach(t => tokens.add(t));
  }
  return tokens;
}

// ── Skills scoring (70%) ───────────────────────────────────────────────────────

function scoreRequirements(resumeTokens, requirementsArray) {
  if (!requirementsArray?.length) return { score: 0, matched: [], unmatched: [] };
  const matched = [];
  const unmatched = [];
  for (const req of requirementsArray) {
    const reqNorm   = normalize(req);
    const reqTokens = tokenize(req);
    const directHit  = resumeTokens.has(reqNorm);
    const tokenHit   = reqTokens.length > 0 && reqTokens.every(t => resumeTokens.has(t));
    if (directHit || tokenHit) matched.push(req);
    else unmatched.push(req);
  }
  return { score: matched.length / requirementsArray.length, matched, unmatched };
}

// ── Seniority scoring (20%) ────────────────────────────────────────────────────

const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|architect|director|manager|head|vp|chief|founding)\b/i;
const JUNIOR_RE = /\b(junior|jr\.?|entry[\s-]?level|associate|graduate|intern)\b/i;

function seniorityLevel(title) {
  if (!title) return 'mid';
  if (SENIOR_RE.test(title)) return 'senior';
  if (JUNIOR_RE.test(title)) return 'junior';
  return 'mid';
}

const LEVEL = { junior: 0, mid: 1, senior: 2 };

function scoreSeniority(resumeTitle, jobTitle) {
  const gap = Math.abs(LEVEL[seniorityLevel(resumeTitle)] - LEVEL[seniorityLevel(jobTitle)]);
  return gap === 0 ? 1.0 : gap === 1 ? 0.5 : 0.0;
}

// ── Proximity scoring (10%) ────────────────────────────────────────────────────

function scoreProximity(resume, job) {
  const isRemote = job.is_remote
    || /remote/i.test(job.job_title  || '')
    || /remote/i.test(job.location   || '')
    || /remote/i.test(job.description || '');
  if (isRemote) return 1.0;

  if (!resume.city && !resume.province) return 0.5; // unknown — neutral
  const jLoc  = (job.location || '').toLowerCase();
  const rCity = (resume.city     || '').toLowerCase();
  const rProv = (resume.province || '').toLowerCase();
  if (rCity && jLoc.includes(rCity)) return 1.0;
  if (rProv && jLoc.includes(rProv)) return 0.7;
  return 0.0;
}

// ── Match reason ───────────────────────────────────────────────────────────────

function buildMatchReason(matched, unmatched, finalScore) {
  const pct = Math.round(finalScore);
  if (matched.length === 0)
    return `No direct skill matches found; consider highlighting relevant experience (${pct}% overall match).`;
  const top = matched.slice(0, 3).join(', ');
  const missingNote = unmatched.length ? `; missing ${unmatched.slice(0, 2).join(', ')}` : '';
  return `Matched ${matched.length} of ${matched.length + unmatched.length} requirements including ${top}${missingNote} (${pct}% overall match).`;
}

// ── Composite score ────────────────────────────────────────────────────────────

function scoreJob(resume, job, resumeTokens) {
  const reqResult    = scoreRequirements(resumeTokens, job.requirements_array);
  const seniorScore  = scoreSeniority(resume.most_recent_job_title || '', job.job_title || '');
  const proxScore    = scoreProximity(resume, job);

  // 70% skills · 20% seniority · 10% proximity
  const raw = reqResult.score * 0.70 + seniorScore * 0.20 + proxScore * 0.10;

  // CLAUDE.md: cap at 99% when any required skill is missing
  let match_score = Math.round(Math.min(raw, 1) * 100);
  if (reqResult.unmatched.length > 0) match_score = Math.min(match_score, 99);

  const match_reason = buildMatchReason(reqResult.matched, reqResult.unmatched, match_score);

  // Normalize is_remote using same signals as scoreProximity so card label is always accurate
  const is_remote = Boolean(job.is_remote)
    || /remote/i.test(job.job_title  || '')
    || /remote/i.test(job.location   || '')
    || /remote/i.test(job.description || '');

  return { ...job, is_remote, match_score, match_reason, requirements_array: job.requirements_array };
}

function scoreAndRank(resume, jobs) {
  if (!jobs?.length) return [];
  const resumeTokens = buildResumeTokenSet(resume);
  return jobs
    .map(job => scoreJob(resume, job, resumeTokens))
    .sort((a, b) => b.match_score - a.match_score);
}

module.exports = { scoreAndRank };
