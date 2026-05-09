# 🚀 TalonMatch | AI-Powered Career Agent

## 🎯 Core Operating Principles (AI Guardrails)

- **Dynamic Anchoring:** Extract `city`, `province`, and `country` from the user's uploaded resume. Use this as the search "Home Base." Do NOT hardcode locations.
- **Rule 11 (Data Integrity):** AI is strictly forbidden from altering dates, company names, or years of experience. Tailoring must focus only on skill alignment and bullet point optimization.
- **Token Efficiency:** Follow the **Plan -> Verify -> Execute** loop. Provide a step-by-step implementation plan and wait for user approval before writing code.
- **Performance First:** All UI components (especially the Drawer) must use memoization to ensure sub-100ms response times during AI streaming.

---

## 📅 Phase 1: High-Trust Engine (Saturday Sprint)

### 1. Data & Location Intelligence

- [done] **Home Base Detection:** Implement logic to set the primary search filter based on the uploaded resume's location data.
- [done] **Concentric Search Fallback:** - If `Primary Location` results < 5, auto-expand search to the `Province/State` level.
  - Always merge `Remote, [Country]` results into the primary feed.
- [done] **Application Persistence:** Create a `applications` table in the database to store tailored resumes with a `timestamp` and `job_id`.
- [done] **Cache Management:** Implement a manual "Clear Cache" trigger to refresh job data from the API.

### 2. The "Review Station" Drawer

- [ ] **Full-Resume Tailoring:** Expand GROQ logic to tailor the **entire resume** (Summary, Experience, and Projects) in one structured JSON pass.
- [ ] **Section-Level Controls:** - Implement independent `[Accept]` and `[Cancel]` buttons for every block of text.
  - Add a "Manual Edit" mode for final user polishing.
- [ ] **Live Match Score:** Animate the Match % in the drawer header to increase in real-time as AI optimizations are accepted.
- [ ] **UX Polish:** Fix the "Remote" bookmark clipping and remove redundant company info from the drawer header.

### 3. Performance Optimization

- [ ] **Skeleton UI:** Implement skeleton loading states for resume sections while GROQ is streaming.
- [ ] **Memoization:** Use `React.memo` on DiffViewer components to prevent lag during text edits.

---

## 📅 Phase 2: Autopilot & Branding (Sunday Sprint)

### 1. The PDF Re-Styler

- [ ] **Design DNA Extraction:** Use GROQ to analyze the original PDF's structure (Fonts, Margins, Layout) and save as a `style_config` object.
- [ ] **Dynamic Generation:** Use `react-pdf` to inject tailored text into a layout that mirrors the user's original design perfectly.

### 2. Autosend Protocol

- [ ] **Condition-Based Applying:** Panel for users to set "Autosend" rules (e.g., Match Score > 85%, Salary floor).
- [ ] **The "Dirty" Apply:** A one-click button that saves the application state and opens the job URL in a new tab for instant pasting.

### 3. Progress Dashboard

- [ ] **Timeline View:** Create a page to view all previous applications, timestamps, and status (Tailored, Applied, Interviewing).

---

## 🛠️ Technical Stack

- **LLM:** [GROQ](https://groq.com/) (Llama 3 / Mixtral)
- **Database:** [Supabase](https://supabase.com/) / PostgreSQL
- **Frontend:** Vite + React + [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
