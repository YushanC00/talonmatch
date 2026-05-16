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
  - **Dedicated Route Switch:** Move the editor from an overlay modal to a dedicated full-page view (`/tailor/:jobId`) to fix scroll contexts and restore native left-sidebar anchor navigation.
  - **Sticky Telemetry Header:** Pin the primary action bar (`85% match`, `[Apply]`, `[↓ PDF]`) to the top of the page viewport using `position: sticky;` so your scores never vanish during deep scrolls.
- [ ] **Progressive Stream Hydration (Latency Fix):**
  - **Asynchronous Chunking:** Refactor the backend optimization pipeline into isolated endpoints. Load the core metrics and summary blocks first to achieve sub-500ms initial page paint, then stream individual experience cards sequentially.
- [ ] **Asynchronous Experience Chunking:**
  - **Parallel Company-Level Workers:** Segment the 17 Work Experience bullets by company nodes. Fire asynchronous parallel requests to the LLM instead of a monolithic block.
  - **Sequential UI Hydration:** Stream completed chunks back to the client via SSE, prioritizing current roles first so the top of the workstation renders under 500ms while older history loads gracefully in the background.

...

## 📅 Phase 3: Monetization & Limitation (The Business)

_Goal: Protect token margins and define Free vs. Pro tiers._

- [ ] **Pre-Token Credit Validation:** Force background workers to check `daily_credits` balances _prior_ to initiating LLM tailoring pipelines to eliminate background margin bleed.
- [ ] **Daily Strike Quota:** Implement `daily_credits` (3 per day) for Free tier users.

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
