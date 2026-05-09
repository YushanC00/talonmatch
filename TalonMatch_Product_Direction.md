# Product Direction: TalonMatch 🦅

**Tagline:** _Find · Tailor · Strike_

---

## 1. Executive Summary

**TalonMatch** is an AI-powered career agent designed to automate the job application lifecycle. It moves beyond traditional job boards by providing **Match Accuracy Transparency**, **Real-time AI Tailoring**, and **Autonomous "Auto-Pilot" Submissions**.

---

## 2. Core Product Pillars

### **I. The Hunting Ground (Discovery)**

- **Vector-Based Matching:** Uses AI to compare user resumes against live job descriptions.
- **Match Scoring:** Every job is assigned a percentage (e.g., **89% Match**) to indicate fit.
- **Skill Gap Analysis:** Visual breakdown of matched vs. missing keywords (e.g., _"Missing: Kubernetes, GraphQL"_).

### **II. The Tailor Studio (Optimization)**

- **Split-Pane Editor:** A side-by-side workspace for the Job Description and the Interactive Resume.
- **Live AI Suggestions:** Proposes text changes in a "Diff View" (Green for additions, Red for deletions) to increase scores.
- **Skill Alignment Chips:** Interactive badges that light up in green once a required skill is detected in the text.
- **Real-time Scoring:** The Match % gauge updates dynamically as edits are made.

### **III. Autonomous Execution (The Strike)**

- **Auto-Pilot Mode:** Users define a "Strike Threshold" (e.g., 90%).
- **Auto-Apply:** Once the tailored resume hits the threshold, the system automatically submits the application.
- **One-Click Apply:** Direct submission for high-match roles that require no further tailoring.

### **IV. Progress Dashboard (The Process)**

- **Status Pipeline:** A Kanban-style board tracking jobs through:
  - **Tailoring:** In the refinement stage.
  - **Pending:** Waiting for threshold achievement or review.
  - **Struck:** Successfully applied.
- **Strike Log:** A chronological audit trail of all automated actions and confirmations.
- **Rejection Analysis:** If a job is declined, the AI analyzes the "gap" to suggest specific skill upgrades for future hunts.

---

## 3. Design & UX Identity

- **Aesthetic:** "Cyber-Samurai" / Minimalist Pro-Tool.
- **Visual Language:** Dark mode, high-contrast "Success Green," and Japanese motifs (e.g., **鷹合** - Talon Match).
- **Interaction:** Keyboard-shortcut-heavy (e.g., `⌘K` for search) to ensure maximum efficiency.

---

## 4. Technical Stack Requirements

| Component          | Implemented                                      | Roadmap / Not Yet Built                         |
| :----------------- | :----------------------------------------------- | :---------------------------------------------- |
| **Parsing Engine** | Groq (`llama-3.1-8b-instant`)                    | Upgrade path: GPT-4o or Claude 3.5 Sonnet       |
| **Data Sourcing**  | OpenWebNinja + JSearch APIs (cached)             | Scrapers / additional ATS integrations          |
| **Frontend**       | React 19 / Tailwind CSS 4 / Vite                 | Framer Motion (not yet installed)               |
| **Auth & Storage** | Supabase (Google OAuth, PostgreSQL, PKCE)        | —                                               |
| **Automation**     | —                                                | Playwright / Selenium / Direct ATS Integrations |

---

## 5. Success Metrics (KPIs)

- **Match Delta:** Average score increase between "Raw" and "Tailored" resumes.
- **Autonomous Rate:** % of applications handled without user intervention.
- **Interview Velocity:** Speed from "Job Discovery" to "Interview Secured."
