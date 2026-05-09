// Ordered: specific/domain skills first, generic languages last
// Order matters — top skills used as search signal
const SKILL_VOCAB = [
  // Design practice (highest signal for design roles)
  'design systems','user research','usability testing','interaction design',
  'information architecture','design thinking','user-centered design','responsive design',
  'wireframing','prototyping','accessibility','wcag','ada',
  // Design tools
  'figma','sketch','adobe xd','invision','zeplin','principle','framer','protopie',
  'photoshop','illustrator','after effects','figma make',
  // Product / process
  'product strategy','roadmap','okrs','a/b testing','agile','scrum','kanban',
  'jira','confluence','notion','linear','mixpanel','amplitude','analytics',
  // Frontend
  'react','vue','angular','next.js','svelte','tailwind','graphql','storybook','redux',
  'html','css','sass','webpack','vite',
  // AI/ML
  'machine learning','deep learning','llm','prompt engineering','rag','langchain',
  'openai','pytorch','tensorflow',
  // Backend / infra
  'node.js','express','fastapi','django','rails','flask','spring','laravel',
  'postgresql','mysql','mongodb','redis','elasticsearch','kafka','docker',
  'kubernetes','aws','gcp','azure','terraform','ci/cd','git','linux',
  // Languages (lowest signal — too generic)
  'typescript','javascript','python','java','go','rust','ruby','php',
  'swift','kotlin','c++','c#','scala','sql','bash',
];

const DATE_PATTERN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\b(19|20)\d{2}\b/i;
const SECTION_HEADERS = /^(skills|technical skills|core competencies|technologies|tools|expertise|experience|work experience|employment|professional experience|education|academic|qualifications)/i;
const JOB_TITLE_SEPARATORS = /\s*[\/\|–\-]\s*(?=\w)/;

// Strip HTML tags that some PDF extractors leave behind
function cleanText(text) {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, '\n\n');
}

function splitLines(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

// Pull known skills from any line via vocab lookup (preserves SKILL_VOCAB order)
function extractVocabSkills(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const skill of SKILL_VOCAB) {
    if (lower.includes(skill)) {
      found.push(skill
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      );
    }
  }
  return found;
}

// Scan first N lines (header area) for a location string
const PROVINCES = new Set(['bc','ab','on','qc','mb','sk','ns','nb','nl','pe','nt','nu','yt']);
const US_STATES  = new Set(['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc']);
const COUNTRIES  = new Set(['canada','usa','united states','united kingdom','uk','australia','germany','france','india','singapore','netherlands','new zealand','ireland','spain','portugal','brazil','mexico','remote']);

function extractLocation(lines) {
  // Scan first 30 lines — location appears in header or right after first job entry
  for (const line of lines.slice(0, 30)) {
    if (line.length > 80 || line.length < 3) continue;
    // Skip lines that look like email, phone, URL, or long sentences
    if (/@|http|linkedin|github|\d{3}[.\s-]\d{3}/i.test(line)) continue;
    if (line.split(' ').length > 6) continue;

    const lower = line.toLowerCase();

    // "City, Province/State" or "City, Province/State, Country"
    const commaMatch = line.match(/^([A-Za-z\s\.\-]+),\s*([A-Za-z]{2,}(?:,\s*[A-Za-z\s]+)?)$/);
    if (commaMatch) {
      const parts = commaMatch[0].split(',').map(s => s.trim());
      const region = parts[1]?.toLowerCase().replace(/\.$/, '');
      if (
        PROVINCES.has(region) ||
        US_STATES.has(region) ||
        COUNTRIES.has(region) ||
        COUNTRIES.has(parts[2]?.toLowerCase())
      ) {
        return commaMatch[0].trim();
      }
    }

    // Bare country name on its own line
    if (COUNTRIES.has(lower.trim())) return line.trim();
  }

  return '';
}

function splitLocation(locationStr) {
  if (!locationStr) return { city: '', province: '' };
  const parts = locationStr.split(',').map(s => s.trim());
  return { city: parts[0] || '', province: parts[1] || '' };
}

// Parse job title from a line that may include date range and company
function parseJobTitle(line) {
  // Remove date ranges first
  let title = line.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\s*[-–]\s*(present|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4})/gi, '').trim();
  title = title.replace(DATE_PATTERN, '').trim();
  // Take portion before first separator that precedes a date or company indicator
  const parts = title.split(JOB_TITLE_SEPARATORS);
  title = parts[0].trim();
  // Drop trailing punctuation
  return title.replace(/[,\.\|\/–\-]+$/, '').trim();
}

const JOB_ROLE_KEYWORDS = /\b(manager|director|designer|engineer|developer|analyst|architect|coordinator|specialist|consultant|executive|officer|president|vp|head|principal|lead|strategist|researcher|scientist|producer|founder|cto|ceo|coo|cpo|owner|associate|intern|staff|technician|writer|editor|illustrator|contractor|freelancer|advisor|partner)\b/i;
// Only reject when suffix is the primary word — require it near end of a short line
const COMPANY_SUFFIXES  = /\b(inc\.?|ltd\.?|llc\.?|corp\.?|gmbh|plc)\b/i;
const LOCATION_LINE     = /\b(canada|usa|uk|australia|remote)\b|,\s*(bc|on|ab|qc|ca|ny|wa|tx)\b/i;
const BULLET_LINE       = /^[•●▪–—●•\-\*]\s*/;
// Catch action-verb sentences — "Led a team", "Lead a cross-functional..." but NOT "Tech Lead"
const SENTENCE_STARTERS = /^(led|managed|built|designed|developed|worked|created|drove|owned|improved|launched|partnered|oversaw|delivered|implemented|maintained|increased|reduced|lead\s+a|lead\s+the|lead\s+cross|lead\s+multiple)/i;

function looksLikeJobTitle(line) {
  // Hard rejects regardless of length
  if (line.length < 4) return false;
  if (BULLET_LINE.test(line)) return false;
  if (SENTENCE_STARTERS.test(line)) return false;
  if (LOCATION_LINE.test(line)) return false;
  if (COMPANY_SUFFIXES.test(line)) return false;
  if (!/^[A-Z]/.test(line)) return false;

  const hasDate = DATE_PATTERN.test(line);
  const hasRole = JOB_ROLE_KEYWORDS.test(line);
  const wordCount = line.split(/\s+/).length;

  // Job header with date range: "Sr. Designer / Jan 2020 – Present" (can be long)
  if (hasDate) return hasRole && line.length <= 120;

  // Pure title line: must contain a role keyword, ≤8 words, ≤80 chars
  return hasRole && wordCount <= 8 && line.length <= 80;
}

function extractExperience(lines) {
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (looksLikeJobTitle(line) && !SECTION_HEADERS.test(line)) {
      if (current) entries.push(current);
      current = { raw_header: line, title: parseJobTitle(line), description: '' };
    } else if (current) {
      current.description += (current.description ? ' ' : '') + line;
    }
  }
  if (current) entries.push(current);

  return entries.map(({ raw_header, title, description }) => ({ title, description }));
}

function extractEducation(lines) {
  const entries = [];
  let current = null;

  for (const line of lines) {
    const isDegree = /\b(bachelor|master|phd|doctorate|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba|associate|diploma|certificate)\b/i.test(line);
    const isInstitution = /\b(university|college|institute|school|academy)\b/i.test(line);

    if (isDegree || isInstitution) {
      if (current) entries.push(current);
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const degreeMatch = line.match(/\b(bachelor[^\,\.]*|master[^\,\.]*|phd[^\,\.]*|b\.?s\.?[^\,\.\ ]*|m\.?s\.?[^\,\.\ ]*|mba[^\,\.]*)/i);
      current = {
        institution: line,
        degree: degreeMatch?.[0]?.trim() || '',
        year: yearMatch?.[0] || '',
      };
    } else if (current && !current.degree) {
      current.degree = line;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function parseResume(rawText) {
  const text = cleanText(rawText);
  const lines = splitLines(text);

  // Vocab scan across full text — catches skills anywhere in the doc
  const vocabSkills = extractVocabSkills(text);

  // Section-based split
  const sections = {};
  let current = 'header';
  let buffer = [];

  for (const line of lines) {
    if (SECTION_HEADERS.test(line)) {
      sections[current] = buffer;
      current = line.toLowerCase().split(/\s+/)[0];
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  sections[current] = buffer;

  const expSection = sections['experience'] || sections['work'] || sections['professional'] || [];
  const eduSection = sections['education'] || sections['academic'] || sections['qualifications'] || [];

  const experience = extractExperience(expSection.length ? expSection : lines);
  const education = extractEducation(eduSection);

  // Dedupe job titles, preserve order (most recent first)
  const seen = new Set();
  const all_job_titles = experience
    .map(e => e.title)
    .filter(t => t && t.length > 3)
    .filter(t => { const k = t.toLowerCase(); return seen.has(k) ? false : seen.add(k); });

  const most_recent_job_title = all_job_titles[0] || '';

  const skillSet = new Set(vocabSkills.map(s => s.toLowerCase()));
  const skills = vocabSkills;

  const location = extractLocation(lines);
  const { city, province } = splitLocation(location);

  return {
    skills,
    most_recent_job_title,
    all_job_titles,
    location,
    city,
    province,
    experience,
    education,
  };
}

module.exports = { parseResume };
