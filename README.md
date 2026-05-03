# AI Job Matcher

Upload your resume and instantly get a ranked list of job matches — then tailor your resume to any role with one click using AI.

## What it does

1. **Resume parsing** — Upload a PDF resume. Groq AI extracts your skills, job history, and location
2. **Job matching** — Searches JSearch (via OpenWebNinja) for real job postings matching your titles, ranks them by skill overlap
3. **AI resume tailor** — Pick any job, click "Tailor Resume". Groq rewrites your bullets using the job description's vocabulary — no hallucinations, only your real experience reframed
4. **Review & export** — Accept or reject each AI suggestion in a diff view, then download the approved version as a PDF

## Tech stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **AI**: Groq API (`llama-3.3-70b-versatile`)
- **Jobs API**: JSearch via OpenWebNinja
- **PDF parsing**: pdf-parse
- **PDF export**: html2pdf.js

## Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com) (free)
- An [OpenWebNinja API key](https://openwebninja.com) for job search

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YushanC00/ai-job-matcher.git
cd ai-job-matcher
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```env
GROQ_API_KEY=your_groq_api_key
OPENWEBNINJA_KEY=your_openwebninja_key
USE_MOCK_DATA=false
DRY_RUN=false
```

Start the backend:

```bash
node server.js
```

Backend runs on `http://localhost:3001`.

### 3. Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Vite proxies `/api` requests to the backend automatically.

## Usage

1. Open `http://localhost:5173`
2. Upload your PDF resume (optional: enter a city for location-filtered results)
3. Browse ranked job matches
4. Click **Tailor Resume** on any job card
5. Review AI-suggested bullet rewrites — accept or reject each one
6. Click **Download PDF** to save your tailored resume

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for AI parsing and tailoring |
| `OPENWEBNINJA_KEY` | Yes | OpenWebNinja key for JSearch job API |
| `USE_MOCK_DATA` | No | Set `true` to skip API calls and use mock jobs |
| `DRY_RUN` | No | Set `true` to test parsing without burning API credits |
