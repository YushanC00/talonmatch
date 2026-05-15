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

_Focus: High-end output and automation._

- [ ] **Design DNA Extraction:** Analyze original PDF structure (Fonts/Layout) for `style_config`.
- [ ] **Dynamic PDF Generation:** Use `react-pdf` to mirror the user's original design perfectly.
- [ ] **Autosend Protocol:** Set "Autosend" rules (e.g., Match Score > 85%, Salary floor).
- [ ] **The "Dirty" Apply:** One-click button to save state and open job URL for instant pasting.
- [ ] **Timeline View:** Dashboard for application history, timestamps, and status tracking.

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
