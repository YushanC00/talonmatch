# Live Validation Engine — Design Spec

**Date:** 2026-05-16
**Status:** Approved
**ADR:** [docs/adr/0001-live-validation-engine.md](../../adr/0001-live-validation-engine.md)

---

## Summary

Two independent features that fire after the match response renders:

1. **Timeline Sort** — fresh jobs (< 48h old) float to the top of the feed, ordered by match score within their tier.
2. **Background Verification** — a bulk HTTP ping + DOM keyword scan filters expired job listings out of the feed silently.

Neither feature blocks the initial match response. Both operate on the existing `postedAt` and `url` fields already present on every `Job` object.

---

## Architecture

```
POST /api/match  ──→  results render immediately (existing flow)
                       │
                       ├─→ [Timeline Sort] freshness-tiered sort in filteredJobs
                       │   (pure frontend derivation, no new requests)
                       │
                       └─→ POST /api/jobs/verify  (fires once after render)
                               │  body: { urls: string[] }
                               │
                               ├─ Layer 1: HEAD ping each URL in parallel
                               ├─ Layer 2: GET + keyword scan (200-responders only)
                               │
                               └─→ { results: { [url]: 'active'|'expired'|'unknown' } }
                                       │
                                       └─→ expired URLs added to expiredUrls Set
                                               → filteredJobs filters them out silently
```

---

## Feature 1: Timeline Sort

### Behaviour

The existing `filteredJobs` sort comparator gains a freshness tier. Jobs posted within 48 hours sort above older jobs. Within each tier, existing sort order applies (match score descending, or date if user selects date sort).

No new UI elements. No section headers. Fresh jobs lead the feed naturally.

### Implementation

**`frontend/src/App.tsx`** — replace current sort comparator:

```typescript
const FRESH_MS = 48 * 60 * 60 * 1000;
const isFresh = (j: Job) =>
  j.postedAt ? Date.now() - new Date(j.postedAt).getTime() < FRESH_MS : false;

// In filteredJobs .sort():
(a, b) => {
  const af = isFresh(a), bf = isFresh(b);
  if (af !== bf) return af ? -1 : 1;
  if (sortBy === 'date') {
    return new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime();
  }
  return b.match_score - a.match_score;
}
```

### Edge Cases

- `postedAt` missing or invalid → `isFresh` returns `false` → job sorts normally in older tier
- All jobs fresh → feed looks identical to today (no regression)
- All jobs old → feed looks identical to pre-feature (no regression)

---

## Feature 2: Background Verification

### Backend — `POST /api/jobs/verify`

**Request:**
```json
{ "urls": ["https://...", "https://..."] }
```

**Response:**
```json
{ "results": { "https://...": "active", "https://...": "expired" } }
```

**Input validation:**
- Max 50 URLs per request → 400 if exceeded
- Non-http(s) URLs stripped before processing
- Empty array → `{}` response, no error

**Layer 1 — HEAD ping (all URLs, parallel):**
- `fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' })`
- `4xx` or `5xx` → mark `'expired'`, skip Layer 2
- `200–399` → pass to Layer 2
- Throws (timeout, DNS, network) → mark `'unknown'`

**Layer 2 — DOM keyword scan (200-responders only, parallel):**
- `fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) })`
- Lowercase response text, scan for:
  ```
  "no longer accepting"
  "position has been filled"
  "job has expired"
  "listing is closed"
  "this job is no longer"
  "application closed"
  ```
- Any match → `'expired'`; no match → `'active'`
- Throws → `'unknown'`

**Error handling:**
- `Promise.allSettled` wraps all URL checks — one failure never aborts others
- Entire route throws → frontend catches silently, `expiredUrls` stays empty

**Health monitoring — `verifyStats` object added to server:**
```javascript
const verifyStats = { requests: 0, urlsChecked: 0, expiredFound: 0, unknownCount: 0 };
```
Incremented on every `/api/jobs/verify` call. Rendered in the `/api/health` HTML page below the Groq token bar.

### Frontend — `App.tsx`

```typescript
const [expiredUrls, setExpiredUrls] = useState<Set<string>>(new Set());
```

After match results set `displayJobs`, fire verify:
```typescript
const urls = jobs.map(j => j.url).filter(Boolean);
fetch('/api/jobs/verify', { method: 'POST', body: JSON.stringify({ urls }), ... })
  .then(r => r.json())
  .then(data => {
    const dead = Object.entries(data.results)
      .filter(([, s]) => s === 'expired')
      .map(([url]) => url);
    setExpiredUrls(new Set(dead));
  })
  .catch(() => {}); // best-effort, silent failure
```

`filteredJobs` gains one additional filter:
```typescript
.filter(j => !expiredUrls.has(j.url))
```

**State reset:** `expiredUrls` resets to `new Set()` when a new match fires or user hits Sync.

---

## Testing

### Backend (`backend/tests/server.test.js`)

| Test | Expected |
|------|----------|
| Empty `urls` array | `{}` response, 200 |
| URL with mocked 404 HEAD | `{ url: 'expired' }` |
| URL with mocked 200 HEAD + keyword in body | `{ url: 'expired' }` |
| URL with mocked 200 HEAD + clean body | `{ url: 'active' }` |
| URL where fetch throws | `{ url: 'unknown' }` |
| Non-https URL stripped | not in results |
| > 50 URLs | 400 |

`fetch` mocked globally in Jest via `jest.spyOn(global, 'fetch')`.

### Frontend (Vitest — `App.test.tsx` or `JobFeed.test.tsx`)

| Test | Expected |
|------|----------|
| Fresh job (< 48h) sorts before older job with higher score | fresh job index < older job index |
| `expiredUrls` containing job URL | job absent from rendered feed |
| No URL on job object | job not sent to verify, not removed |

---

## Out of Scope

- Per-card verify-on-demand UI
- SSE streaming of verify results
- Persisting verified status across sessions
- Support for non-HTTP job sources
