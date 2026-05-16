# Layer 2 Semantic Evaluation — Design Spec

**Date:** 2026-05-15
**Status:** Approved for implementation

---

## Overview

Layer 2 is a regex-based semantic filter that runs after Layer 1 structural validation. It strips banned prose terms from `tailored` bullet text before sections reach the client — silently, with no user-visible indication. The goal is to eliminate "bot smell" (corporate fluff, buzzwords) that the primary Groq tailoring pass occasionally introduces despite prompt-level prohibitions.

---

## Architecture

### Data Flow

```
Groq response (raw JSON section)
  → validateAndPatchSection()   [Layer 1 — streamTailor.ts]
  → auditSection()              [Layer 2 — auditorAgent.ts]
  → SSE event / client response
```

Layer 2 is called in `tailorResume.js` immediately after `validateAndPatchSection()`. It receives `result.section` (the already structurally-validated section) and returns `AuditResult`.

### New File: `backend/src/services/auditorAgent.ts`

**Exports:**
- `AuditResult` interface
- `auditSection(section: TailoredSection): AuditResult`

**`AuditResult` shape:**
```typescript
export interface AuditResult {
  section: TailoredSection;
  patched: boolean;
  patchCount: number; // number of content items modified
}
```

**Internal structure:**
- `FLUFF_PATTERNS: [RegExp, string][]` — substitution table (see below)
- `applyFluffFilter(text: string): { result: string; changed: boolean }` — applies patterns, collapses extra spaces, trims
- `auditSection()` — maps over `section.content`, applies filter to each item's `tailored` field only (never `original`)

If no item is changed, the original `section` reference is returned unchanged (no copy).

### Modified Files

**`backend/src/workers/streamTailor.ts`:**
- Export `TailoredSection` (currently unexported — `auditorAgent.ts` needs this type)

**`backend/tailorResume.js`:**
```js
const { auditSection } = require('./src/services/auditorAgent');

// In section processing loop, after validateAndPatchSection:
const layer1 = validateAndPatchSection(section, parsedResume);
let layer2Section = layer1.section;
try {
  layer2Section = auditSection(layer1.section).section;
} catch (err) {
  console.error('[auditorAgent] failed, using layer1 output:', err);
}
// use layer2Section going forward
```

---

## Substitution Rules

Applied in order, case-insensitive, across the full `tailored` string of each content item. After all substitutions, collapse multiple spaces and trim.

| Pattern | Replacement | Rationale |
|---|---|---|
| `\bleveraging\b` | `using` | Most common fluff verb form |
| `\bleverage\b` | `use` | Verb form |
| `\bspearheaded\b` | `led` | Past tense |
| `\bspearheading\b` | `leading` | Present participle |
| `\bspearheads\b` | `leads` | Third-person singular |
| `\bspearhead\b` | `lead` | Base form (applied last to avoid double-match) |
| `\bsynergi(es\|y)\b` | `` (strip) | Meaningless filler |
| `\bcutting[- ]edge\b` | `modern` | Overhyped adjective |
| `\bpassionate(ly)?\b` | `` (strip) | Subjective filler |
| `\bresults?[- ]driven\b` | `` (strip) | Generic filler |
| `\bcustomer[- ]obsessed\b` | `` (strip) | Corporate jargon |
| `\bhighly[- ]motivated\b` | `` (strip) | Generic filler |

**Scope:** Only the `tailored` field of each `TailoredContentItem` is modified. `original`, `id`, `label`, and `rationale` are never touched.

**Logging:** `console.warn('[auditorAgent] patched fluff in', item.id)` for each modified item.

---

## Tests

**File:** `backend/tests/auditorAgent.test.js`

| # | Scenario | Expected |
|---|---|---|
| 1 | `tailored` contains "leveraging" | Replaced with "using"; `patched: true`, `patchCount: 1` |
| 2 | `tailored` contains "spearheaded" | Replaced with "led" |
| 3 | Clean text (no banned terms) | No-op; `patched: false`, `patchCount: 0` |
| 4 | Multiple banned terms in one bullet | Item patched once; `patchCount: 1` (items, not occurrences) |
| 5 | `original` field contains "leveraging" | `original` unchanged — only `tailored` is filtered |

---

## Constraints

- **No LLM calls.** Regex only. Zero Groq token cost per audit.
- **Does not modify `original`.** Only `tailored` is filtered — diff view remains accurate.
- **Fails open.** If `auditSection` throws for any reason, `tailorResume.js` catches and continues with `layer1.section` unchanged (no crash).
- **TDD required.** Tests must fail first, pass after implementation.

---

## Out of Scope

- Seniority inflation detection in bullet prose (Layer 1 already locks role labels via `guardLabelLock`)
- Domain keyword validation (handled by TECHNOLOGY LOCK in system prompt)
- LLM-backed rewrites (deferred until Groq paid tier)
- Frontend indication of audit patches
