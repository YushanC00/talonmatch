#!/usr/bin/env node
/**
 * perf-check.js — GROQ tailoring latency benchmark
 * Usage: node scripts/perf-check.js [--runs N] [--job <cache-file>]
 *
 * Reads GROQ_API_KEY from ../.env (same as server.js)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const fs   = require('fs');
const { streamTailorResume } = require('../tailorResume');

// ── Parse args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const runsIdx = args.indexOf('--runs');
const jobIdx  = args.indexOf('--job');
const RUNS    = runsIdx !== -1 ? parseInt(args[runsIdx + 1] || '3', 10) : 3;
const jobFlag = jobIdx  !== -1 ? args[jobIdx  + 1] : null;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STUB_RESUME = {
  summary: 'Senior frontend engineer with 5 years building React applications for SaaS products.',
  skills: ['React', 'TypeScript', 'Next.js', 'Vite', 'Tailwind CSS', 'GraphQL', 'Node.js', 'Framer Motion', 'Jest', 'Figma'],
  experience: [
    {
      title: 'Senior Frontend Engineer',
      company: 'Acme Corp',
      period: '2021–Present',
      bullets: [
        'Led migration from Create React App to Vite, cutting CI build time by 40%.',
        'Designed component library adopted across 4 product teams, reducing duplicate code by 30%.',
        'Integrated real-time WebSocket feeds into dashboard, supporting 500+ concurrent users.',
        'Mentored 2 junior engineers through pair programming and code review cycles.',
      ],
    },
    {
      title: 'Frontend Engineer',
      company: 'Beta Studio',
      period: '2019–2021',
      bullets: [
        'Built responsive marketing site with Next.js SSR, improving LCP score from 4.2s to 1.8s.',
        'Maintained Redux state machine for a multi-step onboarding flow serving 10,000+ users.',
        'Collaborated with design team in Figma to deliver pixel-perfect UI components.',
      ],
    },
  ],
  projects: [
    {
      name: 'TalonMatch',
      description: 'Open-source job matching tool using AI resume parsing and skill gap analysis. Built with React 19, Vite, Tailwind v4, and Groq LLM API. Processes PDF resumes and surfaces ranked job listings with skill delta visualizations.',
    },
    {
      name: 'DevBoard',
      description: 'Internal dashboard aggregating GitHub PR metrics and Jira ticket velocity. TypeScript + Chart.js + REST API polling every 30s.',
    },
  ],
  education: [{ degree: 'B.Sc. Computer Science', institution: 'UBC', year: '2019' }],
};

function loadJobDescription() {
  if (jobFlag) {
    const p = path.resolve(__dirname, '../cache', jobFlag);
    const jobs = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(jobs) ? jobs[0].description : jobs.description;
  }
  // Default: first job in senior-front-end-developer-remote.json
  const p = path.resolve(__dirname, '../cache/senior-front-end-developer-remote.json');
  if (fs.existsSync(p)) {
    const jobs = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(jobs) ? jobs[0].description : jobs.description;
  }
  // Inline stub
  return `Senior Frontend Engineer — React + TypeScript
We need 5+ years React, TypeScript, Next.js, and Tailwind CSS. Experience with Framer Motion animations, GraphQL, and component library design required. Bonus: Vite, Jest, Figma collaboration. Join a remote-first team building developer tools.`;
}

// ── Runner ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!process.env.GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY not set. Add it to backend/.env');
    process.exit(1);
  }

  const jobDescription = loadJobDescription();
  const parsedResume   = STUB_RESUME;

  console.log(`\n── TalonMatch GROQ Latency Benchmark ─────────────────────`);
  console.log(`  Runs   : ${RUNS}`);
  console.log(`  Jobs   : ${parsedResume.experience.length}`);
  console.log(`  Projects: ${parsedResume.projects.length}`);
  console.log(`  JD     : ${jobDescription.slice(0, 80).replace(/\n/g,' ')}…`);
  console.log(`──────────────────────────────────────────────────────────\n`);

  const results = [];

  for (let i = 0; i < RUNS; i++) {
    const label = `Run ${i + 1}/${RUNS}`;
    process.stdout.write(`${label} … `);
    const t0 = Date.now();
    try {
      const sections = [];
      let ttfs = null;   // time-to-first-section
      let ctok = 0;

      for await (const event of streamTailorResume({ parsedResume, jobDescription })) {
        if (event.type === 'section') {
          if (ttfs === null) ttfs = Date.now() - t0;
          sections.push(event.section);
        }
        if (event.type === 'done') ctok = event.usage?.completionTokens || 0;
      }

      const ms     = Date.now() - t0;
      const secNames = sections.map(s => `${s.title}(${s.content?.length ?? 0})`).join(', ');
      const tps    = ctok > 0 ? Math.round(ctok / (ms / 1000)) : null;

      results.push({ run: i + 1, ms, ttfs, ok: true, sections: sections.length, ctok, tps });
      const tpsStr  = tps ? `${tps} tok/s` : 'n/a';
      const ttfsStr = ttfs != null ? `TTFS ${ttfs}ms` : 'TTFS n/a';
      console.log(`total ${ms}ms  |  ${ttfsStr}  |  ${ctok} tok  |  ${tpsStr}  |  ${secNames}`);
    } catch (err) {
      const ms = Date.now() - t0;
      results.push({ run: i + 1, ms, ttfs: null, ok: false, error: err.message });
      console.log(`FAILED (${ms}ms) — ${err.message}`);
    }
  }

  const successful = results.filter(r => r.ok);

  if (successful.length === 0) {
    console.error('\nAll runs failed.');
    process.exit(1);
  }

  const latencies  = successful.map(r => r.ms);
  const ttfsValues = successful.map(r => r.ttfs).filter(v => v != null);
  const min     = Math.min(...latencies);
  const max     = Math.max(...latencies);
  const avg     = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const ttfsMin = ttfsValues.length ? Math.min(...ttfsValues) : null;
  const ttfsAvg = ttfsValues.length ? Math.round(ttfsValues.reduce((a, b) => a + b, 0) / ttfsValues.length) : null;
  const tpsValues = successful.map(r => r.tps).filter(Boolean);
  const avgTps  = tpsValues.length ? Math.round(tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length) : null;
  const avgCtok = Math.round(successful.reduce((a, r) => a + (r.ctok || 0), 0) / successful.length);

  console.log(`\n── Summary ───────────────────────────────────────────────`);
  console.log(`  Successful   : ${successful.length}/${RUNS}`);
  if (ttfsAvg != null) {
    console.log(`  TTFS avg     : ${ttfsAvg}ms  (min ${ttfsMin}ms)  ← time to first section`);
  }
  console.log(`  Total avg    : ${avg}ms  (min ${min}ms  max ${max}ms)`);
  console.log(`  Avg output   : ${avgCtok} tokens`);
  if (avgTps) console.log(`  Avg TPS      : ${avgTps} tok/s`);
  console.log(`──────────────────────────────────────────────────────────\n`);

  if (avg > 8000) {
    console.warn('  WARNING: avg > 8s. Check GROQ tier/quota (free tier = 30 RPM).');
  }
}

run().catch(err => { console.error(err); process.exit(1); });
