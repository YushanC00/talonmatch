# 🦅 TalonMatch

**Bridge the gap between your experience and your dream job with AI-powered precision.**

TalonMatch doesn't just find jobs; it analyzes your professional DNA (skills, history, and impact) and compares it against real-time market data to give you a roadmap for every application.

---

## ✨ Key Features

- **Semantic Skill Extraction:** Uses Groq-powered LLMs to move beyond keyword matching, identifying over 40+ granular skills from your resume.
- **Recraft-Inspired UI:** A minimalist, data-first dashboard focused on high-density information with low visual noise.
- **AST-Validated Tailoring:** Our "Tailor Resume" engine uses Abstract Syntax Tree (AST) validation to ensure AI suggestions improve your tone without breaking the underlying data structure or professional facts.
- **Zero-Hallucination Guarantee:** The tailoring engine reframes your _actual_ experience using job-specific vocabulary—never inventing skills you don't have.

## 🛠 Tech Stack

| Layer              | Technology                             |
| :----------------- | :------------------------------------- |
| **Frontend**       | React 18, Vite, Tailwind CSS, Radix UI |
| **Backend**        | Node.js, Express                       |
| **Database/Auth**  | Supabase (PostgreSQL + GoTrue)         |
| **AI Engine**      | Groq (`llama-3.3-70b-versatile`)       |
| **Data Integrity** | Custom AST Validation Layer            |
| **APIs**           | JSearch (via OpenWebNinja)             |

## 🚀 Getting Started

_(Keep your existing Setup instructions here, but consider adding a 'Roadmap' section at the bottom)_

## 🗺 Roadmap

- [ ] **Phase 3:** AST-validated writing suggestions (In Progress)
- [ ] **Phase 4:** Persistent "Tailored Versions" database & PDF export
- [ ] **Phase 5:** Multi-resume management for different career tracks
