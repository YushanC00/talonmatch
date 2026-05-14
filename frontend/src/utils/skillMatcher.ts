// Delegate all logic to the universal tokenMatcher.
// This file kept for backward compatibility with existing imports.
export { skillMatches, partitionSkills, isNearMe } from './tokenMatcher';

// Legacy export — only used by skillMatcher.test.js.
// Fixed: (.{2,}) guard prevents stripping standalone "JS" to "".
export function normalizeSkill(s: string) {
  return s.toLowerCase()
    .replace(/\.js$/i, '')
    .replace(/(.{2,})js$/i, '$1')
    .trim();
}
