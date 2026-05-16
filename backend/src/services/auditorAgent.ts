import type { TailoredSection, TailoredContentItem } from '../workers/streamTailor';

export interface AuditResult {
  section: TailoredSection;
  patched: boolean;
  patchCount: number;
}

// Ordered so more specific forms (spearheaded, spearheading, spearheads) appear
// before the base form (spearhead), preventing double-match.
const FLUFF_PATTERNS: [RegExp, string][] = [
  [/\bleveraging\b/gi, 'using'],
  [/\bleverage\b/gi, 'use'],
  [/\bspearheaded\b/gi, 'led'],
  [/\bspearheading\b/gi, 'leading'],
  [/\bspearheads\b/gi, 'leads'],
  [/\bspearhead\b/gi, 'lead'],
  [/\bsynerg(?:y|ies)\b/gi, ''],
  [/\bcutting[- ]edge\b/gi, 'modern'],
  [/\bpassionate(?:ly)?\b/gi, ''],
  [/\bresults?[- ]driven\b/gi, ''],
  [/\bcustomer[- ]obsessed\b/gi, ''],
  [/\bhighly[- ]motivated\b/gi, ''],
];

function applyFluffFilter(text: string): { result: string; changed: boolean } {
  const substituted = FLUFF_PATTERNS
    .reduce((t, [re, sub]) => {
      return t.replace(re, (match, offset) => {
        if (!sub) return sub;
        // Preserve sentence-start capitalisation: if the match begins at the
        // very start of the string (or after trimming leading spaces), and the
        // matched word was capitalised, capitalise the replacement too.
        if (offset === 0 && match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
          return sub[0].toUpperCase() + sub.slice(1);
        }
        return sub;
      });
    }, text);
  const result = substituted.replace(/  +/g, ' ').trim();
  return { result, changed: substituted !== text };
}

export function auditSection(section: TailoredSection): AuditResult {
  let patchCount = 0;
  const content = section.content.map((item: TailoredContentItem) => {
    const { result, changed } = applyFluffFilter(item.tailored);
    if (changed) {
      patchCount++;
      console.warn('[auditorAgent] patched fluff in', item.id);
    }
    return changed ? { ...item, tailored: result } : item;
  });
  return {
    section: patchCount > 0 ? { ...section, content } : section,
    patched: patchCount > 0,
    patchCount,
  };
}
