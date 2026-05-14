# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`/backend`)

```bash
npm run dev     # nodemon + auto-restart
npm start       # plain node
npm test        # Jest (tests/ directory)
npx jest tests/matchScorer.test.js  # single test file
```

### Frontend (`/frontend`)

```bash
npm run dev          # Vite dev server (proxies /api → localhost:3001)
npm run build        # production build
npm run typecheck    # tsc --noEmit (TypeScript strict check, zero errors expected)
npm run lint         # ESLint (typescript-eslint flat config)
npm test             # Vitest single run
npm run test:watch   # Vitest watch
npx vitest run src/components/JobCard.test.tsx  # single test file
```

Both servers must run together for development. Frontend proxies `/api/*` to `http://localhost:3001`.

## Architecture

### Monorepo layout

```
backend/          Express API (port 3001)
frontend/         React 19 + Vite + Tailwind v4
design_system_rules.md   UI law (enforced)
.clauderules             behavioral/AI law (enforced)
```

### Request flow

1. User uploads PDF → `POST /api/match` → `resumeParserAI.js` (Groq) extracts structured resume → `jobFetcher.js` searches jobs (cached in `backend/cache/`) → `matchScorer.js` scores and ranks → response
2. User clicks "Tailor & Apply" → `POST /api/tailor-resume` → `tailorResume.js` (Groq `llama-3.1-8b-instant`, single-pass `json_schema` strict) → returns v3 shape

### Backend modules

| File                | Role                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `server.js`         | Express + 5 routes + multer file handling                           |
| `resumeParserAI.js` | Groq call → `{ skills, experience, projects, education, summary }`  |
| `jobFetcher.js`     | JSearch API + file cache                                            |
| `matchScorer.js`    | Skill token matching, score capping                                 |
| `tailorResume.js`   | Single-pass Groq tailoring; emits v3 schema with `rationale` fields |

### Frontend state (App.jsx)

`App.jsx` owns all global state: `user` (Supabase session), `parsedResume`, `displayJobs`, `tailoredJobIds` (Set). `supabase.auth.onAuthStateChange` is the single source of auth truth — never derive auth state from anywhere else.

### Key components

- **`JobCard.jsx`** — motion animations (shooting arrow on hover via `motion/react` AnimatePresence), single action button (READY → "Ready to Apply" / TAILOR → "Tailor & Apply"), ink-rule accent, `partitionSkills()` for +N/−N skill delta
- **`TailoredResumeDrawer.jsx`** — centered modal (not a drawer despite the name), Groq v3 data, diff view, Accept/Cancel per bullet, `rationale` fields on each WE entry + Project, single Commit button
- **`UserMenu.jsx`** — dual mode: guest (dashed avatar, Google sign-in prompt) and authenticated (circular avatar, sign-out)
- **`ResumeUpload.jsx`** — PDF-only drop zone, all inline styles with design tokens

### Styling system

Tailwind v4 (`@import "tailwindcss"`) + CSS custom properties. No `tailwind.config.js`. All color tokens live in `index.css` `:root`. Typography classes: `tm-mincho` (Shippori Mincho serif), `tm-mono` (JetBrains Mono), `tm-jp` (Japanese).

Design tokens (abbreviated):

```
--paper #F7F4EC   --washi #E8E4D8   --sumi #27302A
--moss  #5A7A4E   --shu   #A85E3E   --rule  #BFC3B6
--sumi-mute #6E776F   --sumi-faint #9DA29B
```

### Tests

**Frontend:** Vitest + `@testing-library/react` + MSW. API calls are mocked via `src/mocks/handlers.js`. `src/test/setup.js` provides global setup.

**Backend:** Jest. Test files live in `backend/tests/`. Groq is mocked via `jest.mock('groq-sdk')`. Export `_resetClientForTesting` on any module with a cached singleton so tests can reset it between runs.

### TDD Workflow (enforced)

1. **Write the test first.** Before implementing any new function or feature, create or update the test file for it.
2. **Run the test** to confirm it fails (red).
3. **Implement** the function.
4. **Run the test again** to confirm it passes (green).
5. Never report a task complete without running the relevant test suite and showing it passes.

## Enforced constraints (from .clauderules + design_system_rules.md)

**Geometry:** 0px border-radius everywhere — rounded corners are a bug.

**Typography:** `tm-mincho` for document headings; `tm-mono` for all technical data, status counts, button text.

**AI integrity:** NEVER fabricate years of experience, employment dates, or metrics not in the original resume. When JD asks for more experience than candidate has, use qualitative framing (Bridge Strategy). Calculated experience totals must derive from actual employment dates only.

**Auth flow:** Guest users clicking "Tailor & Apply" must hit `AuthModal`. Before OAuth redirect, persist resume data to `localStorage` (`talonmatch_pending_resume`, `talonmatch_pending_tailor_job`, `talonmatch_pending_results`). Restore on `SIGNED_IN` event via `onAuthStateChange`.

**Match score:** Cap displayed score at 99% when any required skill is missing. Never show 100% with skill gaps.

**Performance:** All tailoring must complete in a single GROQ round-trip. Multiple sequential LLM calls are prohibited.

**PDF export:** 15-second `AbortController` timeout on all `/api/match` calls.

**Single-action cards:** Each JobCard shows exactly one primary button — no Edit button on the card face.

## Environment variables

Backend `.env`:

```
GROQ_API_KEY=...
PORT=3001         # optional, defaults to 3001
```

Frontend `.env.local`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### V3 Tailoring Payload (The Contract)

The backend `POST /api/tailor-resume` must return a structured JSON matching this shape:

- `summary`: { original: string, tailored: string, rationale: string }
- `experience`: Array<{ id: string, originalBullets: string[], tailoredBullets: string[], rationale: string }>
- `projects`: Array<{ id: string, originalDescription: string, tailoredDescription: string, rationale: string }>
- `skills`: { matchCount: number, gapCount: number, matchingSkills: string[], missingSkills: string[] }

### Development & Testing

- **Frontend Test:** `npm test` (run from `frontend/`)
- **Backend Test:** `npm test` (run from `backend/`)
- **Performance Audit:** `node backend/scripts/perf-check.js` (Measures GROQ latency + payload size)

### Design & AI Alignment

- **Design Audit:** Verify all JSX/CSS against `design_system_rules.md` (specifically 0px radius and tm-mono/mincho).
- **Tailoring Check:** Ensure `tailorResume.js` respects the "Bridge Strategy" and uses GROQ `json_schema` strict mode.
- **Commit Pattern:** Use conventional commits (e.g., `feat(ui):`, `fix(api):`) to maintain a tactical log.

## Enforced Constraints: Reviewer-Soundness

**1. Seniority Lock (The "Leader" Ban)**

- **Strict Matching:** The AI must match the candidate's actual seniority level. If the candidate is a Junior/New Grad, NEVER use titles like "Leader," "Architect," or "Principal" in the summary or experience.
- **Contextual Tone:** For Junior roles, emphasize "rapid mastery," "technical foundations," and "collaborative contribution" rather than "driving strategy" or "managing teams."

**2. Anti-Hallucination & Fact Integrity**

- **Numerical Lock:** Employment dates, graduation years, and metrics must be 100% identical to the source PDF.
- **Metric Realism:** Do not invent "impact percentages" (e.g., "Improved speed by 20%") if they were not present in the original resume. Use qualitative technical descriptions instead.

**3. The "Bot Smell" Filter**

- **Banned Buzzwords:** Strictly prohibit: _leveraging, customer-obsessed, highly-motivated, results-driven, synergy, passionate._
- **Action-Oriented:** Start every bullet with a strong, specific technical verb (e.g., _Refactored, Deployed, Integrated, Debugged_).

**4. Full-Pass Requirement**

- **Zero-Drop Policy:** Every tailoring must process and return ALL sections from the source document (Summary, Experience, Projects, etc.). "No sections returned" is a system error.

## 4. Commands & Workflow

### The Legitimacy Audit

1. **Strike:** `node backend/scripts/perf-check.js` (Verify single-pass speed).
2. **Review:** Check the [Tailoring Panel](http://localhost:5173/) against `professional_output_audit.md`.
3. **Verify:** If the summary calls a Junior a "Leader," the task is NOT complete.
