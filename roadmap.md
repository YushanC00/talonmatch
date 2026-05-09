# 🚀 TalonMatch Weekend Sprint: From Tool to Agent

This roadmap outlines the transition of TalonMatch from a job-search UI to a fully automated, AI-powered career agent.

## 📅 Saturday: The "High-Trust" Engine

**Focus:** Stability, UX Refinement, and Data Persistence.

### 1. Data Infrastructure & Persistence

- [ ] **Application Versioning:** Create an `applications` table in the DB to save every "Committed" resume with a timestamp.
- [ ] **Base Resume Snapshots:** Implement logic to save the "Master" JSON upon PDF upload to serve as the source of truth for all future tailoring.
- [ ] **Style DNA Extraction:** Develop a GROQ utility to analyze PDF metadata (fonts, spacing, layout) and store it as a `style_config`.

### 2. The "Intelligent Drawer" UX

- [ ] **Multi-Section Tailoring:** Expand GROQ engine to tailor Summary, Experience, and Projects in a single pass.
- [ ] **Segmented Review:** Break the drawer into cards for each section with independent **[Accept]** and **[Cancel]** controls.
- [ ] **Feedback Loop:** Log user manual edits to improve future AI suggestions based on "Professional Voice" patterns.

### 3. Branding & UI Polish

- [ ] **"Out-of-Box" Ribbon:** Fix the clipping bug on the "Remote" tag using an absolute-positioned "Bookmark" style.
- [ ] **Professional Palette:** Standardize on **Emerald (Success)** and **Slate (Neutral)** colors.
- [ ] **Live Match Score:** Animate the score in the drawer to update in real-time as the user accepts tailoring.

---

## 📅 Sunday: The "Autopilot" Launch

**Focus:** PDF Generation, Progress Tracking, and Market Automation.

### 1. The PDF Re-Styler

- [ ] **Template Engine:** Build a dynamic PDF generator that uses the `style_config` and `tailored_json` to replicate the user's original design.
- [ ] **One-Click Download:** Finalize the "Download PDF" action in the drawer for committed versions.

### 2. Automation & "Dirty Apply"

- [ ] **Direct Apply Protocol:** Implement a button that "bundles" the tailored resume and opens the job source URL in a new tab.
- [ ] **The "Autosend" Bot:** \* Develop a background worker to monitor the job feed.
  - Trigger automatic applications for jobs where **Match Score > User Threshold** (e.g., 85%).
- [ ] **User Rules of Engagement:** Create a settings panel for "Autosend" conditions (Salary floor, daily limits, keyword blacklists).

### 3. The Progress Dashboard

- [ ] **Timeline View:** Create a new page to view all previous applications, timestamps, and current status.
- [ ] **Historical Recall:** Allow users to view and re-download any previously tailored version of their resume.

---

## 🛠️ Technical Stack

- **LLM:** GROQ (Llama 3 / Mixtral) for low-latency tailoring.
- **Frontend:** React + Tailwind CSS + Lucide Icons.
- **Backend:** Supabase / PostgreSQL.
- **PDF:** `react-pdf` or `jspdf`.
