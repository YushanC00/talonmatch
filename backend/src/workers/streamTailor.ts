// ── Types (mirrors frontend/src/types.ts — no shared package) ─────────────────

interface WorkExperience {
  company: string;
  title: string;
  period: string;
  bullets?: string[];
  description?: string;
}

interface Project {
  name: string;
  description?: string;
}

interface Education {
  degree?: string;
  school?: string;
  year?: string;
}

interface ParsedResume {
  summary_section_title?: string;
  summary?: string;
  skills: string[];
  experience: WorkExperience[];
  projects?: Project[];
  education?: Education[];
  style_config?: { sections?: string[] } | null;
}

export interface TailoredContentItem {
  id: string;
  label: string;
  original: string;
  tailored: string;
  rationale?: string;
}

export interface TailoredSection {
  title: string;
  rationale: string;
  content: TailoredContentItem[];
}

export interface ValidationResult {
  section: TailoredSection;
  patched: boolean;
  reason?: string;
}

type SectionType = 'summary' | 'experience' | 'projects' | 'skills' | 'education';

interface TypeEntry {
  title: string;
  content: TailoredContentItem[];
}

interface SourceContext {
  knownTitles: string[];
  labelSet: Set<string>;
  byType: Map<SectionType, TypeEntry>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15);
}

// Normalize title separators (| , / —) so "A | B @ Co" ≡ "A, B @ Co".
// Only the part BEFORE the @ (job title) is normalized — company and period must match exactly.
function normalizeLabel(label: string): string {
  const atIdx = label.indexOf(' @ ');
  if (atIdx === -1) return label;
  const title   = label.slice(0, atIdx).replace(/\s*[|,/\\–—]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const rest    = label.slice(atIdx);
  return title + rest;
}

function splitDesc(desc: string): string[] {
  return (desc || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10);
}

function classifySection(title: string): SectionType | null {
  const t = title.toLowerCase();
  if (/summary|profile|objective|about/.test(t))       return 'summary';
  if (/experience|employment|work\s*history|career/.test(t)) return 'experience';
  if (/project/.test(t))                               return 'projects';
  if (/skills?|tech|stack|tool|competenc|qualif/.test(t)) return 'skills';
  if (/educat|academic|degree|certif|training/.test(t)) return 'education';
  return null;
}

function buildSourceContext(resume: ParsedResume): SourceContext {
  const knownTitles: string[] = resume.style_config?.sections?.length
    ? resume.style_config.sections
    : (
        [
          resume.summary                              ? (resume.summary_section_title || 'Summary') : null,
          (resume.experience || []).length > 0        ? 'Work Experience'                           : null,
          (resume.projects   || []).length > 0        ? 'Projects'                                  : null,
          resume.skills.length > 0                    ? 'Skills'                                    : null,
          (resume.education  || []).length > 0        ? 'Education'                                 : null,
        ] as (string | null)[]
      ).filter((s): s is string => s !== null);

  const labelSet = new Set<string>();
  for (const job of (resume.experience || [])) {
    labelSet.add(normalizeLabel(`${job.title} @ ${job.company} (${job.period})`));
  }
  for (const p of (resume.projects || [])) {
    if (p.name) labelSet.add(p.name);
  }
  for (const edu of (resume.education || [])) {
    if (edu.degree) labelSet.add(edu.degree);
  }
  if (resume.skills.length > 0) {
    labelSet.add('Technical');
  }

  const byType = new Map<SectionType, TypeEntry>();

  for (const title of knownTitles) {
    const type = classifySection(title);
    if (!type || byType.has(type)) continue;

    let content: TailoredContentItem[] = [];

    if (type === 'summary' && resume.summary) {
      content = [
        { id: 'summary-0', label: '', original: resume.summary, tailored: resume.summary },
      ];
    } else if (type === 'experience' && (resume.experience || []).length > 0) {
      content = resume.experience.flatMap((job: WorkExperience) => {
        const bullets =
          Array.isArray(job.bullets) && job.bullets.length > 0
            ? job.bullets
            : splitDesc(job.description || '');
        const co  = slug(job.company);
        const lbl = `${job.title} @ ${job.company} (${job.period})`;
        return bullets.slice(0, 6).map((b: string, bi: number) => ({
          id:       `we-${co}-${bi}`,
          label:    bi === 0 ? lbl : '',
          original: b,
          tailored: b,
        }));
      });
    } else if (type === 'projects' && (resume.projects || []).length > 0) {
      content = (resume.projects || []).map((p: Project) => ({
        id:       `proj-${slug(p.name)}-0`,
        label:    p.name || '',
        original: p.description || '',
        tailored: p.description || '',
      }));
    } else if (type === 'skills' && resume.skills.length > 0) {
      content = [
        {
          id:       'skills-hard-0',
          label:    'Technical',
          original: resume.skills.join(', '),
          tailored: resume.skills.join(', '),
        },
      ];
    } else if (type === 'education' && (resume.education || []).length > 0) {
      content = (resume.education || []).map((edu: Education, i: number) => {
        const text = [edu.degree, edu.school, edu.year ? `(${edu.year})` : '']
          .filter(Boolean)
          .join(' — ');
        return { id: `edu-${i}`, label: edu.degree || '', original: text, tailored: text };
      });
    }

    if (content.length) byType.set(type, { title, content });
  }

  return { knownTitles, labelSet, byType };
}

function buildFallback(aiTitle: string, ctx: SourceContext): TailoredSection {
  const type  = classifySection(aiTitle);
  const entry = type ? ctx.byType.get(type) : undefined;
  return {
    title:    entry?.title ?? aiTitle,
    rationale: '',
    content:  entry?.content ?? [],
  };
}

// ── Guards ────────────────────────────────────────────────────────────────────

function guardTitleIntegrity(section: TailoredSection, ctx: SourceContext): boolean {
  return ctx.knownTitles.includes(section.title);
}

function guardDimensionParity(section: TailoredSection, ctx: SourceContext): boolean {
  const type = classifySection(section.title);
  if (!type) return false;
  const sourceLen = ctx.byType.get(type)?.content.length ?? 0;
  return section.content.length >= sourceLen;
}

// Experience labels follow "Role @ Company (Period)" — the @ marker identifies them.
// Only those need date/company integrity checks; other section labels (skill categories,
// project names, degree strings) are not date-sensitive and vary legitimately.
function guardLabelLock(section: TailoredSection, ctx: SourceContext): boolean {
  for (const item of section.content) {
    if (item.label !== '' && item.label.includes('@') && !ctx.labelSet.has(normalizeLabel(item.label))) return false;
  }
  return true;
}

function guardSyntaxIntegrity(section: TailoredSection): boolean {
  let tilde = 0;
  let plus  = 0;
  for (const item of section.content) {
    const t = item.tailored ?? '';
    tilde += (t.match(/~~/g) ?? []).length;
    // exclude ++ preceded by alphanumeric (e.g. C++, g++) — those are identifiers, not diff markers
    plus  += (t.match(/(?<![a-zA-Z0-9])\+\+/g) ?? []).length;
  }
  return tilde % 2 === 0 && plus % 2 === 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function validateAndPatchSection(
  section: TailoredSection,
  parsedResume: ParsedResume,
): ValidationResult {
  const ctx = buildSourceContext(parsedResume);

  if (!guardTitleIntegrity(section, ctx)) {
    console.warn('[streamTailor] guard fired: title-integrity —', section.title);
    return { section: buildFallback(section.title, ctx), patched: true, reason: 'title-integrity' };
  }

  if (!guardDimensionParity(section, ctx)) {
    console.warn('[streamTailor] guard fired: dimension-parity —', section.title);
    return { section: buildFallback(section.title, ctx), patched: true, reason: 'dimension-parity' };
  }

  if (!guardLabelLock(section, ctx)) {
    console.warn('[streamTailor] guard fired: label-lock —', section.title);
    return { section: buildFallback(section.title, ctx), patched: true, reason: 'label-lock' };
  }

  if (!guardSyntaxIntegrity(section)) {
    console.warn('[streamTailor] guard fired: syntax-integrity —', section.title);
    return { section: buildFallback(section.title, ctx), patched: true, reason: 'syntax-integrity' };
  }

  return { section, patched: false };
}
