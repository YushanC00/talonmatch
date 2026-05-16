# Parallel Company-Level Experience Chunking

**Date:** 2026-05-15  
**Branch:** feat/pdf-export-and-anti-hallucination  
**Status:** Approved — pending implementation plan

---

## Problem

Current `/api/tailor-resume` fires one Groq call for the entire resume. A resume with 17 experience bullets across 5 companies serializes all work into one stream. First-paint of the most-recent company (highest JD relevance) is blocked behind summary/skills parsing overhead and the model generating all preceding content first.

---

## Goal

- Fire concurrent per-company Groq calls (max 3 in flight)
- Non-WE sections (summary, skills, projects, education) stream in parallel on a separate track
- Frontend renders sections immediately as chunks arrive, in resume source order
- Keep all sections dynamic: only render sections present in the source resume

---

## Architecture

### Two concurrent tracks (both start on request arrival)

**Track 1 — Non-WE streaming call**
- Same `SectionStreamParser` as today
- `parsedResume.experience` set to `[]` before `buildUserMessage()` so WE is excluded
- Streams: summary, skills, projects, education — only if present in source resume
- Section order preserved via `parsedResume.style_config?.sections`

**Track 2 — Per-company batch calls**
- Sort `parsedResume.experience` by most-recent period first (parse year from `period` string)
- Concurrency limiter: max 3 in-flight (inline implementation, no npm dependency)
- Each call: non-streaming `json_object` Groq response for one company's bullets
- Dedicated slim system prompt (see below)
- As each resolves → push `{type:'section', section}` to shared event queue

### Async event queue (fan-in)

```
Track 1 events ──┐
Track 2 events ──┼──→ queue[] ──→ SSE drain loop ──→ client
                  │
           (abort on close)
```

- Shared async queue with push/drain pattern
- Single SSE `res.write()` loop drains queue
- `{type:'done', usage}` emitted only when both tracks finish (usage summed across all calls)
- AbortController propagates to all in-flight calls on client disconnect

### WE sub-system prompt

```
ATS resume writer. Tailor ONE company's experience bullets to match JD. Return JSON only.

INTEGRITY (non-negotiable):
• Never invent metrics, dates, skills, or companies not in source text
• TECHNOLOGY LOCK: Only name tools/languages/frameworks from candidate resume
• EXPERIENCE LOCK: Never write "X years of Y" unless verbatim from resume
• Copy bullet verbatim if no meaningful JD-relevant improvement
• Match seniority — never upgrade title tier
• No buzzwords: leverage, spearheaded, synergy, cutting-edge, passionate

CONTENT:
• Bullets: Action Verb + Result, max 200 chars
• ALL bullets must appear — omitting any is a critical failure
• Plain text — no markdown, no Unicode

OUTPUT (exactly this shape):
{"title":"Work Experience","rationale":"<12w>","content":[{"id":"we-{slug}-{N}","label":"Role @ Company (Period)","original":"...","tailored":"...","rationale":"<8w or empty>"}]}
```

---

## Backend file changes

### `backend/tailorResume.js`

1. **Add `sortCompaniesByRecency(experience)`** — parses the first 4-digit year from `period` string (handles `"2021–Now"`, `"Jan 2019 – Mar 2021"`, etc.), sorts descending (most recent first)
2. **Add `concurrencyLimit(n, tasks)`** — inline async p-limit (no npm dep); runs N promises concurrently
3. **Add `tailorExperienceChunk({ company, jobDescription, signal })`** — non-streaming Groq call with WE sub-prompt; returns normalized `TailoredSection`
4. **Add `tailorNonExperience({ parsedResume, jobDescription, signal })`** — existing stream logic with `experience: []`; returns async generator of section events
5. **Add `streamTailorParallel({ parsedResume, jobDescription, signal })`** — orchestrator:
   - Creates shared event queue
   - Fires Track 1 (non-WE stream) and Track 2 (company chunks) simultaneously
   - Merges via queue, yields events to caller
   - Yields `{type:'done'}` when both tracks complete
6. **Export `streamTailorParallel`**; keep existing `streamTailorResume` for backward compat + tests

### `backend/server.js`

- Import `streamTailorParallel` instead of `streamTailorResume` in `/api/tailor-resume` route
- No other changes

---

## Frontend file changes

### `frontend/src/components/TailoredResumeDrawer.tsx`

**Section slot map** (replaces array append):

```ts
type SectionMap = Map<string, TailoredSection>
```

On SSE `section` event:
- **Non-WE**: `map.set(section.title, section)` → render immediately
- **WE chunk** (`section.title === 'Work Experience'`):
  - If slot empty: `map.set('Work Experience', section)`
  - If slot exists: append `section.content` items, re-sort all items by first 4-digit year found in `label` string (descending)

**Render order**: derive from `parsedResume.style_config?.sections` (or fallback order). Map sections in that order; unresolved slots show skeleton placeholder.

**Skeleton placeholder**: thin loading bar in section position, replaced when chunk arrives.

**Error slot** (`{type:'chunk_error', companyId}`): show company label + "tailoring unavailable — showing original" with original bullets from `parsedResume`.

---

## Error handling

| Failure | Behavior |
|---|---|
| One WE company call fails | Emit `{type:'chunk_error', companyId}` → frontend shows original bullets for that company |
| Non-WE track fails | Emit `{type:'error', message}` → full error state (same as today) |
| Client disconnect | AbortController cancels all in-flight Groq calls |
| All WE calls fail | Non-WE sections still render; WE slot shows all originals |

---

## Testing

**Backend unit tests** (add to `backend/tests/tailorResume.test.js`):
- `sortCompaniesByRecency`: various period string formats
- `concurrencyLimit`: verify max N concurrent, correct order of results
- `tailorExperienceChunk`: mock Groq, verify output shape matches TailoredSection
- `streamTailorParallel`: mock both tracks, verify events arrive and done fires once

**Frontend tests** (add to relevant test file):
- WE chunk merge: two WE section events → single merged section with all content items
- Section order: chunks arrive out of order → rendered in resume source order
- Error slot: `chunk_error` event → original bullets displayed

---

## Constraints

- `CLAUDE.md`: single-pass Groq requirement applies per-call; parallel calls do not violate it (each call is still single-pass for its scope)
- `CLAUDE.md`: 15-second AbortController timeout on `/api/match` does not apply to `/api/tailor-resume`
- No new npm dependencies
- Model: `llama-3.1-8b-instant` for all calls (same as today)
- Max tokens per company call: 800 (smaller than current 3000 — each call covers fewer bullets)
