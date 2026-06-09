# Architecture

TalonMatch is a monorepo with a React frontend and Express backend. All AI calls go through the backend; the frontend never holds API keys.

## System Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  React 19 + Vite  ──  /api/*  ──►  Express 3001 │
│  Tailwind v4                                     │
│  Supabase JS (auth only)                         │
└─────────────────────────────────────────────────┘
         │                        │
         │ Google OAuth            │ Groq API
         ▼                        ▼ Remotive / Adzuna
    Supabase                  External APIs
```

---

## Request Flows

### 1. Resume Upload → Job Matches (`POST /api/match`)

```
PDF upload
   │
   ▼
resumeParserAI.js
   Groq llama-3.1-8b-instant
   → { skills[], experience[], projects[], education[], summary, full_name, contact_line }
   │
   ├──────────────────────────────────────────────────────┐
   │                                                      │
   ▼                                                      ▼
jobFetcher.js                                      designDNA.js (parallel)
   Remotive API  ─┐                                   Extract typeface, layout,
   Adzuna API    ─┼──► cross-source dedup              bullet style, accent color
   file cache     │    title validation                from PDF bytes (non-fatal)
                  ▼
            matchScorer.js
               token overlap scoring
               seniority cross-domain guard
               score cap at 99% if skill gaps
                  │
                  ▼
            ranked jobs[] + designDNA
               → response
```

### 2. Resume Tailoring (`POST /api/tailor-resume`)

```
{ parsedResume, jobDescription }
   │
   ▼
tailorResume.js
   Single Groq round-trip (json_schema strict mode)
   Anti-hallucination constraints baked into system prompt:
     - Numerical lock: dates/metrics must match source
     - Seniority lock: no title inflation
     - Banned words: leveraging, passionate, results-driven
   │
   ▼
V3 payload:
  {
    summary:    { original, tailored, rationale }
    experience: [{ id, originalBullets[], tailoredBullets[], rationale }]
    projects:   [{ id, originalDescription, tailoredDescription, rationale }]
    skills:     { matchCount, gapCount, matchingSkills[], missingSkills[] }
  }
   │
   ▼
TailoredResumeDrawer.tsx
   Accept/Cancel per bullet
   Diff view (moss = additions, shu = deletions)
   Single Commit button
```

### 3. Auth + Guest Bridge

```
Guest uploads PDF
   │
   ▼
App.tsx holds parsedResume, displayJobs in state
   │
   ▼ clicks "Tailor & Apply"
AuthModal.tsx
   persist to localStorage:
     talonmatch_pending_resume
     talonmatch_pending_tailor_job
     talonmatch_pending_results
   │
   ▼ Google OAuth redirect (Supabase PKCE)
   │
   ▼ SIGNED_IN event fires
onAuthStateChange
   restore from localStorage → state
   navigate to /tailor/:jobId
   (user never re-uploads)
```

---

## Frontend State

`App.tsx` owns all global state. No context providers, no external store.

```
App.tsx
  ├── user              Supabase session (single source of truth)
  ├── parsedResume      Groq-extracted resume object
  ├── displayJobs       Scored + ranked job array
  └── tailoredJobIds    Set<string> — tracks which jobs have been tailored

Routes:
  /                  Upload zone (no resume) or JobFeed (resume loaded)
  /tailor/:jobId     Full-page tailor workstation
  /kanban            Application pipeline board
  /strikes           Application log
  /settings          Design DNA + autosend config
  /history           Past searches
```

---

## Job Matching

```
matchScorer.js

Score = (matched skill tokens / total required tokens) × 100
  capped at 99 if any required skill is missing

Seniority guard:
  cross-domain penalty applied when job title domain
  differs from resume domain (prevents e.g. a
  "Senior DevOps" role matching a frontend resume at 80%)

Title validation:
  sub-token check filters irrelevant results before scoring
  (e.g. "Java Developer" blocked from "JavaScript Developer" feed)
```

---

## Caching

Job results are cached to `backend/cache/` as JSON files keyed by search params. Cache is checked before any API call. Manual "Sync fresh results" button bypasses cache.

---

## Key Design Constraints

- **0px border-radius** everywhere — enforced in design_system_rules.md
- **Single LLM round-trip** for tailoring — no sequential calls
- **Score cap at 99%** when required skills are missing — never show 100% with gaps
- **No fabricated metrics** — tailoring rewrites tone, not facts
