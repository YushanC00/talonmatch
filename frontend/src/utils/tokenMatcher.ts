// Abbreviation → canonical form
const ABBR: Record<string, string> = {
  js:         'javascript',
  ts:         'typescript',
  k8s:        'kubernetes',
  gql:        'graphql',
  pg:         'postgresql',
  postgres:   'postgresql',
  mongo:      'mongodb',
};

/**
 * Normalize a single token:
 * 1. Strip trailing .js  (react.js → react)
 * 2. Strip trailing JS only when preceded by 2+ chars  (reactjs → react, but js → js)
 * 3. Expand known abbreviations  (js → javascript, ts → typescript)
 */
function normalizeToken(t: string): string {
  let n = t.replace(/\.js$/i, '');
  n = n.replace(/(.{2,})js$/i, '$1');
  return ABBR[n] ?? n;
}

/**
 * Tokenize a skill string by spaces, slashes, pipes, commas, and plus signs,
 * then normalize each token.
 */
function tokenizeSkill(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .split(/[\s/|,+]+/)
      .map(t => t.replace(/[^a-z0-9#.+]/g, ''))
      .filter(Boolean)
      .map(normalizeToken),
  );
}

/** True when any token from requirement matches any token from any resume skill. */
export function skillMatches(resumeSkills: string[], requirement: string): boolean {
  const reqTokens = tokenizeSkill(requirement);
  for (const skill of resumeSkills) {
    const skillTokens = tokenizeSkill(skill);
    for (const rt of reqTokens) {
      if (skillTokens.has(rt)) return true;
    }
  }
  return false;
}

export function partitionSkills(
  resumeSkills: string[],
  requirementsArray: string[] | null | undefined,
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const req of (requirementsArray ?? [])) {
    (skillMatches(resumeSkills, req) ? matched : missing).push(req);
  }
  return { matched, missing };
}

export function isNearMe(
  jobLocation: string | undefined,
  resumeLocation: string | undefined,
): boolean {
  if (!jobLocation || !resumeLocation) return false;
  const city = resumeLocation.split(',')[0].trim().toLowerCase();
  return city.length > 2 && jobLocation.toLowerCase().includes(city);
}
