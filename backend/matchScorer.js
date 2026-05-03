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
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\+\#\.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function normalize(text) {
  return text.toLowerCase().replace(/[\s\-\.]+/g, '');
}

function buildResumeTokenSet(resume) {
  const tokens = new Set();

  for (const skill of (resume.skills || [])) {
    tokens.add(normalize(skill));
    tokenize(skill).forEach(t => tokens.add(t));
  }

  for (const exp of (resume.experience || [])) {
    tokenize(exp.title || '').forEach(t => tokens.add(t));
    tokenize(exp.description || '').forEach(t => tokens.add(t));
  }

  for (const edu of (resume.education || [])) {
    tokenize(edu.degree || '').forEach(t => tokens.add(t));
    tokenize(edu.institution || '').forEach(t => tokens.add(t));
  }

  return tokens;
}

function scoreRequirements(resumeTokens, requirementsArray) {
  if (!requirementsArray?.length) return { score: 0, matched: [], unmatched: [] };

  const matched = [];
  const unmatched = [];

  for (const req of requirementsArray) {
    const reqNorm = normalize(req);
    const reqTokens = tokenize(req);

    const directHit = resumeTokens.has(reqNorm);
    const tokenHit = reqTokens.length > 0 && reqTokens.every(t => resumeTokens.has(t));
    const partialHit = reqTokens.some(t => resumeTokens.has(t));

    if (directHit || tokenHit) {
      matched.push(req);
    } else if (partialHit) {
      matched.push(req);
    } else {
      unmatched.push(req);
    }
  }

  return {
    score: matched.length / requirementsArray.length,
    matched,
    unmatched,
  };
}

function scoreDescription(resumeTokens, description) {
  if (!description) return 0;

  const descTokens = tokenize(description);
  if (!descTokens.length) return 0;

  const unique = [...new Set(descTokens)];
  const hits = unique.filter(t => resumeTokens.has(t)).length;
  return Math.min(hits / Math.max(unique.length * 0.3, 1), 1);
}

function buildMatchReason(matched, unmatched, finalScore) {
  const pct = Math.round(finalScore);

  if (matched.length === 0) {
    return `No direct skill matches found; consider highlighting relevant experience (${pct}% overall match).`;
  }

  const top = matched.slice(0, 3).join(', ');
  const missingNote = unmatched.length
    ? `; missing ${unmatched.slice(0, 2).join(', ')}`
    : '';

  return `Matched ${matched.length} of ${matched.length + unmatched.length} requirements including ${top}${missingNote} (${pct}% overall match).`;
}

function scoreJob(resume, job, resumeTokens) {
  const reqResult = scoreRequirements(resumeTokens, job.requirements_array);
  const descScore = scoreDescription(resumeTokens, job.description);

  // 70% weight on explicit requirements, 30% on description keyword density
  const raw = reqResult.score * 0.7 + descScore * 0.3;
  const match_score = Math.round(Math.min(raw, 1) * 100);
  const match_reason = buildMatchReason(reqResult.matched, reqResult.unmatched, match_score);

  return { ...job, match_score, match_reason };
}

function scoreAndRank(resume, jobs) {
  if (!jobs?.length) return [];

  const resumeTokens = buildResumeTokenSet(resume);

  return jobs
    .map(job => scoreJob(resume, job, resumeTokens))
    .sort((a, b) => b.match_score - a.match_score);
}

module.exports = { scoreAndRank };
