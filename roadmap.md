# 🚀 TalonMatch | AI-Powered Career Agent

## Master Roadmap: From Engine to Market

---

## 🎯 Core Operating Principles (AI Guardrails)

- **Dynamic Anchoring:** Extract `city`, `province`, and `country` from resume. No hardcoded locations.
- **Rule 11 (Data Integrity):** AI is forbidden from altering dates, company names, or years of experience.
- **Performance First:** All UI components (Drawer/Cards) must use memoization; target sub-100ms response times.
- **Token Efficiency:** Follow the **Plan -> Verify -> Execute** loop.

---

## 📅 Phase 1: High-Trust Engine (The Foundation)

_Focus: Data accuracy and core tailoring logic._

- [x] **Home Base Detection:** Set primary search filter based on resume location data.
- [x] **Concentric Search Fallback:** Auto-expand search to Province/State if local results < 5.
- [x] **Application Persistence:** Supabase `applications` table to store tailored resumes.
- [x] **Cache Management:** Manual "Clear Cache" trigger for job data refresh.
- [x] **Full-Resume Tailoring:** single-pass structured JSON for all sections (dynamically based on the resume).
- [x] **Live Match Score:** Animate Match % in the drawer header as edits are accepted.
- [x] **UX Polish:** missing salary range on the cards if any.
- [x] **UX Polish:** allow user to edit the resume after tailored.

---

## 📅 Phase 2: Autopilot & Branding (The Professional)

_Focus: AI prose humanization, high-velocity curation UX, and localized style learning loops._

- [x] **Design DNA Extraction Fallback:** Implemented default fallback to `sans-serif` to eliminate the "Unknown (不明)" UI glitch and protect PDF generation font metrics.

### 📦 Sprint 1: Workstation Architecture & Voice Polish (The Immediate Wins)

- [ ] **Structural Workstation Migration (Goodbye Modal):**
  - **Dedicated Route Switch:** Move the editor from an overlay modal to a dedicated full-page view (`/tailor/:jobId`) to fix scroll contexts and restore left-sidebar anchor navigation tracking.
  - **Sticky Telemetry Header:** Pin the primary action bar (`88% match`, `[Apply]`, `[↓ PDF]`) to the top of the page viewport using sticky positioning.
- [ ] **Asynchronous Experience Chunking (Latency Fix):**
  - **Parallel Company-Level Workers:** Segment the 17 Work Experience bullets by company nodes. Fire asynchronous parallel requests to the LLM instead of a monolithic block.
  - **Sequential UI Hydration:** Stream completed chunks back to the client via SSE, prioritizing current roles first so the top of the workstation renders under 500ms while older history loads gracefully in the background.

### 📦 Sprint 2: The Timeline & Security Gating (The Semi-Auto Launch)

- [ ] **Live Validation Engine (The Freshness Check):**
  - **The Timeline Sort:** Pivot the dashboard grid to group incoming arrays chronologically (`⚡ Today's Fresh Tracks`) instead of sorting strictly by Match Score to surface new drops immediately.
  - **Dual-Layer Verification:** Implement HTTP ping + DOM keyword scraping to filter out expired listings before processing.
- [ ] **Dynamic Vector Gating Engine (The Industry Leak Fix):**
  - **Semantic Cluster Boundary:** Implement an embedding-based distance check ($Sim$) comparing incoming API payloads against your parsed profile vector space to automatically discard completely unrelated fields before they enter your feed.

### 📦 Sprint 3: The Design Control Center (The Brand Builder)

- [ ] **Interactive Design DNA Panel:**
  - **Live Style Overrides:** Connect your active toolbar state variables to functional inputs (color pickers, typography dropdowns) to allow manual UI theme modifications that cascade instantly to the PDF layout.

### 📦 Sprint 4: The Autopilot Protocol (Full Automation)

- [ ] **Editorial Feedback Loop (The Learning Layer):**
  - **Decision Telemetry Tracker:** Wire the `[✓]` and `[✕]` buttons to log your specific phrasing rejections and acceptances to a localized data collector.
  - **Dynamic Few-Shot Injection:** Feed historical preference data back into the single-pass tailoring engine, allowing the AI to dynamically adapt to your personal writing voice over time.
- [ ] **Autosend Protocol (The Auto-Apply Engine):**
  - **Autonomous Execution Loop:** Build the background worker that automatically pairs fresh jobs with vector gates, runs clean-string generation bypassing the diff states, prints the themed PDF, and fires the application payload.
  - **Guardrail Parameter Settings:** UI panel to configure rigid strict-apply thresholds (e.g., _Match Score > 85%_).

---

## 📅 Phase 3: Monetization & Limitation (The Business)

_Goal: Protect token margins and define Free vs. Pro tiers._

- [ ] **Daily Strike Quota:** Implement `daily_credits` (3 per day) for Free tier users.
- [ ] **Feature Gating:**
  - **Free:** Standard "Talon" PDF template.
  - **Pro:** "Design DNA" Mirroring + Seniority Audit (Executive language).
- [ ] **Usage Meter:** Visual "Strikes Remaining" badge in the [Review Station Drawer](http://localhost:5173/).

---

## 📅 Phase 4: Market Launch & Analytics (The Launch)

_Goal: High-conversion landing page and quantitative tracking._

- [ ] **Landing Page:** "The Silent Hunter" - Tactical Dark Mode with #A85E3E (Shu-Red).
- [ ] **UX Tracking (PostHog):** - Track `latency_ms` (Time to First Section) to monitor the 1.9m delay.
  - Track `match_score_lift` (Original Score vs. Tailored Score).
- [ ] **Funnel Analysis:** Track conversion from `Job Discovery` -> `Tailoring` -> `Apply Success`.

---

## 🛠️ Technical Stack

- **LLM:** [GROQ](https://groq.com/) (Llama 3 / Mixtral)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Frontend:** Vite + React + [Tailwind CSS](https://tailwindcss.com/)
- **Animation:** [Motion for React](https://motion.dev/)
- **Analytics:** [PostHog](https://posthog.com/)
