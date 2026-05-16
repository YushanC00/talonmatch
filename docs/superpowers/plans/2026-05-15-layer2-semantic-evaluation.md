# Layer 2 Semantic Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a regex-based fluff filter (`auditorAgent.ts`) that strips banned buzzwords from tailored bullet text after Layer 1 structural validation, before sections are emitted to the client.

**Architecture:** New service file `backend/src/services/auditorAgent.ts` exports `auditSection()`. Called in `streamTailorResume()` (inside `tailorResume.js`) immediately after `validateAndPatchSection()`. Fails open — any exception falls back to the Layer 1 output with no crash.

**Tech Stack:** TypeScript (esbuild transform via Jest, runtime via tsx), Node.js CommonJS module interop, Jest for tests.

---

## File Map

| Action | Path | Role |
|---|---|---|
| Create | `backend/src/services/auditorAgent.ts` | Layer 2 fluff filter — exports `auditSection` |
| Modify | `backend/src/workers/streamTailor.ts` | Export `TailoredSection` and `TailoredContentItem` (needed by auditorAgent) |
| Modify | `backend/tailorResume.js` | Require auditorAgent, call `auditSection` after `validateAndPatchSection` |
| Create | `backend/tests/auditorAgent.test.js` | 5 unit tests for `auditSection` |

---

## Task 1: Write failing tests

**Files:**
- Create: `backend/tests/auditorAgent.test.js`

- [ ] **Step 1.1: Create the test file**

```js
// backend/tests/auditorAgent.test.js
'use strict';

const { auditSection } = require('../src/services/auditorAgent');

function makeSection(items) {
  return { title: 'Work Experience', rationale: '', content: items };
}

function makeItem(tailored, original) {
  return { id: 'we-test-0', label: '', original: original ?? tailored, tailored };
}

describe('auditorAgent', () => {
  test('replaces "leveraging" (any case) with "using"', () => {
    const section = makeSection([makeItem('Leveraging React to build UIs.')]);
    const { section: out, patched, patchCount } = auditSection(section);
    expect(out.content[0].tailored).toBe('Using React to build UIs.');
    expect(patched).toBe(true);
    expect(patchCount).toBe(1);
  });

  test('replaces "spearheaded" with "led"', () => {
    const section = makeSection([makeItem('Spearheaded the migration to AWS.')]);
    const { section: out, patched } = auditSection(section);
    expect(out.content[0].tailored).toBe('Led the migration to AWS.');
    expect(patched).toBe(true);
  });

  test('no-op on clean text — patched: false, patchCount: 0', () => {
    const section = makeSection([makeItem('Built REST API with Node.js.')]);
    const { section: out, patched, patchCount } = auditSection(section);
    expect(out.content[0].tailored).toBe('Built REST API with Node.js.');
    expect(patched).toBe(false);
    expect(patchCount).toBe(0);
  });

  test('patchCount counts items, not occurrences (multi-fluff one bullet)', () => {
    // "leveraging" + "synergy" + "results-driven" in ONE item → patchCount = 1
    const section = makeSection([
      makeItem('Leveraging synergy to deliver results-driven outcomes.'),
    ]);
    const { patchCount } = auditSection(section);
    expect(patchCount).toBe(1);
  });

  test('never modifies the original field', () => {
    // tailored has fluff; original also has fluff — only tailored gets patched
    const section = makeSection([
      makeItem('Leveraging React to build UIs.', 'Leveraging React to build UIs.'),
    ]);
    const { section: out } = auditSection(section);
    expect(out.content[0].tailored).toBe('Using React to build UIs.');
    expect(out.content[0].original).toBe('Leveraging React to build UIs.');
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/auditorAgent.test.js --no-coverage
```

Expected output contains: `Cannot find module '../src/services/auditorAgent'`

---

## Task 2: Export types and implement auditorAgent.ts

**Files:**
- Modify: `backend/src/workers/streamTailor.ts` (lines 32–57 — add `export` to two interfaces)
- Create: `backend/src/services/auditorAgent.ts`

- [ ] **Step 2.1: Export `TailoredSection` and `TailoredContentItem` from `streamTailor.ts`**

In `backend/src/workers/streamTailor.ts`, change:

```typescript
// Before (line 32):
interface TailoredContentItem {

// After:
export interface TailoredContentItem {
```

```typescript
// Before (line 40):
interface TailoredSection {

// After:
export interface TailoredSection {
```

(The `ValidationResult` export at line 46 already exists — do not touch it.)

- [ ] **Step 2.2: Create `backend/src/services/` directory**

```bash
mkdir -p /Users/shan/job-search-app/backend/src/services
```

- [ ] **Step 2.3: Create `backend/src/services/auditorAgent.ts`**

```typescript
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
  [/\bsynergi(?:es|y)\b/gi, ''],
  [/\bcutting[- ]edge\b/gi, 'modern'],
  [/\bpassionate(?:ly)?\b/gi, ''],
  [/\bresults?[- ]driven\b/gi, ''],
  [/\bcustomer[- ]obsessed\b/gi, ''],
  [/\bhighly[- ]motivated\b/gi, ''],
];

function applyFluffFilter(text: string): { result: string; changed: boolean } {
  const result = FLUFF_PATTERNS
    .reduce((t, [re, sub]) => t.replace(re, sub), text)
    .replace(/  +/g, ' ')
    .trim();
  return { result, changed: result !== text };
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
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd backend && npx jest tests/auditorAgent.test.js --no-coverage
```

Expected output:
```
PASS tests/auditorAgent.test.js
  auditorAgent
    ✓ replaces "leveraging" (any case) with "using"
    ✓ replaces "spearheaded" with "led"
    ✓ no-op on clean text — patched: false, patchCount: 0
    ✓ patchCount counts items, not occurrences (multi-fluff one bullet)
    ✓ never modifies the original field

Tests: 5 passed, 5 total
```

- [ ] **Step 2.5: Commit**

```bash
cd backend && git add src/workers/streamTailor.ts src/services/auditorAgent.ts tests/auditorAgent.test.js
git commit -m "feat(tailor): add Layer 2 semantic fluff filter (auditorAgent)"
```

---

## Task 3: Wire Layer 2 into tailorResume.js

**Files:**
- Modify: `backend/tailorResume.js`

- [ ] **Step 3.1: Add require at top of `tailorResume.js`**

After line 2 (`const { validateAndPatchSection } = require('./src/workers/streamTailor');`), add:

```js
const { auditSection } = require('./src/services/auditorAgent');
```

- [ ] **Step 3.2: Wrap the section emit in `streamTailorResume` with Layer 2**

In `streamTailorResume` (around line 388–394), the current code is:

```js
for (const rawSec of parser.push(delta)) {
  const raw = normalizeSectionItem(rawSec, parsedResume);
  if (raw) {
    const { section } = validateAndPatchSection(raw, parsedResume);
    console.log(`[tailor] emit "${section.title}" +${Date.now() - t0}ms`);
    yield { type: 'section', section };
  }
}
```

Replace with:

```js
for (const rawSec of parser.push(delta)) {
  const raw = normalizeSectionItem(rawSec, parsedResume);
  if (raw) {
    const layer1 = validateAndPatchSection(raw, parsedResume);
    let layer2Section = layer1.section;
    try {
      layer2Section = auditSection(layer1.section).section;
    } catch (err) {
      console.error('[auditorAgent] failed, using layer1 output:', err);
    }
    console.log(`[tailor] emit "${layer2Section.title}" +${Date.now() - t0}ms`);
    yield { type: 'section', section: layer2Section };
  }
}
```

- [ ] **Step 3.3: Run full backend test suite**

```bash
cd backend && npm test
```

Expected:
```
Test Suites: N passed
Tests:       N passed
```

All existing tests must continue passing. `auditorAgent` tests should appear in the results.

- [ ] **Step 3.4: Commit**

```bash
git add backend/tailorResume.js
git commit -m "feat(tailor): wire Layer 2 auditorAgent into streamTailorResume"
```

---

## Coverage Note

The pre-commit hook enforces ≥ 90% statement coverage. `auditorAgent.ts` adds new code — the 5 unit tests cover all branches (fluff hit, no-op, multi-fluff, original-unchanged). If the hook flags a coverage drop, run:

```bash
cd backend && npx jest --coverage 2>&1 | grep -A5 'auditorAgent'
```

and add a targeted test for any uncovered branch.
