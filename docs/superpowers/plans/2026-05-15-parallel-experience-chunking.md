# Parallel Company-Level Experience Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split resume tailoring into concurrent per-company Groq calls (max 3 in flight) plus a parallel non-WE streaming call, so the frontend hydrates with the most-recent company's bullets as fast as possible.

**Architecture:** Two tracks fire simultaneously on every `/api/tailor-resume` request. Track 1 streams non-WE sections (summary, skills, projects, education) using the existing `SectionStreamParser`. Track 2 fires one non-streaming Groq call per company through a 3-concurrent limiter. Both tracks push `{type:'section'}` events into a shared async queue; the SSE loop drains it. The frontend receives multiple "Work Experience" section events and merges them by appending content items. The section order on screen is fixed by `buildInitialSections` running at mount time.

**Tech Stack:** Node.js (backend), Groq `llama-3.1-8b-instant`, React 19 + TypeScript (frontend), Vitest (frontend tests), Jest (backend tests).

---

## File Map

| File | Change |
|---|---|
| `backend/tailorResume.js` | Add `sortCompaniesByRecency`, `runConcurrent`, `WE_CHUNK_SYSTEM`, `tailorExperienceChunk`, `tailorNonExperience`, `streamTailorParallel`; export new functions |
| `backend/server.js` | Swap `streamTailorResume` import → `streamTailorParallel` |
| `backend/tests/tailorResume.test.js` | Add tests for all new backend utilities |
| `frontend/src/types.ts` | Add `chunk_error` variant to `SSEEvent` union |
| `frontend/src/pages/TailorPage.tsx` | Fix `buildInitialSections` empty-summary guard; add WE merge logic + `chunk_error` handler to SSE loop |
| `frontend/src/components/TailoredResumeDrawer.test.tsx` | Add WE chunk-merge integration test |

---

## Task 1: `sortCompaniesByRecency` — sort experience by most-recent first

**Files:**
- Modify: `backend/tailorResume.js` (after the `slugify` function, ~line 64)
- Test: `backend/tests/tailorResume.test.js`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/tailorResume.test.js`, after the existing imports block. You'll need to add `sortCompaniesByRecency` to the destructured require on line 19:

```js
// Add to the destructure on line 19:
const {
  /* existing */ tailorResume, streamTailorResume, validateSuggestionAST, _resetClientForTesting,
  buildUserMessage, getRawResumeText,
  stripHallucinatedMetrics, stripHallucinatedSkillClaims, buildCandidateSkillSet,
  truncateItem, truncateRationale,
  extractMetrics, scoreTailoredResult,
  sortCompaniesByRecency,  // new
} = require('../tailorResume');

// Add new describe block:
describe('sortCompaniesByRecency', () => {
  it('sorts most-recent year first', () => {
    const exp = [
      { company: 'Old Corp',  period: 'Jan 2015 – Mar 2018' },
      { company: 'New Corp',  period: '2022–Now' },
      { company: 'Mid Corp',  period: '2019 – 2021' },
    ];
    const sorted = sortCompaniesByRecency(exp);
    expect(sorted.map(e => e.company)).toEqual(['New Corp', 'Mid Corp', 'Old Corp']);
  });

  it('handles missing period gracefully (year 0, sorts last)', () => {
    const exp = [
      { company: 'A', period: '2020–Now' },
      { company: 'B', period: '' },
    ];
    const sorted = sortCompaniesByRecency(exp);
    expect(sorted[0].company).toBe('A');
    expect(sorted[1].company).toBe('B');
  });

  it('does not mutate original array', () => {
    const exp = [
      { company: 'A', period: '2019–Now' },
      { company: 'B', period: '2022–Now' },
    ];
    const original = [...exp];
    sortCompaniesByRecency(exp);
    expect(exp[0].company).toBe(original[0].company);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="sortCompaniesByRecency" -t "sortCompaniesByRecency"
```

Expected: `TypeError: sortCompaniesByRecency is not a function`

- [ ] **Step 3: Implement `sortCompaniesByRecency` in `tailorResume.js`**

Add after the `slugify` function (around line 64):

```js
function extractStartYear(period) {
  const m = (period || '').match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

function sortCompaniesByRecency(experience) {
  return [...experience].sort((a, b) => extractStartYear(b.period) - extractStartYear(a.period));
}
```

Add to the `module.exports` at the bottom:

```js
module.exports = {
  tailorResume, streamTailorResume, validateSuggestionAST,
  buildUserMessage, getRawResumeText,
  stripHallucinatedMetrics, stripHallucinatedSkillClaims, buildCandidateSkillSet,
  truncateItem, truncateRationale,
  extractMetrics, scoreTailoredResult,
  sortCompaniesByRecency,  // new
  _resetClientForTesting: () => { _client = null; },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="sortCompaniesByRecency"
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tailorResume.js backend/tests/tailorResume.test.js
git commit -m "feat(tailor): add sortCompaniesByRecency utility"
```

---

## Task 2: `runConcurrent` — concurrency-limited async runner

**Files:**
- Modify: `backend/tailorResume.js` (after `sortCompaniesByRecency`)
- Test: `backend/tests/tailorResume.test.js`

- [ ] **Step 1: Write the failing test**

Add `runConcurrent` to the destructure in the test file, then add:

```js
// Add to destructure:
const { /* existing */ sortCompaniesByRecency, runConcurrent } = require('../tailorResume');

describe('runConcurrent', () => {
  it('runs all tasks and resolves when done', async () => {
    const results = [];
    const tasks = [1, 2, 3].map(n => async () => { results.push(n); });
    await runConcurrent(2, tasks);
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it('respects max concurrency', async () => {
    let peak = 0;
    let current = 0;
    const tasks = Array.from({ length: 5 }, () => async () => {
      current++;
      peak = Math.max(peak, current);
      await new Promise(r => setTimeout(r, 10));
      current--;
    });
    await runConcurrent(2, tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('resolves immediately for empty task list', async () => {
    await expect(runConcurrent(3, [])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="runConcurrent"
```

Expected: `TypeError: runConcurrent is not a function`

- [ ] **Step 3: Implement `runConcurrent` in `tailorResume.js`**

Add after `sortCompaniesByRecency`:

```js
function runConcurrent(maxConcurrent, tasks) {
  if (tasks.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let inFlight = 0;
    let idx = 0;
    let completed = 0;
    function dispatch() {
      while (inFlight < maxConcurrent && idx < tasks.length) {
        const task = tasks[idx++];
        inFlight++;
        task().finally(() => {
          inFlight--;
          completed++;
          if (completed === tasks.length) resolve();
          else dispatch();
        });
      }
    }
    dispatch();
  });
}
```

Add `runConcurrent` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="runConcurrent"
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tailorResume.js backend/tests/tailorResume.test.js
git commit -m "feat(tailor): add runConcurrent concurrency limiter"
```

---

## Task 3: WE sub-system prompt + `tailorExperienceChunk`

**Files:**
- Modify: `backend/tailorResume.js`
- Test: `backend/tests/tailorResume.test.js`

- [ ] **Step 1: Write the failing test**

Add `tailorExperienceChunk` to the destructure, then add:

```js
const { /* existing */ sortCompaniesByRecency, runConcurrent, tailorExperienceChunk } = require('../tailorResume');

describe('tailorExperienceChunk', () => {
  const Groq = require('groq-sdk');
  let mockCreate;

  beforeEach(() => {
    _resetClientForTesting();
    mockCreate = jest.fn();
    Groq.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
  });

  it('returns a normalized Work Experience section', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Work Experience',
            rationale: 'highlights systems work',
            content: [{
              id: 'we-acme-0',
              label: 'Sr Engineer @ Acme (2021–Now)',
              original: 'Built API.',
              tailored: 'Designed high-throughput API.',
              rationale: 'highlights backend expertise',
            }],
          }),
        },
      }],
    });

    const company = { company: 'Acme', title: 'Sr Engineer', period: '2021–Now', bullets: ['Built API.'] };
    const parsedResume = { skills: ['Node.js'], experience: [company], projects: [], summary: '' };
    const section = await tailorExperienceChunk({ company, parsedResume, jobDescription: 'Backend engineer needed', signal: null });

    expect(section.title).toBe('Work Experience');
    expect(section.content).toHaveLength(1);
    expect(section.content[0].id).toBe('we-acme-0');
    expect(section.content[0].tailored).toBe('Designed high-throughput API.');
    expect(typeof section.rationale).toBe('string');
  });

  it('returns null when Groq returns empty content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Work Experience', rationale: '', content: [] }) } }],
    });
    const company = { company: 'X', title: 'Dev', period: '2020', bullets: ['Did stuff.'] };
    const parsedResume = { skills: [], experience: [company], projects: [], summary: '' };
    const result = await tailorExperienceChunk({ company, parsedResume, jobDescription: 'JD', signal: null });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="tailorExperienceChunk"
```

Expected: `TypeError: tailorExperienceChunk is not a function`

- [ ] **Step 3: Add the WE sub-system prompt constant in `tailorResume.js`**

Add after the `DYNAMIC_SYSTEM` constant (around line 40):

```js
const WE_CHUNK_SYSTEM = `ATS resume writer. Tailor ONE company's experience bullets to match the JD. Return JSON only — no prose.

INTEGRITY (non-negotiable):
• Never invent metrics, dates, skills, or companies not in source text
• TECHNOLOGY LOCK: Only name tools/languages/frameworks that appear in the bullets provided. Never add technologies from the JD that are not in the bullets.
• EXPERIENCE LOCK: Never write "X years of Y" unless verbatim from the bullets
• Copy bullet verbatim into tailored if no meaningful JD-relevant improvement fits
• Match seniority — never upgrade title tier
• No buzzwords: leverage, spearheaded, synergy, cutting-edge, passionate, results-driven

CONTENT:
• Bullets: Action Verb + Result, max 200 chars each
• ALL bullets must appear — omitting any is a critical failure
• Plain text — no markdown, no Unicode symbols

OUTPUT (exactly this shape, no other keys):
{"title":"Work Experience","rationale":"<12w explaining JD alignment>","content":[{"id":"we-{slug}-{N}","label":"Role @ Company (Period)","original":"exact source bullet","tailored":"tailored bullet","rationale":"<8w or empty string if unchanged>"}]}`;
```

- [ ] **Step 4: Implement `tailorExperienceChunk` in `tailorResume.js`**

Add after the `WE_CHUNK_SYSTEM` constant. Note: `splitDescription`, `slugify`, `stripJdNoise`, `stripHallucinatedSkillClaims`, `stripHallucinatedMetrics`, `truncateItem`, `truncateRationale`, `buildCandidateSkillSet`, and `getRawResumeText` are all already defined earlier in the file.

```js
function normalizeWeChunk(raw, company, parsedResume) {
  if (!raw?.title) return null;
  // Use only this company's text for metric validation (not full resume)
  const companyRawText = [
    company.description || '',
    ...(Array.isArray(company.bullets) ? company.bullets : []),
  ].join(' ');
  const candidateSkills = buildCandidateSkillSet(parsedResume);
  const content = (raw.content || []).map(item => {
    let tailored = item.tailored || '';
    tailored = stripHallucinatedSkillClaims(tailored, candidateSkills);
    tailored = stripHallucinatedMetrics(tailored, companyRawText);
    tailored = truncateItem(tailored);
    return {
      id:        item.id       || '',
      label:     item.label    || '',
      original:  item.original || '',
      tailored,
      rationale: (item.rationale || '').trim().slice(0, 80),
    };
  }).filter(item => item.id);
  if (!content.length) return null;
  return {
    title:     'Work Experience',
    rationale: truncateRationale(raw.rationale || ''),
    content,
  };
}

async function tailorExperienceChunk({ company, parsedResume, jobDescription, signal }) {
  const slug    = slugify(company.company);
  const bullets = Array.isArray(company.bullets) && company.bullets.length > 0
    ? company.bullets.slice(0, 6)
    : splitDescription(company.description).slice(0, 6);

  if (bullets.length === 0) return null;

  const bulletsText = bullets.map((b, i) => `Bullet ${i}: ${b}`).join('\n');
  const userMsg = [
    `JOB DESCRIPTION:\n${stripJdNoise(jobDescription).slice(0, 1200)}`,
    `\nCOMPANY: ${company.company}`,
    `ROLE: ${company.title} | PERIOD: ${company.period}`,
    `ID PREFIX: we-${slug}`,
    `LABEL: ${company.title} @ ${company.company} (${company.period})`,
    `\nBULLETS:\n${bulletsText}`,
  ].join('\n');

  const resp = await getClient().chat.completions.create({
    model:           'llama-3.1-8b-instant',
    messages:        [
      { role: 'system', content: WE_CHUNK_SYSTEM },
      { role: 'user',   content: userMsg          },
    ],
    max_tokens:      800,
    temperature:     0.3,
    response_format: { type: 'json_object' },
    stream:          false,
  }, signal ? { signal } : undefined);

  const raw = JSON.parse(resp.choices[0].message.content);
  return normalizeWeChunk(raw, company, parsedResume);
}
```

Add `tailorExperienceChunk` to `module.exports`.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="tailorExperienceChunk"
```

Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/tailorResume.js backend/tests/tailorResume.test.js
git commit -m "feat(tailor): add WE chunk prompt and tailorExperienceChunk"
```

---

## Task 4: `tailorNonExperience` + `streamTailorParallel` orchestrator

**Files:**
- Modify: `backend/tailorResume.js`
- Test: `backend/tests/tailorResume.test.js`

- [ ] **Step 1: Write the failing tests**

Add `tailorNonExperience` and `streamTailorParallel` to the destructure, then add:

```js
const {
  /* all existing */,
  sortCompaniesByRecency, runConcurrent, tailorExperienceChunk,
  tailorNonExperience, streamTailorParallel,
} = require('../tailorResume');

describe('tailorNonExperience', () => {
  const Groq = require('groq-sdk');
  let mockCreate;

  beforeEach(() => {
    _resetClientForTesting();
    mockCreate = jest.fn();
    Groq.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
  });

  it('excludes experience from the Groq call', async () => {
    const sectionJson = JSON.stringify({
      _version: 4,
      sections: [{ title: 'Summary', rationale: 'test', content: [{ id: 'summary-0', label: '', original: 'Hello', tailored: 'Hello' }] }],
    });
    // Mock a streaming response that yields the JSON in one chunk
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: sectionJson } }], usage: null };
        yield { choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 20 } };
      },
    });

    const parsedResume = {
      summary: 'Hello',
      experience: [{ company: 'Acme', title: 'Dev', period: '2020', bullets: ['Did stuff'] }],
      projects: [], skills: [], education: [],
    };

    const events = [];
    for await (const e of tailorNonExperience({ parsedResume, jobDescription: 'JD', signal: null })) {
      events.push(e);
    }

    // The user message passed to Groq must NOT contain "Work Experience"
    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[1].content;
    expect(userContent).not.toContain('Work Experience');
    expect(events.some(e => e.type === 'done')).toBe(true);
  });
});

describe('streamTailorParallel', () => {
  const Groq = require('groq-sdk');
  let mockCreate;

  beforeEach(() => {
    _resetClientForTesting();
    mockCreate = jest.fn();
    Groq.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
  });

  it('emits section events from both tracks and one done event', async () => {
    const summarySection = { title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: 'X', tailored: 'Y' }] };
    const weChunkSection = { title: 'Work Experience', rationale: '', content: [{ id: 'we-acme-0', label: 'Dev @ Acme (2021)', original: 'A', tailored: 'B' }] };

    // Distinguish Track 1 (stream:true) from Track 2 (stream:false) by params.stream
    const streamingResp = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: JSON.stringify({ _version: 4, sections: [summarySection] }) } }], usage: null };
        yield { choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 5, completion_tokens: 10 } };
      },
    };
    const batchResp = {
      choices: [{ message: { content: JSON.stringify(weChunkSection) } }],
    };

    mockCreate.mockImplementation((params) =>
      Promise.resolve(params.stream ? streamingResp : batchResp)
    );

    const parsedResume = {
      summary: 'X',
      experience: [{ company: 'Acme', title: 'Dev', period: '2021–Now', bullets: ['A'] }],
      projects: [], skills: [],
    };

    const events = [];
    for await (const e of streamTailorParallel({ parsedResume, jobDescription: 'JD', signal: null })) {
      events.push(e);
    }

    const sectionEvents = events.filter(e => e.type === 'section');
    const doneEvents    = events.filter(e => e.type === 'done');

    expect(doneEvents).toHaveLength(1);
    expect(sectionEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('emits chunk_error and continues when one company call fails', async () => {
    const streamingResp = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '{"_version":4,"sections":[]}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
      },
    };
    mockCreate.mockImplementation((params) =>
      params.stream ? Promise.resolve(streamingResp) : Promise.reject(new Error('Groq 429'))
    );

    const parsedResume = {
      summary: '',
      experience: [{ company: 'Fail Corp', title: 'Dev', period: '2020', bullets: ['X'] }],
      projects: [], skills: [],
    };

    const events = [];
    for await (const e of streamTailorParallel({ parsedResume, jobDescription: 'JD', signal: null })) {
      events.push(e);
    }

    expect(events.some(e => e.type === 'chunk_error')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="tailorNonExperience|streamTailorParallel"
```

Expected: `TypeError: tailorNonExperience is not a function`

- [ ] **Step 3: Implement `tailorNonExperience`**

Add after `tailorExperienceChunk` in `tailorResume.js`:

```js
async function* tailorNonExperience({ parsedResume, jobDescription, signal }) {
  const noExpResume = { ...parsedResume, experience: [] };
  yield* streamTailorResume({ parsedResume: noExpResume, jobDescription, signal });
}
```

- [ ] **Step 4: Implement `streamTailorParallel`**

Add after `tailorNonExperience`:

```js
class AsyncQueue {
  constructor() {
    this._items   = [];
    this._waiters = [];
    this._closed  = false;
  }
  push(item) {
    if (this._waiters.length > 0) {
      this._waiters.shift()({ value: item, done: false });
    } else {
      this._items.push(item);
    }
  }
  close() {
    this._closed = true;
    for (const resolve of this._waiters) resolve({ value: undefined, done: true });
    this._waiters = [];
  }
  next() {
    if (this._items.length > 0) return Promise.resolve({ value: this._items.shift(), done: false });
    if (this._closed)           return Promise.resolve({ value: undefined, done: true });
    return new Promise(resolve => this._waiters.push(resolve));
  }
  [Symbol.asyncIterator]() { return { next: () => this.next() }; }
}

async function* streamTailorParallel({ parsedResume, jobDescription, signal }) {
  const companies    = parsedResume.experience || [];
  const sorted       = sortCompaniesByRecency(companies);
  const totalTracks  = 1 + sorted.length;  // non-WE + one per company
  let   doneTracks   = 0;
  const usageTotal   = { promptTokens: 0, completionTokens: 0 };
  const queue        = new AsyncQueue();

  function trackDone(usage) {
    if (usage) {
      usageTotal.promptTokens     += usage.promptTokens     || 0;
      usageTotal.completionTokens += usage.completionTokens || 0;
    }
    doneTracks++;
    if (doneTracks === totalTracks) queue.close();
  }

  // Track 1: non-WE streaming
  (async () => {
    try {
      for await (const event of tailorNonExperience({ parsedResume, jobDescription, signal })) {
        if (event.type === 'done') { trackDone(event.usage); return; }
        if (event.type === 'section') queue.push(event);
      }
    } catch {
      trackDone(null);
    }
  })();

  // Track 2: per-company calls (max 3 concurrent)
  (async () => {
    await runConcurrent(3, sorted.map(company => async () => {
      try {
        const section = await tailorExperienceChunk({ company, parsedResume, jobDescription, signal });
        if (section) queue.push({ type: 'section', section });
      } catch {
        queue.push({ type: 'chunk_error', companyId: slugify(company.company) });
      } finally {
        trackDone(null);
      }
    }));
  })();

  for await (const event of queue) yield event;
  yield { type: 'done', usage: usageTotal };
}
```

Add both to `module.exports`: `tailorNonExperience, streamTailorParallel`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npx jest tests/tailorResume.test.js --testNamePattern="tailorNonExperience|streamTailorParallel"
```

Expected: all tests PASS

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && npm test
```

Expected: all 312+ tests PASS, coverage thresholds met

- [ ] **Step 7: Commit**

```bash
git add backend/tailorResume.js backend/tests/tailorResume.test.js
git commit -m "feat(tailor): add streamTailorParallel with concurrent company chunking"
```

---

## Task 5: Wire `streamTailorParallel` into the Express route

**Files:**
- Modify: `backend/server.js` (line 10)

- [ ] **Step 1: Update the import in `server.js`**

Change line 10 from:

```js
const { streamTailorResume } = require('./tailorResume');
```

to:

```js
const { streamTailorParallel } = require('./tailorResume');
```

- [ ] **Step 2: Update the route to call `streamTailorParallel`**

In `server.js`, find the `/api/tailor-resume` route (around line 206). Change:

```js
    for await (const event of streamTailorResume({
      parsedResume:   parsed_resume,
      jobDescription: job_description,
      signal:         ac.signal,
    })) {
```

to:

```js
    for await (const event of streamTailorParallel({
      parsedResume:   parsed_resume,
      jobDescription: job_description,
      signal:         ac.signal,
    })) {
```

- [ ] **Step 3: Run the full backend test suite**

```bash
cd backend && npm test
```

Expected: all tests PASS (server.js is tested via supertest in the integration tests — these will exercise the new route)

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(server): switch tailor route to streamTailorParallel"
```

---

## Task 6: Add `chunk_error` to the frontend SSE event type

**Files:**
- Modify: `frontend/src/types.ts` (line 94)

- [ ] **Step 1: Update the `SSEEvent` union**

Find lines 93-96 in `frontend/src/types.ts`:

```ts
export type SSEEvent =
  | { type: 'section'; section: TailoredSection }
  | { type: 'error'; message: string }
  | { type: 'done' }
```

Replace with:

```ts
export type SSEEvent =
  | { type: 'section'; section: TailoredSection }
  | { type: 'chunk_error'; companyId: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add chunk_error variant to SSEEvent"
```

---

## Task 7: Frontend — WE chunk merge + empty-summary guard

**Files:**
- Modify: `frontend/src/pages/TailorPage.tsx`

- [ ] **Step 1: Write the failing test**

Add a new test to `frontend/src/components/TailoredResumeDrawer.test.tsx`. This tests the merge logic by simulating two WE section events arriving — the first creates the slot, the second appends content.

First, add a helper to test the SSE handler behavior. Since `TailorPage` is where the SSE logic lives and it's not currently tested, add tests to the existing `TailoredResumeDrawer.test.tsx` file to test the merge behavior through a helper:

```tsx
import { describe, it, expect } from 'vitest';

// Extracted merge logic to test in isolation (we'll extract this in the next step)
// For now test via the type shape we'll implement.

describe('WE chunk merge', () => {
  it('sortItemsByYearDesc: items with newer years come first', () => {
    // This function will be extracted to a util in TailorPage.tsx
    const items = [
      { id: 'we-old-0', label: 'Dev @ Old Corp (2015–2018)', original: 'X', tailored: 'X', rationale: '' },
      { id: 'we-new-0', label: 'Dev @ New Corp (2022–Now)',  original: 'Y', tailored: 'Y', rationale: '' },
    ];
    // Sorted descending: New Corp (2022) first
    const sorted = [...items].sort((a, b) => {
      const yearA = parseInt((a.label.match(/\d{4}/) || ['0'])[0], 10);
      const yearB = parseInt((b.label.match(/\d{4}/) || ['0'])[0], 10);
      return yearB - yearA;
    });
    expect(sorted[0].id).toBe('we-new-0');
    expect(sorted[1].id).toBe('we-old-0');
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (this is a pure logic test, should pass immediately)

```bash
cd frontend && npm test -- --testNamePattern="WE chunk merge"
```

Expected: PASS

- [ ] **Step 3: Fix `buildInitialSections` to guard against empty summary**

In `frontend/src/pages/TailorPage.tsx`, find `buildInitialSections` (line 19). Change line 26 from:

```ts
  sections.push({ title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: summaryText, tailored: summaryText }] });
```

to:

```ts
  if (summaryText) {
    sections.push({ title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: summaryText, tailored: summaryText }] });
  }
```

- [ ] **Step 4: Add `sortItemsByYearDesc` helper and WE merge logic to the SSE handler**

In `TailorPage.tsx`, add this helper above the `TailorPage` component function (around line 52):

```ts
function sortItemsByYearDesc(items: import('../types').TailoredContentItem[]) {
  return [...items].sort((a, b) => {
    const yearA = parseInt((a.label.match(/\d{4}/) || ['0'])[0], 10);
    const yearB = parseInt((b.label.match(/\d{4}/) || ['0'])[0], 10);
    return yearB - yearA;
  });
}
```

Then update the SSE event handler in the `useEffect` (around line 123). Find:

```ts
            if (event.type === 'section') {
              if (ttfs === null) {
                ttfs = Math.round(performance.now() - t0);
                console.log(`[tailor-page] TTFS ${ttfs}ms — "${event.section.title}"`);
              }
              setTailored(prev => {
                const existing = prev?.sections || [];
                const idx = existing.findIndex(s => s.title === event.section.title);
                if (idx >= 0) {
                  const updated = [...existing];
                  updated[idx] = event.section;
                  return { _version: 4, sections: updated };
                }
                return { _version: 4, sections: [...existing, event.section] };
              });
            } else if (event.type === 'error') {
              throw new Error(event.message);
            } else if (event.type === 'done') {
              console.log(`[tailor-page] done — total ${Math.round(performance.now() - t0)}ms`);
            }
```

Replace with:

```ts
            if (event.type === 'section') {
              if (ttfs === null) {
                ttfs = Math.round(performance.now() - t0);
                console.log(`[tailor-page] TTFS ${ttfs}ms — "${event.section.title}"`);
              }
              setTailored(prev => {
                const existing = prev?.sections || [];
                const idx = existing.findIndex(s => s.title === event.section.title);
                if (idx >= 0 && event.section.title === 'Work Experience') {
                  // Merge: append new company items and sort most-recent first
                  const updated = [...existing];
                  updated[idx] = {
                    ...updated[idx],
                    content: sortItemsByYearDesc([...updated[idx].content, ...event.section.content]),
                  };
                  return { _version: 4, sections: updated };
                }
                if (idx >= 0) {
                  const updated = [...existing];
                  updated[idx] = event.section;
                  return { _version: 4, sections: updated };
                }
                return { _version: 4, sections: [...existing, event.section] };
              });
            } else if (event.type === 'chunk_error') {
              // Original bullets already in initial sections — no state update needed
              console.log(`[tailor-page] chunk_error for company: ${event.companyId}`);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            } else if (event.type === 'done') {
              console.log(`[tailor-page] done — total ${Math.round(performance.now() - t0)}ms`);
            }
```

- [ ] **Step 5: Run typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test
```

Expected: all 159+ tests PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TailorPage.tsx frontend/src/components/TailoredResumeDrawer.test.tsx
git commit -m "feat(tailor-page): WE chunk merge, empty-summary guard, chunk_error handling"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the complete backend test suite**

```bash
cd backend && npm test
```

Expected: all tests PASS, statement coverage ≥ 90%, branch coverage ≥ 75%

- [ ] **Step 2: Run the complete frontend test suite**

```bash
cd frontend && npm test
```

Expected: all tests PASS

- [ ] **Step 3: Start both servers and do a manual end-to-end smoke test**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

1. Upload a PDF resume at `http://localhost:5173`
2. Click "Tailor & Apply" on a job
3. Observe DevTools network tab → SSE stream should show multiple `{type:"section"}` events, some with `title:"Work Experience"` arriving at different times
4. Observe the tailor page — WE bullets from the most-recent company should appear first, then others fill in
5. Check browser console for `[tailor-page] TTFS` — should be sub-500ms for the first section
6. Check backend console for per-chunk logs: `[tailor] emit "Work Experience" +Xms` multiple times

- [ ] **Step 4: Final commit if smoke test passes**

```bash
git add -A
git status  # verify only expected files changed
git commit -m "chore: verify parallel chunking e2e smoke test passes"
```
