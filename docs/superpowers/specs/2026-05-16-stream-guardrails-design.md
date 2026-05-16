# Stream-Level Layer 1 Static Guardrails

**Date:** 2026-05-16
**Branch:** feat/pdf-export-and-anti-hallucination
**Status:** Implemented

---

## Summary

Synchronous validation layer injected into the backend SSE streaming pipeline. Runs between `normalizeSectionItem()` and `yield { type: 'section' }` in `tailorResume.js`. Guards AI-generated section chunks against structural corruption before they are sent to the client. On failure, falls back to original resume content silently.

---

## Architecture

**File:** `backend/src/workers/streamTailor.ts`
**Runtime:** `tsx` (TypeScript executor, no compile step). Backend scripts updated to `tsx server.js`.
**Jest transform:** Custom `jest-esbuild-transform.cjs` using bundled esbuild — no additional npm deps required.

**Integration point in `tailorResume.js` stream loop:**

```js
const raw = normalizeSectionItem(rawSec, parsedResume);
if (raw) {
  const { section } = validateAndPatchSection(raw, parsedResume);
  yield { type: 'section', section };
}
```

No changes to `server.js`, SSE protocol, or any frontend file.

---

## Public API

```typescript
export function validateAndPatchSection(
  section: TailoredSection,
  parsedResume: ParsedResume,
): ValidationResult

export interface ValidationResult {
  section: TailoredSection;   // AI section or fallback
  patched: boolean;
  reason?: string;            // guard name if patched
}
```

---

## Source Context

`buildSourceContext(parsedResume)` derives three structures used by the guards:

- **`knownTitles: string[]`** — ordered section titles from `style_config.sections` or detected from resume data
- **`labelSet: Set<string>`** — all non-empty structural label strings across experience, projects, education, skills
- **`byType: Map<SectionType, { title, content }>`** — original content items keyed by section type; used for fallback reconstruction

---

## Four Guards (short-circuit execution order)

### Guard 1 — Title Integrity
Checks `section.title` against `knownTitles` with strict string identity (no case-folding).

**Failure trigger:** Title not in source set.
**Action:** Fallback.

### Guard 2 — Dimension Parity
Classifies `section.title` → section type → looks up source content length. Checks `section.content.length >= sourceLength`.

**Failure trigger:** Fewer items than source (dropped bullets or entries).
**Action:** Fallback.

### Guard 3 — Label Lock (Rule 11)
For every `content` item where `item.label !== ''`, checks that the label exists verbatim in `labelSet`. Labels encode `"${title} @ ${company} (${period})"` for experience; project names and degree strings for other types.

**Failure trigger:** Any mutated date, company name, or missing character in a label.
**Action:** Fallback.

### Guard 4 — Syntax Integrity
Counts `~~` and `++` occurrences across all `item.tailored` strings. An odd count means a marker pair is left open/dangling.

**Failure trigger:** Odd count of `~~` or `++` in section.
**Action:** Fallback.

---

## Fallback Behavior

When any guard fires:

- `console.warn('[streamTailor] guard fired: <reason> — <title>')`
- `section.title` → canonical source title (via `classifySection` → `byType` lookup)
- `section.content` → original items with `tailored === original`
- `section.rationale` → `''`
- `patched: true`, `reason: '<guard-name>'`

Client receives a valid section; no SSE protocol change; no client-visible error.

---

## Performance

All guards synchronous. Zero I/O. Fixed-width regex delimiters (no catastrophic backtracking risk). Target < 1ms per section; well within the 2ms budget.

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/workers/streamTailor.ts` | **New** — guard module |
| `backend/tailorResume.js` | +2 lines: require + call in stream loop |
| `backend/package.json` | `tsx` devDep, updated `start`/`dev` scripts, Jest transform config |
| `backend/jest-esbuild-transform.cjs` | **New** — esbuild-based Jest TS transformer |
| `backend/tests/tailorResume.test.js` | Fixed fixture label mismatch in one test |
