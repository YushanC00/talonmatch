const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR  = path.join(__dirname, 'cache');
const MOCK_FILE  = path.join(CACHE_DIR, 'mock.json');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function cacheGet(query) {
  const file = path.join(CACHE_DIR, `${slugify(query)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function cacheSet(query, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `${slugify(query)}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[cache] write failed:', e.message);
  }
}

function getMockData() {
  if (fs.existsSync(MOCK_FILE)) {
    try { return JSON.parse(fs.readFileSync(MOCK_FILE, 'utf8')); } catch {}
  }
  // Inline fallback if mock.json absent
  return [
    {
      job_title: 'Senior UX Designer',
      company: 'Mock Co',
      description: 'Design user experiences for enterprise SaaS products. Work with product and engineering teams.',
      requirements_array: ['Figma', 'User Research', 'Prototyping', 'Design Systems', 'Accessibility'],
      location: 'Toronto, Ontario, CA',
      is_remote: true,
      url: 'https://example.com/jobs/mock-1',
    },
    {
      job_title: 'Principal UX Designer',
      company: 'Mock Labs',
      description: 'Lead design for core platform. Define design system standards and mentor junior designers.',
      requirements_array: ['Figma', 'Design Systems', 'Interaction Design', 'Stakeholder Management'],
      location: 'Vancouver, BC, CA',
      is_remote: false,
      url: 'https://example.com/jobs/mock-2',
    },
    {
      job_title: 'UX Manager',
      company: 'Mock Startup',
      description: 'Manage a team of 4 designers. Partner with PM and engineering on roadmap and delivery.',
      requirements_array: ['Team Leadership', 'Figma', 'Agile', 'User Research', 'Roadmap'],
      location: 'Remote',
      is_remote: true,
      url: 'https://example.com/jobs/mock-3',
    },
  ];
}

function extractRequirements(description, highlights) {
  const found = new Set();

  // JSearch provides structured qualifications — use these first
  if (Array.isArray(highlights?.Qualifications)) {
    for (const q of highlights.Qualifications) {
      const clean = q.replace(/^[-•]\s*/, '').trim();
      if (clean.length < 80) found.add(clean);
    }
  }

  if (found.size >= 6) return Array.from(found).slice(0, 10);

  // Fall back to regex extraction from description
  if (description) {
    const techPattern = /\b(React|Angular|Vue|Node\.js|Python|Java|Go|Rust|TypeScript|JavaScript|PostgreSQL|MySQL|MongoDB|Redis|Docker|Kubernetes|AWS|GCP|Azure|GraphQL|REST|Git|Linux|CI\/CD|Agile|Scrum|Figma|CSS|HTML|Ruby|Rails|PHP|Swift|Kotlin|Flutter|Next\.js|Tailwind|Sketch|Adobe XD|Framer|Design Systems|UX|UI)\b/g;
    let m;
    while ((m = techPattern.exec(description)) !== null) found.add(m[1]);
  }

  return Array.from(found).slice(0, 10);
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'User-Agent': 'job-search-app/1.0', ...headers },
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// ─── JSearch (RapidAPI) ──────────────────────────────────────────────────────

function transformJSearchJob(job) {
  const city    = job.job_city    || '';
  const state   = job.job_state   || '';
  const country = job.job_country || '';
  const locationParts = [city, state, country].filter(Boolean);
  const location = locationParts.join(', ') || 'Canada';

  return {
    job_title:         job.job_title        || '',
    company:           job.employer_name    || '',
    description:       job.job_description  || '',
    requirements_array: extractRequirements(job.job_description, job.job_highlights),
    location,
    is_remote:         Boolean(job.job_is_remote),
    url:               job.job_apply_link   || job.job_google_link || '',
  };
}

function sanitizeTitle(t) {
  return t
    .replace(/^[•●▪–—\-\*\s]+/, '')   // strip leading bullets/dashes
    .replace(/[•●▪()[\]{}]/g, '')      // strip special chars anywhere
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildSingleQuery(title) {
  const clean = sanitizeTitle(title);
  return clean ? `${clean} Canada` : '';
}

// Fetch for ONE title — cache keyed per individual query
async function fetchOneTitle({ title, country = 'CA', resultsPerPage = 10 }) {
  const owKey    = process.env.OPENWEBNINJA_KEY;
  const rapidKey = process.env.RAPIDAPI_KEY;

  const query = buildSingleQuery(title);
  if (!query) return [];

  // DRY_RUN → log and return nothing (caller merges mock separately)
  if (process.env.DRY_RUN === 'true') {
    console.log('[dry-run] query that would be sent:', query);
    return [];
  }

  // Cache check
  const cached = cacheGet(query);
  if (cached) {
    console.log(`[jobs] cache hit: ${slugify(query)}.json`);
    return cached;
  }

  console.log(`[jobs] cache miss — calling JSearch: "${query}"`);

  const params = new URLSearchParams({ query, num_pages: '1', country, date_posted: 'all' });

  let url, headers;
  if (owKey) {
    url     = `https://api.openwebninja.com/jsearch/search?${params}`;
    headers = { 'X-API-Key': owKey };
  } else {
    url     = `https://jsearch.p.rapidapi.com/search?${params}`;
    headers = { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' };
  }

  const { status, body } = await httpGet(url, headers);

  let parsed;
  try { parsed = JSON.parse(body); } catch (e) {
    throw new Error(`JSearch parse error: ${e.message}`);
  }

  if (status !== 200) {
    throw new Error(`JSearch API error ${status}: ${parsed?.message || body.slice(0, 200)}`);
  }

  const jobs = (parsed.data || []).slice(0, resultsPerPage).map(transformJSearchJob);
  cacheSet(query, jobs);
  console.log(`[jobs] cached ${jobs.length} results → ${slugify(query)}.json`);

  return jobs;
}

function deduplicateJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    // Dedupe key: url if present, otherwise title+company
    const key = job.url || `${job.job_title}|${job.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFromJSearch({ titles, resultsPerPage = 10 }) {
  // USE_MOCK_DATA → skip everything
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('[jobs] mock mode active');
    return getMockData();
  }

  const owKey    = process.env.OPENWEBNINJA_KEY;
  const rapidKey = process.env.RAPIDAPI_KEY;
  if (!owKey && !rapidKey) throw new Error('Set OPENWEBNINJA_KEY or RAPIDAPI_KEY env var');

  // Top 3 distinct titles, parallel fetches
  const topTitles = [...new Set(titles.map(sanitizeTitle).filter(Boolean))].slice(0, 3);

  if (process.env.DRY_RUN === 'true') {
    topTitles.forEach(t => console.log('[dry-run] query that would be sent:', buildSingleQuery(t)));
    return getMockData();
  }

  const results = await Promise.all(
    topTitles.map(t => fetchOneTitle({ title: t, resultsPerPage }))
  );

  const merged = deduplicateJobs(results.flat());
  console.log(`[jobs] merged ${merged.length} unique jobs from ${topTitles.length} queries`);
  return merged;
}

// ─── Remotive fallback (no key needed) ───────────────────────────────────────

const CANADA_COMPATIBLE = [
  /\bcanada\b/i, /\bworldwide\b/i, /\bamericas\b/i,
  /\bnorth america\b/i, /\bglobal\b/i, /^anywhere$/i, /^remote$/i,
];

function isCompatibleWithLocation(candidateLocation, userLocation) {
  if (!userLocation || !candidateLocation) return true;
  const lower = candidateLocation.toLowerCase();
  if (CANADA_COMPATIBLE.some(p => p.test(lower))) return true;
  const country = userLocation.split(',').pop().trim().toLowerCase();
  return country && lower.includes(country);
}

function transformRemotiveJob(job) {
  const candidateLocation = job.candidate_required_location || '';
  return {
    job_title:          job.title          || '',
    company:            job.company_name   || '',
    description:        job.description    || '',
    requirements_array: extractRequirements(job.description),
    location:           candidateLocation  || 'Worldwide',
    is_remote:          true,
    url:                job.url            || '',
    _candidateLocation: candidateLocation,
  };
}

async function fetchFromRemotive({ title, userLocation, resultsPerPage = 40 }) {
  const params = new URLSearchParams({ search: title, limit: resultsPerPage });
  const { status, body } = await httpGet(`https://remotive.com/api/remote-jobs?${params}`);

  if (status !== 200) throw new Error(`Remotive API returned ${status}`);

  let parsed;
  try { parsed = JSON.parse(body); } catch (e) {
    throw new Error(`Remotive parse error: ${e.message}`);
  }

  const all = (parsed.jobs || []).map(transformRemotiveJob);
  const compatible = all.filter(j => isCompatibleWithLocation(j._candidateLocation, userLocation));
  const results = (compatible.length > 0 ? compatible : all).slice(0, Math.ceil(resultsPerPage / 2));

  return results.map(({ _candidateLocation, ...job }) => job);
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchJobs({ title, titles, userLocation, resultsPerPage = 10 }) {
  if (process.env.OPENWEBNINJA_KEY || process.env.RAPIDAPI_KEY) {
    return fetchFromJSearch({ titles: titles?.length ? titles : [title], resultsPerPage });
  }
  // Remotive free fallback — remote jobs only
  return fetchFromRemotive({ title, userLocation, resultsPerPage: resultsPerPage * 2 });
}

module.exports = { fetchJobs };
