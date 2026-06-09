const https = require("https");
const fs = require("fs");
const path = require("path");

let CACHE_DIR = path.join(__dirname, "cache");
const MOCK_FILE = path.join(__dirname, "cache", "mock.json");

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function cacheGet(query) {
  const file = path.join(CACHE_DIR, `${slugify(query)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
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
    console.warn("[cache] write failed:", e.message);
  }
}

function randomPostedAt(minDaysAgo = 3, maxDaysAgo = 30) {
  const range = (maxDaysAgo - minDaysAgo) * 24 * 60 * 60 * 1000;
  const ms = minDaysAgo * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * range);
  return new Date(Date.now() - ms).toISOString();
}

function getMockData() {
  if (fs.existsSync(MOCK_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MOCK_FILE, "utf8"));
    } catch { /* noop — fall through to inline mock */ }
  }
  // Inline fallback if mock.json absent
  return [
    {
      job_title: "Senior UX Designer",
      company: "Mock Co",
      description:
        "Design user experiences for enterprise SaaS products. Work with product and engineering teams.",
      requirements_array: [
        "Figma",
        "User Research",
        "Prototyping",
        "Design Systems",
        "Accessibility",
      ],
      location: "Toronto, Ontario, CA",
      is_remote: true,
      url: "https://example.com/jobs/mock-1",
      postedAt: randomPostedAt(),
    },
    {
      job_title: "Principal UX Designer",
      company: "Mock Labs",
      description:
        "Lead design for core platform. Define design system standards and mentor junior designers.",
      requirements_array: [
        "Figma",
        "Design Systems",
        "Interaction Design",
        "Stakeholder Management",
      ],
      location: "Vancouver, BC, CA",
      is_remote: false,
      url: "https://example.com/jobs/mock-2",
      postedAt: randomPostedAt(),
    },
    {
      job_title: "UX Manager",
      company: "Mock Startup",
      description:
        "Manage a team of 4 designers. Partner with PM and engineering on roadmap and delivery.",
      requirements_array: [
        "Team Leadership",
        "Figma",
        "Agile",
        "User Research",
        "Roadmap",
      ],
      location: "Remote",
      is_remote: true,
      url: "https://example.com/jobs/mock-3",
      postedAt: randomPostedAt(),
    },
  ];
}

// Section headers that signal a requirements/qualifications block
const REQUIREMENTS_SECTION_RE = /^(requirements?|qualifications?|required qualifications?|preferred qualifications?|you have|what you('ll)? (bring|need|have)|what we('re)? looking for|must.have|nice.to.have|you will bring|your background|skills? (required|needed)|minimum qualifications?)\s*:?\s*$/i;

// Expanded skill keyword regex — tech + UX/design + product + leadership
const SKILL_KEYWORD_RE = new RegExp(
  '\\b(' + [
    // Engineering
    'React','Angular','Vue','Node\\.js','Python','Java','Go','Rust','TypeScript',
    'JavaScript','PostgreSQL','MySQL','MongoDB','Redis','Docker','Kubernetes',
    'AWS','GCP','Azure','GraphQL','RESTful','Git','Linux','CI\\/CD','Agile','Scrum',
    'CSS','HTML','Ruby','Rails','PHP','Swift','Kotlin','Flutter','Next\\.js',
    'Tailwind','SQL','Terraform','Kafka','Spark',
    // Design tools
    'Figma','Sketch','Adobe XD','InVision','Miro','Zeplin','Principle',
    'ProtoPie','Webflow','Framer','Abstract',
    // UX/design skills
    'User Research','Usability Testing','Wireframing','Prototyping','Design Systems',
    'Information Architecture','Interaction Design','Visual Design','Motion Design',
    'Design Thinking','Journey Mapping','UX Writing','A\\/B Testing','Accessibility',
    'WCAG','Product Design','Service Design','Design Strategy','Brand Design',
    'Typography','Content Strategy','Design Leadership',
    // Product skills (removed generic biz terms: KPI, OKR, Analytics, Go-to-Market)
    'Product Management','Product Strategy','Product Vision',
    'Data Analytics','User Stories','Product Discovery','User Interviews','Competitive Analysis',
    // Leadership/collaboration (removed Coaching — too common in sales/non-tech descriptions)
    'Stakeholder Management','Team Leadership','Mentoring',
    'Cross.functional','Executive Communication','Design Reviews',
    // Short forms (last to avoid partial matches shadowing multi-word)
    'UX','UI',
  ].join('|') + ')\\b',
  'gi',
);

function extractSectionBullets(description) {
  const results = [];
  const lines = description.split(/\n/);
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (REQUIREMENTS_SECTION_RE.test(trimmed)) {
      inSection = true;
      continue;
    }

    // Stop section if we hit another heading-like line (all caps, or ends in colon, no bullet)
    if (inSection && !trimmed.match(/^[-•*●▪–\d]/) && trimmed.match(/^[A-Z].*[^a-z]$/) && trimmed.length < 60) {
      inSection = false;
    }

    if (inSection && trimmed.match(/^[-•*●▪–]\s+|^\d+\.\s+/)) {
      const clean = trimmed.replace(/^[-•*●▪–\d.]+\s*/, '').trim();
      if (clean.length >= 5 && clean.length < 100) results.push(clean);
    }
  }

  return results;
}

function extractRequirements(description, highlights) {
  const found = new Set();

  // 1. JSearch structured qualifications — highest priority
  if (Array.isArray(highlights?.Qualifications)) {
    for (const q of highlights.Qualifications) {
      const clean = q.replace(/^[-•]\s*/, "").trim();
      if (clean.length < 80) found.add(clean);
    }
  }
  if (found.size >= 6) return Array.from(found).slice(0, 10);

  if (!description) return Array.from(found).slice(0, 10);

  // 2. Bullet points from Requirements/Qualifications sections
  for (const b of extractSectionBullets(description)) found.add(b);
  if (found.size >= 6) return Array.from(found).slice(0, 10);

  // 3. Expanded keyword regex fallback — covers UX, design, product, leadership terms
  let m;
  SKILL_KEYWORD_RE.lastIndex = 0;
  while ((m = SKILL_KEYWORD_RE.exec(description)) !== null) {
    // Normalize multi-word matches to title case
    const matched = m[1];
    const canonical = matched.charAt(0).toUpperCase() + matched.slice(1);
    found.add(canonical);
  }

  return Array.from(found).slice(0, 10);
}

let _httpGetImpl = null;
function httpGet(url, headers = {}) {
  if (_httpGetImpl) return _httpGetImpl(url, headers);
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { "User-Agent": "job-search-app/1.0", ...headers },
    };
    https
      .get(url, opts, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

// ─── JSearch (RapidAPI) ──────────────────────────────────────────────────────

function formatPayRange(min, max, currency, period) {
  if (!min && !max) return "";
  const symbol = currency === "CAD" ? "CA$" : "$";
  const suffix = period === "HOUR" ? "/hr" : period === "MONTH" ? "/mo" : "";
  const fmt = (n) =>
    n >= 1000 && period !== "HOUR"
      ? `${Math.round(n / 1000)}k`
      : `${Math.round(n)}`;
  if (min && max) return `${symbol}${fmt(min)} — ${symbol}${fmt(max)}${suffix}`;
  if (min) return `${symbol}${fmt(min)}+${suffix}`;
  return `up to ${symbol}${fmt(max)}${suffix}`;
}

function transformJSearchJob(job) {
  const city = job.job_city || "";
  const state = job.job_state || "";
  const country = job.job_country || "";
  const locationParts = [city, state, country].filter(Boolean);
  const location = locationParts.join(", ") || "Canada";

  return {
    job_title: job.job_title || "",
    company: job.employer_name || "",
    description: job.job_description || "",
    requirements_array: extractRequirements(
      job.job_description,
      job.job_highlights,
    ),
    location,
    is_remote: Boolean(job.job_is_remote),
    url: job.job_apply_link || job.job_google_link || "",
    postedAt: job.job_posted_at_datetime_utc || null,
    pay_range: formatPayRange(
      job.job_min_salary,
      job.job_max_salary,
      job.job_salary_currency,
      job.job_salary_period,
    ),
  };
}

function sanitizeTitle(t) {
  // Take only the first segment when title uses "|" as separator
  const primary = t.split('|')[0];
  return primary
    .replace(/^[-•●▪–—*\s]+/, "") // strip leading bullets/dashes
    .replace(/[•●▪()[\]{}]/g, "") // strip special chars anywhere
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Career ladder expansion ──────────────────────────────────────────────────

const CAREER_PROGRESSIONS = [
  // Engineering: Lead / Tech Lead → management or principal track
  {
    match: /\b(tech|technical)\s+lead\b/i,
    next:  ['Engineering Manager', 'Principal Engineer'],
  },
  // Lead or Staff Engineer → principal / management
  {
    match: /\b(lead|staff)\s+(software|frontend|front-end|backend|back-end|full.?stack|mobile|platform)?\s*(engineer|developer)\b/i,
    next:  ['Engineering Manager', 'Principal Engineer'],
  },
  // Principal → Director / Distinguished
  {
    match: /\bprincipal\s+(software|frontend|backend|full.?stack)?\s*(engineer|developer)\b/i,
    next:  ['Distinguished Engineer', 'Director of Engineering'],
  },
  // Senior → Staff
  {
    match: /\bsenior\s+(software|frontend|front-end|backend|back-end|full.?stack|mobile|platform|web)?\s*(engineer|developer)\b/i,
    next:  ['Staff Engineer', 'Lead Engineer'],
  },
  // Mid-level engineer → Senior
  {
    match: /^(?!.*(senior|lead|staff|principal|junior|jr|associate|intern))(software|frontend|front-end|backend|back-end|full.?stack|mobile|web)?\s*(engineer|developer)\b/i,
    next:  ['Senior Software Engineer', 'Senior Developer'],
  },
  // Design: Lead/Senior designer → management
  {
    match: /\b(lead|senior|principal)\s+(ux|ui|product|visual|experience|interaction)?\s*(designer|design)\b/i,
    next:  ['Design Manager', 'Head of Design', 'Principal Designer'],
  },
  // Mid-level designer → Senior
  {
    match: /^(?!.*(senior|lead|principal|junior))(ux|ui|product|visual|experience|interaction)\s+designer\b/i,
    next:  ['Senior UX Designer', 'Senior Product Designer'],
  },
  // Product management
  {
    match: /\bsenior\s+product\s+manager\b/i,
    next:  ['Group Product Manager', 'Director of Product'],
  },
  {
    match: /^(?!.*senior)\bproduct\s+manager\b/i,
    next:  ['Senior Product Manager'],
  },
];

function expandCareerTitles(title) {
  const clean = title.trim();
  if (!clean) return [];
  const results = [clean];
  for (const { match, next } of CAREER_PROGRESSIONS) {
    if (match.test(clean)) {
      results.push(...next);
      break;
    }
  }
  return [...new Set(results)];
}

// Tokens that indicate an education/teaching role — not searchable for job board queries
const TEACHER_RE = /\b(teach|teacher|teaching|instructor|classroom|curriculum|school|student|pupil|grade|lesson|tutor)\b/i;

function isSearchableTitle(title) {
  const clean = sanitizeTitle(title).trim();
  if (!clean) return false;
  if (TEACHER_RE.test(clean)) return false;
  return true;
}

function buildSingleQuery(title, userLocation = "") {
  const clean = sanitizeTitle(title);
  if (!clean) return "";
  const locationSuffix = userLocation.trim() || "Remote";
  const query = `${clean} ${locationSuffix}`;
  console.log(
    "[buildSingleQuery] title:",
    clean,
    "| userLocation:",
    userLocation || "(empty)",
    "| query:",
    query,
  );
  return query;
}

// Fetch for ONE title — cache keyed per individual query
async function fetchOneTitle({
  title,
  country = "CA",
  resultsPerPage = 10,
  userLocation = "",
}) {
  const owKey = process.env.OPENWEBNINJA_KEY;
  const rapidKey = process.env.RAPIDAPI_KEY;

  const query = buildSingleQuery(title, userLocation);
  if (!query) return [];

  // DRY_RUN → log and return nothing (caller merges mock separately)
  if (process.env.DRY_RUN === "true") {
    console.log("[dry-run] query that would be sent:", query);
    return [];
  }

  // Cache check
  const cached = cacheGet(query);
  if (cached) {
    console.log(`[jobs] cache hit: ${slugify(query)}.json`);
    return cached;
  }

  console.log(`[jobs] cache miss — calling JSearch: "${query}"`);

  const params = new URLSearchParams({
    query,
    num_pages: "1",
    country,
    date_posted: "all",
  });

  let url, headers;
  if (owKey) {
    url = `https://api.openwebninja.com/jsearch/search?${params}`;
    headers = { "X-API-Key": owKey };
  } else {
    url = `https://jsearch.p.rapidapi.com/search?${params}`;
    headers = {
      "X-RapidAPI-Key": rapidKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    };
  }

  const { status, body } = await httpGet(url, headers);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`JSearch parse error: ${e.message}`, { cause: e });
  }

  if (status !== 200) {
    throw new Error(
      `JSearch API error ${status}: ${parsed?.message || body.slice(0, 200)}`,
    );
  }

  const jobs = (parsed.data || [])
    .slice(0, resultsPerPage)
    .map(transformJSearchJob);
  cacheSet(query, jobs);
  console.log(`[jobs] cached ${jobs.length} results → ${slugify(query)}.json`);

  return jobs;
}

function normalizeForDedup(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}

function deduplicateJobs(jobs) {
  const seenUrls = new Set();
  const seenKeys = new Set();
  return jobs.filter((job) => {
    if (job.url) {
      if (seenUrls.has(job.url)) return false;
      seenUrls.add(job.url);
    }
    // Cross-source dedup: same title+company from different boards
    const key = `${normalizeForDedup(job.job_title)}|${normalizeForDedup(job.company)}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

const NARROW_THRESHOLD = 5; // expand to province if city returns fewer than this

async function fetchFromJSearch({
  titles,
  userLocation = "",
  country = "CA",
  resultsPerPage = 10,
}) {
  if (process.env.USE_MOCK_DATA === "true") {
    console.log("[jobs] mock mode active");
    return getMockData();
  }

  const owKey = process.env.OPENWEBNINJA_KEY;
  const rapidKey = process.env.RAPIDAPI_KEY;
  if (!owKey && !rapidKey)
    throw new Error("Set OPENWEBNINJA_KEY or RAPIDAPI_KEY env var");

  const topTitles = [
    ...new Set(
      titles
        .map(sanitizeTitle)
        .filter(t => t && isSearchableTitle(t))
        .flatMap(expandCareerTitles)
    ),
  ].slice(0, 5);

  if (process.env.DRY_RUN === "true") {
    topTitles.forEach((t) =>
      console.log("[dry-run] query:", buildSingleQuery(t, userLocation)),
    );
    return getMockData();
  }

  // Split "City, Province" → city for narrow, province for wide
  const [city = "", province = ""] = userLocation
    .split(",")
    .map((s) => s.trim());
  const narrowLocation = city || userLocation;

  // Phase 1 — narrow: city-level (~25 km)
  const narrowRaw = await Promise.all(
    topTitles.map((t) =>
      fetchOneTitle({ title: t, userLocation: narrowLocation, resultsPerPage }),
    ),
  );
  const narrowJobs = deduplicateJobs(narrowRaw.flat());
  console.log(
    `[radius] narrow (${narrowLocation || "Remote"}): ${narrowJobs.length} results`,
  );

  // Phase 2 — wide: province-level if city returned too few
  let wideJobs = [];
  if (narrowJobs.length < NARROW_THRESHOLD && province) {
    const wideRaw = await Promise.all(
      topTitles.map((t) =>
        fetchOneTitle({ title: t, userLocation: province, resultsPerPage }),
      ),
    );
    wideJobs = deduplicateJobs(wideRaw.flat());
    console.log(`[radius] wide (${province}): ${wideJobs.length} results`);
  }

  // Canada-wide — always run; catches jobs outside narrow city/province
  const canadaRaw = await Promise.all(
    topTitles.map((t) =>
      fetchOneTitle({ title: t, userLocation: 'Canada', resultsPerPage }),
    ),
  );
  const canadaJobs = deduplicateJobs(canadaRaw.flat());
  console.log(`[radius] canada-wide: ${canadaJobs.length} results`);

  // Remote — always merged, never filtered by location
  const remoteLocation = `Remote, ${country}`;
  const remoteRaw = await Promise.all(
    topTitles.map((t) =>
      fetchOneTitle({
        title: t,
        userLocation: remoteLocation,
        resultsPerPage: Math.ceil(resultsPerPage / 2),
      }),
    ),
  );
  const remoteJobs = deduplicateJobs(remoteRaw.flat());
  console.log(`[radius] remote injection: ${remoteJobs.length} results`);

  const all = deduplicateJobs([...narrowJobs, ...wideJobs, ...canadaJobs, ...remoteJobs]);
  console.log(
    `[jobs] total ${all.length} unique (narrow=${narrowJobs.length} wide=${wideJobs.length} canada=${canadaJobs.length} remote=${remoteJobs.length})`,
  );
  return all;
}

// ─── Remotive fallback (no key needed) ───────────────────────────────────────

const CANADA_COMPATIBLE = [
  /\bcanada\b/i,
  /\bworldwide\b/i,
  /\bamericas\b/i,
  /\bnorth america\b/i,
  /\bglobal\b/i,
  /^anywhere$/i,
  /^remote$/i,
];

function isCompatibleWithLocation(candidateLocation, userLocation) {
  if (!userLocation || !candidateLocation) return true;
  const lower = candidateLocation.toLowerCase();
  if (CANADA_COMPATIBLE.some((p) => p.test(lower))) return true;
  const country = userLocation.split(",").pop().trim().toLowerCase();
  return country && lower.includes(country);
}

function transformRemotiveJob(job) {
  const candidateLocation = job.candidate_required_location || "";
  return {
    job_title: job.title || "",
    company: job.company_name || "",
    description: job.description || "",
    requirements_array: extractRequirements(job.description),
    location: candidateLocation || "Worldwide",
    is_remote: true,
    url: job.url || "",
    postedAt: job.publication_date || null,
    pay_range: "",
    _candidateLocation: candidateLocation,
  };
}

async function fetchFromRemotive({ title, userLocation, resultsPerPage = 40 }) {
  const params = new URLSearchParams({ search: title, limit: resultsPerPage });
  const { status, body } = await httpGet(
    `https://remotive.com/api/remote-jobs?${params}`,
  );

  if (status !== 200) throw new Error(`Remotive API returned ${status}`);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`Remotive parse error: ${e.message}`, { cause: e });
  }

  const all = (parsed.jobs || []).map(transformRemotiveJob);
  const compatible = all.filter((j) =>
    isCompatibleWithLocation(j._candidateLocation, userLocation),
  );
  const results = (compatible.length > 0 ? compatible : all).slice(
    0,
    Math.ceil(resultsPerPage / 2),
  );

  return results.map(({ _candidateLocation, ...job }) => job);
}

// ─── Adzuna (optional — requires ADZUNA_APP_ID + ADZUNA_APP_KEY) ─────────────

function transformAdzunaJob(job) {
  const title = job.title || '';
  const desc  = job.description || '';
  return {
    job_title: title,
    company:   job.company?.display_name || '',
    description: desc,
    requirements_array: extractRequirements(title + '\n' + desc),
    location: job.location?.display_name || 'Canada',
    is_remote: /remote/i.test(title + ' ' + desc),
    url: job.redirect_url || '',
    postedAt: job.created || null,
    pay_range: job.salary_min && job.salary_max
      ? `CA$${Math.round(job.salary_min / 1000)}k — CA$${Math.round(job.salary_max / 1000)}k`
      : '',
  };
}

async function fetchFromAdzuna({ titles, resultsPerPage = 20 }) {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const topTitles = [...new Set(titles.map(sanitizeTitle).filter(Boolean))].slice(0, 3);
  const allJobs = [];

  for (const title of topTitles) {
    const params = new URLSearchParams({
      app_id:           appId,
      app_key:          appKey,
      results_per_page: resultsPerPage,
      what:             title,
      // /ca/ path scopes to Canada — no `where` or `content_type` needed
    });
    let status, body;
    try {
      ({ status, body } = await httpGet(`https://api.adzuna.com/v1/api/jobs/ca/search/1?${params}`));
    } catch { continue; }
    if (status !== 200) continue;
    try {
      const parsed = JSON.parse(body);
      for (const job of parsed.results || []) allJobs.push(transformAdzunaJob(job));
    } catch { continue; }
  }

  return deduplicateJobs(allJobs);
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchJobs({ title, titles, userLocation, country = 'CA', resultsPerPage = 20 }) {
  const allTitles = titles?.length ? titles : [title];

  let jobs;
  if (process.env.OPENWEBNINJA_KEY || process.env.RAPIDAPI_KEY) {
    // Mock mode: JSearch returns mock data internally — skip all external HTTP sources
    if (process.env.USE_MOCK_DATA === 'true') {
      jobs = await fetchFromJSearch({ titles: allTitles, userLocation, country, resultsPerPage });
      return jobs.map((job) => job.postedAt ? job : { ...job, postedAt: randomPostedAt() });
    }

    // Run all sources in parallel; Remotive and Adzuna degrade gracefully
    const jsearchPromise = process.env.DISABLE_JSEARCH === 'true'
      ? Promise.resolve([])
      : fetchFromJSearch({ titles: allTitles, userLocation, country, resultsPerPage });
    const [jsearchResult, remotiveResult, adzunaResult] = await Promise.allSettled([
      jsearchPromise,
      fetchFromRemotive({ title: allTitles[0], userLocation, resultsPerPage: resultsPerPage * 2 }),
      fetchFromAdzuna({ titles: allTitles, resultsPerPage }),
    ]);

    const jsearchJobs  = jsearchResult.status  === 'fulfilled' ? jsearchResult.value  : [];
    const remotiveJobs = remotiveResult.status === 'fulfilled' ? remotiveResult.value : [];
    const adzunaJobs   = adzunaResult.status   === 'fulfilled' ? adzunaResult.value   : [];

    if (jsearchResult.status === 'rejected')
      console.warn('[jobs] JSearch failed:', jsearchResult.reason?.message);
    if (remotiveResult.status === 'rejected')
      console.warn('[jobs] Remotive failed:', remotiveResult.reason?.message);

    console.log(`[jobs] sources — jsearch=${jsearchJobs.length} remotive=${remotiveJobs.length} adzuna=${adzunaJobs.length}`);
    jobs = deduplicateJobs([...jsearchJobs, ...remotiveJobs, ...adzunaJobs]);
  } else {
    jobs = await fetchFromRemotive({
      title: allTitles[0],
      userLocation,
      resultsPerPage: resultsPerPage * 2,
    });
  }

  return jobs.map((job) => job.postedAt ? job : { ...job, postedAt: randomPostedAt() });
}

const PRESERVED_CACHE_FILES = new Set(['notified.json']);

function clearCache() {
  if (!fs.existsSync(CACHE_DIR)) return 0;
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.json') && !PRESERVED_CACHE_FILES.has(f));
  files.forEach(f => {
    try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch { /* noop — file may already be gone */ }
  });
  return files.length;
}

module.exports = {
  fetchJobs, clearCache, fetchFromJSearch, fetchFromRemotive, fetchFromAdzuna,
  // pure helpers — exported for unit testing
  slugify, sanitizeTitle, buildSingleQuery,
  deduplicateJobs, extractRequirements,
  formatPayRange, isCompatibleWithLocation,
  transformJSearchJob, transformRemotiveJob, transformAdzunaJob,
  getMockData,
  cacheGet, cacheSet,
  isSearchableTitle, expandCareerTitles,
  _setCacheDirForTesting: (dir) => { CACHE_DIR = dir; },
  _setHttpGetForTesting:  (fn)  => { _httpGetImpl = fn; },
};
