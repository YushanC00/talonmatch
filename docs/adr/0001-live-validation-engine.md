# ADR 0001: Live Validation Engine Architecture

**Date:** 2026-05-16
**Status:** Accepted
**Spec:** [docs/superpowers/specs/2026-05-16-live-validation-engine-design.md](../superpowers/specs/2026-05-16-live-validation-engine-design.md)

---

## Context

Job listings returned by the JSearch API go stale. A listing that was active when fetched may be closed by the time the user views it. Additionally, jobs are currently presented purely by match score — recently posted roles have no surfacing advantage even when they may be more competitive to apply to early.

Two problems to solve:
1. Surface fresh listings at the top of the feed
2. Filter out expired listings before the user wastes time on them

---

## Decision

### Timeline Sort: freshness tier in the sort comparator

Fresh jobs (< 48h old, based on `postedAt`) sort above older jobs. Within each tier, match score ordering is preserved. No UI section headers — jobs simply lead the feed.

**Alternatives considered:**

- **Strict date sort:** Loses match relevance entirely. A 2h-old irrelevant job would top the feed over a highly-matched 3-day-old one.
- **Section headers ("⚡ Today's Fresh Tracks"):** Adds visual complexity without meaningful benefit; rejected by product owner in favour of seamless ordering.
- **24h window:** Too narrow — misses evening posts from the previous day. 48h chosen as practical sweet spot given API polling frequency and backfilled `postedAt` randomization.

### Verification: background bulk request, silent removal

After match results render, a single `POST /api/jobs/verify` fires with all job URLs. Backend runs a two-layer check:
- **Layer 1 (HEAD ping):** Fast liveness check. 4xx/5xx → expired. Skips DOM fetch.
- **Layer 2 (DOM keyword scan):** GET + keyword match on 200-responders. Catches "position filled" responses that return 200.

Expired jobs are silently removed from the feed when the response resolves.

**Alternatives considered:**

- **Blocking verification (before render):** Adds 2–5s to perceived load time. Rejected — match results should be immediate.
- **SSE streaming:** Results trickle in one-by-one. For 20–30 jobs resolving in ~1–2s in parallel, the visual drip effect is negligible. Single bulk response is simpler with equivalent UX.
- **Badge + fade (keep expired visible):** Expired listings have no action path — showing them adds noise. Silent removal chosen.
- **Viewport-lazy per-card:** Avoids checking unseen jobs but requires Intersection Observer wiring and per-card request overhead. Over-engineered for feed sizes of < 30 jobs.
- **On-demand ("Verify freshness" button):** Shifts cognitive load to the user. Background is better UX.

### No new npm dependencies

Node 18+ native `fetch` used for both HEAD ping and GET scrape. No `axios`, `got`, `cheerio`, or `jsdom` added. DOM keyword scan operates on raw response text (lowercased string match) — no HTML parsing needed for the simple keyword set.

---

## Consequences

**Positive:**
- Fresh listings surface immediately without user action
- Expired listings disappear silently — no dead-end apply clicks
- Verification is best-effort — failures leave the feed unchanged (no degradation)
- Health page gains verify stats for operational visibility

**Negative / Trade-offs:**
- DOM keyword list is fragile — job boards may change their "expired" copy without notice
- Some job boards may rate-limit or block server-side HEAD/GET requests (result: `'unknown'`, job stays visible — acceptable)
- `postedAt` backfilling (random dates for missing values) means some jobs may incorrectly sort as "fresh" — accepted limitation of upstream data quality
- Verification adds ~1–3s of background network activity per match session (no user-visible latency)
