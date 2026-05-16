import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ParsedResume, StyleConfig, TailoredSection } from '../types';
import { effectiveText, groupExpItems } from './resumePDFHelpers';
import type { ContentItem, Section } from './resumePDFHelpers';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ResumePDFProps {
  sections: TailoredSection[]
  parsedResume: ParsedResume | null
  reviews: Record<string, string>
  editValues: Record<string, string>
}

// ── Section classification ────────────────────────────────────────────────────

const RX_SUMMARY   = /summary|professional profile|career profile|about|objective/i;
const RX_SKILLS    = /skill|technical|tech stack|stack|technologies|expertise|competencies|tools/i;
const RX_EXP       = /experience|employment|work history|career history/i;
const RX_EDUCATION = /education|academic|qualification|degree/i;
const RX_PROJECTS  = /project|portfolio/i;

function sectionType(title: string) {
  if (RX_SUMMARY.test(title))   return 'summary';
  if (RX_SKILLS.test(title))    return 'skills';
  if (RX_EXP.test(title))       return 'experience';
  if (RX_EDUCATION.test(title)) return 'education';
  if (RX_PROJECTS.test(title))  return 'projects';
  return 'generic';
}

function cleanSections(
  sections: Section[],
  reviews: Record<string, string>,
  editValues: Record<string, string>,
): Section[] {
  const seenTypes = new Set<string>();
  return sections.filter(s => {
    const items = s.content as ContentItem[];
    const hasContent = items.some(item => {
      const text = effectiveText(item, s.title, reviews, editValues);
      return text && text.trim().length > 2;
    });
    if (!hasContent) return false;

    const type = sectionType(s.title);
    if (type === 'skills' || type === 'summary') {
      if (seenTypes.has(type)) return false;
    }
    seenTypes.add(type);
    return true;
  });
}

// When tailoring produces all-empty sections (e.g. unusual template formats),
// fall back to rendering the original parsed resume content.
function buildFallbackSections(pr: ParsedResume | null): Section[] {
  if (!pr) return [];
  const out: Section[] = [];
  if (pr.summary) {
    out.push({ title: 'Professional Summary', rationale: '', content: [
      { id: 'summary', label: '', original: pr.summary, tailored: pr.summary },
    ]});
  }
  if (pr.skills?.length) {
    out.push({ title: 'Skills', rationale: '', content: [
      { id: 'skills', label: 'Technical', original: pr.skills.join(', '), tailored: pr.skills.join(', ') },
    ]});
  }
  if (pr.experience?.length) {
    const items: ContentItem[] = pr.experience.flatMap((exp, ei) =>
      (exp.bullets ?? (exp.description ? [exp.description] : [])).map((b, bi) => ({
        id: `exp-${ei}-${bi}`,
        label: `${exp.title ?? ''}${exp.company ? ' @ ' + exp.company : ''}${exp.period ? ' (' + exp.period + ')' : ''}`,
        original: b, tailored: b,
      }))
    );
    if (items.length) out.push({ title: 'Work Experience', rationale: '', content: items });
  }
  if (pr.education?.length) {
    out.push({ title: 'Education', rationale: '', content: pr.education.map((edu, i) => ({
      id: `edu-${i}`,
      label: `${edu.degree}${edu.school ? ' @ ' + edu.school : ''}${edu.year ? ' (' + edu.year + ')' : ''}`,
      // Label already carries the full info; empty body suppresses the redundant bullet row
      original: '', tailored: '',
    }))});
  }
  return out;
}

// Ï = PDF-encoded ● glyph; strip leading bullets before printing
const LEADING_BULLET = /^[Ï•●▪▫▸‣›◦○■⁃·–—»]\s*/;
function cleanBullet(text: string): string {
  return text.normalize('NFC').replace(LEADING_BULLET, '').trim();
}

// ── Sidebar background detection ──────────────────────────────────────────────

function hexLuminance(hex: string | null): number {
  if (!hex) return 1;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// When the accent color is very dark (luminance < 0.15) it's almost certainly
// a sidebar background panel, not a text accent.
function resolveSidebarColors(sc: StyleConfig | null | undefined) {
  const accent = sc?.accentColor ?? null;
  const lum = hexLuminance(accent);
  const hasDarkSidebar = lum < 0.15;
  return {
    sidebarBg:        hasDarkSidebar ? accent! : null,
    sidebarTextColor: hasDarkSidebar ? '#e8e6e0' : '#555555',
    sidebarTitleColor: hasDarkSidebar ? '#ffffff' : (accent ?? '#333333'),
    sidebarRuleColor:  hasDarkSidebar ? 'rgba(255,255,255,0.25)' : (accent ?? '#333333'),
    textAccent:       hasDarkSidebar ? '#d0a060' : (accent ?? '#333333'),
  };
}

// ── Design resolution ─────────────────────────────────────────────────────────

function resolveFonts(sc: StyleConfig | null | undefined) {
  const p = sc?.fontProfile ?? 'sans-serif';
  return {
    base:   p === 'serif' ? 'Times-Roman'     : p === 'monospace' ? 'Courier'         : 'Helvetica',
    bold:   p === 'serif' ? 'Times-Bold'      : p === 'monospace' ? 'Courier-Bold'    : 'Helvetica-Bold',
    italic: p === 'serif' ? 'Times-Italic'    : p === 'monospace' ? 'Courier-Oblique' : 'Helvetica-Oblique',
  };
}

function resolveSizes(sc: StyleConfig | null | undefined) {
  return {
    name:    Math.min(Math.max(sc?.fontSize?.name    ?? 18, 14), 26),
    heading: Math.min(Math.max(sc?.fontSize?.heading ?? 10,  8), 13),
    body:    Math.min(Math.max(sc?.fontSize?.body    ?? 10,  8), 12),
  };
}

function resolveMargins(sc: StyleConfig | null | undefined) {
  const raw  = sc?.layout?.marginLeft ?? 57;
  const side = Math.min(Math.max(Math.round(raw * 0.75), 28), 72);
  return { top: 44, bottom: 44, left: side, right: side };
}

// ── Fuzzy column matcher ───────────────────────────────────────────────────────

function matchesColumnList(sectionTitle: string, columnTitles: string[]): boolean {
  const st = sectionTitle.toLowerCase().trim();
  // Collapse inter-letter spaces for spaced-letter titles like "S K I L L S" → "skills"
  const stC = st.replace(/\s/g, '');
  return columnTitles.some(ct => {
    const c = ct.toLowerCase().trim();
    const cC = c.replace(/\s/g, '');
    return st === c || st.includes(c) || c.includes(st)
      || stC === cC || stC.includes(cC) || cC.includes(stC);
  });
}

// ── Section renderer ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Styles = any;

function BulletRow({ item, section, bullet, accent, bodySize, textColor, reviews, editValues }: {
  item: ContentItem; section: string; bullet: string; accent: string;
  bodySize: number; textColor?: string;
  reviews: Record<string, string>; editValues: Record<string, string>;
}) {
  const text = cleanBullet(effectiveText(item, section, reviews, editValues));
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', marginBottom: 3 }}>
      <Text style={{ width: 12, flexShrink: 0, color: accent, fontSize: bodySize }}>{bullet}</Text>
      <Text style={{ flex: 1, fontSize: bodySize, color: textColor }}>{text}</Text>
    </View>
  );
}

function renderSection(
  section: Section,
  styles: Styles,
  bullet: string,
  accent: string,
  fonts: ReturnType<typeof resolveFonts>,
  sizes: ReturnType<typeof resolveSizes>,
  reviews: Record<string, string>,
  editValues: Record<string, string>,
  isSidebar = false,
  sidebarTextColor?: string,
) {
  const items    = section.content as ContentItem[];
  const type     = sectionType(section.title);
  const bodySize = isSidebar ? Math.max(sizes.body - 1, 7.5) : sizes.body;
  const bodyColor = isSidebar ? sidebarTextColor : undefined;
  const bulletProps = { section: section.title, bullet, accent, bodySize, textColor: bodyColor, reviews, editValues };

  return (
    <View key={section.title} style={isSidebar ? styles.sidebarSection : styles.section}>
      <Text style={isSidebar ? styles.sidebarSectionTitle : styles.sectionTitle}>{section.title}</Text>

      {type === 'summary' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        return text
          ? <Text key={i} style={{ marginBottom: 4, lineHeight: 1.5, fontSize: bodySize, color: bodyColor }}>{text}</Text>
          : null;
      })}

      {type === 'skills' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return (
          <Text key={i} style={{ marginBottom: 3, fontSize: bodySize, color: bodyColor }}>
            {item.label
              ? <Text><Text style={{ fontFamily: fonts.bold, fontSize: bodySize, color: bodyColor }}>{item.label}: </Text>{text}</Text>
              : cleanBullet(text)
            }
          </Text>
        );
      })}

      {type === 'experience' && groupExpItems(items).map((g, gi) => (
        <View key={gi} style={{ marginBottom: 10 }} wrap={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: bodySize, flex: 1, color: bodyColor }}>{g.role || g.roleCompany}</Text>
            {g.period
              ? <Text style={{ fontFamily: fonts.italic, fontSize: Math.max(bodySize - 1, 7), color: bodyColor ?? '#888888' }}>{g.period}</Text>
              : null}
          </View>
          {g.company
            ? <Text style={{ fontSize: Math.max(bodySize - 1, 7), color: bodyColor ?? accent, marginBottom: 3 }}>{g.company}</Text>
            : null}
          {g.items.map((item, bi) => <BulletRow key={bi} item={item} {...bulletProps} />)}
        </View>
      ))}

      {type === 'education' && (() => {
        const groups = groupExpItems(items);
        if (groups.length > 0) return groups.map((g, gi) => (
          <View key={gi} style={{ marginBottom: 8 }} wrap={false}>
            {(g.role || g.roleCompany) && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: bodySize, flex: 1, color: bodyColor }}>{g.role || g.roleCompany}</Text>
                {g.period
                  ? <Text style={{ fontFamily: fonts.italic, fontSize: Math.max(bodySize - 1, 7), color: bodyColor ?? '#888888' }}>{g.period}</Text>
                  : null}
              </View>
            )}
            {g.company
              ? <Text style={{ fontSize: Math.max(bodySize - 1, 7), color: bodyColor ?? '#666666', marginBottom: 2 }}>{g.company}</Text>
              : null}
            {g.items.map((item, bi) => {
              const text = cleanBullet(effectiveText(item, section.title, reviews, editValues));
              if (!text) return null;
              const roleStr = g.role || g.roleCompany;
              const roleNorm = roleStr.toLowerCase().trim();
              const textNorm = text.toLowerCase().trim();
              // If bullet starts with the already-displayed role name, extract the extra info
              // (school, year, location) and show it as a small subtitle instead of a bullet
              if (roleNorm && textNorm.startsWith(roleNorm)) {
                const extra = text.slice(roleStr.length).replace(/^\s*[—–-]\s*/, '').replace(/^\(/, '').replace(/\)$/, '').trim();
                if (!extra || extra === g.company || extra === g.period) return null;
                return <Text key={bi} style={{ fontSize: Math.max(bodySize - 1, 7), color: bodyColor ?? '#666666', marginBottom: 2 }}>{extra}</Text>;
              }
              return <BulletRow key={bi} item={item} {...bulletProps} />;
            })}
          </View>
        ));
        return items.map((item, i) => {
          const text = effectiveText(item, section.title, reviews, editValues);
          return text
            ? <Text key={i} style={{ marginBottom: 4, lineHeight: 1.5, fontSize: bodySize }}>{text}</Text>
            : null;
        });
      })()}

      {type === 'projects' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return item.label ? (
          <View key={i} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={{ fontFamily: fonts.bold, fontSize: bodySize, color: accent, marginBottom: 2 }}>{item.label}</Text>
            <Text style={{ marginBottom: 4, lineHeight: 1.5, fontSize: bodySize }}>{text}</Text>
          </View>
        ) : <BulletRow key={i} item={item} {...bulletProps} />;
      })}

      {type === 'generic' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return item.label ? (
          <View key={i} style={{ marginBottom: 6 }} wrap={false}>
            <Text style={{ fontFamily: fonts.bold, fontSize: bodySize, marginBottom: 2 }}>{item.label}</Text>
            <Text style={{ marginBottom: 4, lineHeight: 1.5, fontSize: bodySize }}>{cleanBullet(text)}</Text>
          </View>
        ) : <BulletRow key={i} item={item} {...bulletProps} />;
      })}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResumePDF({ sections, parsedResume, reviews, editValues }: ResumePDFProps) {
  const sc      = parsedResume?.style_config;
  const fonts   = resolveFonts(sc);
  const sizes   = resolveSizes(sc);
  const margins = resolveMargins(sc);
  const bullet      = sc?.bullets ?? '•';
  const headerAlign = sc?.layout?.headerAlign ?? 'left';
  const isMultiCol  = sc?.layout?.columns === 2;

  const sidebar = resolveSidebarColors(sc);
  const isDarkSidebar = sidebar.sidebarBg !== null;
  // When sidebar is dark, keep main column neutral so accent doesn't clash
  const accent  = isDarkSidebar ? '#333333' : (sc?.accentColor ?? '#333333');

  // Dark sidebar extends to the raw page edge — remove page left margin so it fills fully
  const pagePaddingLeft  = isDarkSidebar && isMultiCol ? 0 : margins.left;
  const pagePaddingTop   = isDarkSidebar && isMultiCol ? 0 : margins.top;

  const styles = StyleSheet.create({
    page: {
      fontFamily: fonts.base,
      fontSize:   sizes.body,
      color:      '#1a1a1a',
      paddingTop:    pagePaddingTop,
      paddingBottom: margins.bottom,
      paddingLeft:   pagePaddingLeft,
      paddingRight:  margins.right,
      lineHeight: 1.45,
    },

    // ── Single-column header ────────────────────────────────────────────────
    header: {
      marginBottom: 14,
      borderBottom: `1pt solid ${accent}`,
      paddingBottom: 8,
      alignItems: headerAlign === 'center' ? 'center' : 'flex-start',
    },
    name:        { fontFamily: fonts.bold, fontSize: sizes.name, color: accent, marginBottom: 2 },
    jobTitle:    { fontFamily: fonts.italic, fontSize: sizes.body + 1, color: '#555555', marginBottom: 3 },
    contactLine: { fontFamily: fonts.base, fontSize: Math.max(sizes.body - 1, 7.5), color: '#666666' },

    // ── Two-column layout ───────────────────────────────────────────────────
    twoColWrapper: {
      flexDirection: 'row',
    },
    leftCol: {
      width: '31%',
      paddingRight: 14,
      paddingLeft: isDarkSidebar ? margins.left : 0,
      paddingTop:  isDarkSidebar ? margins.top  : 0,
      borderRight: isDarkSidebar ? undefined : `0.75pt solid #d8d4cc`,
      backgroundColor: sidebar.sidebarBg ?? undefined,
    },
    rightCol: {
      width: '69%',
      paddingLeft: isDarkSidebar ? 20 : 16,
      paddingTop:  isDarkSidebar ? margins.top : 0,
    },

    // Sidebar name block
    sidebarName: {
      fontFamily: fonts.bold,
      fontSize:   Math.min(sizes.name, 21),
      color:      sidebar.sidebarTitleColor,
      marginBottom: 2,
    },
    sidebarJobTitle: {
      fontFamily: fonts.italic,
      fontSize:   sizes.body,
      color:      sidebar.sidebarTextColor,
      marginBottom: 4,
    },
    sidebarRule: {
      borderBottom: `0.75pt solid ${sidebar.sidebarRuleColor}`,
      marginBottom:  7,
      marginTop:     2,
    },
    sidebarContactLine: {
      fontFamily: fonts.base,
      fontSize:   Math.max(sizes.body - 1.5, 7.5),
      color:      sidebar.sidebarTextColor,
      marginBottom: 2,
    },
    sidebarContactGroup: {
      marginBottom: 14,
    },

    // ── Sections (main) ─────────────────────────────────────────────────────
    section: { marginBottom: 12 },
    sectionTitle: {
      fontFamily:    fonts.bold,
      fontSize:      sizes.heading,
      textTransform: 'uppercase',
      letterSpacing: 1.0,
      color:         accent,
      borderBottom:  `0.75pt solid ${accent}`,
      paddingBottom: 2,
      marginBottom:  5,
    },

    // ── Sections (sidebar) ──────────────────────────────────────────────────
    sidebarSection: { marginBottom: 10 },
    sidebarSectionTitle: {
      fontFamily:    fonts.bold,
      fontSize:      Math.max(sizes.heading - 0.5, 7.5),
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color:         sidebar.sidebarTitleColor,
      borderBottom:  `0.75pt solid ${sidebar.sidebarRuleColor}`,
      paddingBottom: 2,
      marginBottom:  4,
    },

    // ── Text ────────────────────────────────────────────────────────────────
    paragraph:  { marginBottom: 4, lineHeight: 1.5 },
    skillsText: { marginBottom: 3 },
  });

  const name        = parsedResume?.full_name             || '';
  const jobTitleStr = parsedResume?.most_recent_job_title || '';
  const contactLine = parsedResume?.contact_line          || '';
  const contactParts = contactLine
    ? contactLine.split(/\s*[|·•,]\s*/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  const typedSections = sections as unknown as Section[];
  const tailoredFiltered = cleanSections(typedSections, reviews, editValues);
  // If tailoring produced no renderable content (e.g. unusual template formats),
  // fall back to the original parsed resume data so the PDF is never blank.
  const filtered = tailoredFiltered.length > 0
    ? tailoredFiltered
    : buildFallbackSections(parsedResume);

  // ── Column partitioning ───────────────────────────────────────────────────

  let leftSections:  Section[] = [];
  let rightSections: Section[] = [];

  if (isMultiCol) {
    const leftTitles  = sc?.sectionColumns?.left  ?? [];

    leftSections  = filtered.filter(s =>  matchesColumnList(s.title, leftTitles));
    rightSections = filtered.filter(s => !matchesColumnList(s.title, leftTitles));

    // Fallback: if DNA gave us nothing useful in left, use type heuristic
    if (leftSections.length === 0 && rightSections.length > 2) {
      leftSections  = filtered.filter(s => RX_SKILLS.test(s.title) || RX_EDUCATION.test(s.title));
      rightSections = filtered.filter(s => !leftSections.includes(s));
    }

    // Ensure right column has at least experience/summary (if left ate them wrongly)
    const rightHasMain = rightSections.some(s => RX_EXP.test(s.title) || RX_SUMMARY.test(s.title));
    if (!rightHasMain) {
      const rescues = leftSections.filter(s => RX_EXP.test(s.title) || RX_SUMMARY.test(s.title));
      leftSections  = leftSections.filter(s => !rescues.includes(s));
      rightSections = [...rescues, ...rightSections];
    }
  }

  // Degrade to single-column if partitioning failed
  const useTwoCol = isMultiCol && leftSections.length > 0 && rightSections.length > 0;

  const sectionArgs = [bullet, accent, fonts, sizes, reviews, editValues] as const;
  const sidebarTextColor = sidebar.sidebarTextColor;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>

        {useTwoCol ? (
          // ── Two-column layout ─────────────────────────────────────────────
          <View style={styles.twoColWrapper}>

            {/* Left sidebar */}
            <View style={styles.leftCol}>
              {name        && <Text style={styles.sidebarName}>{name}</Text>}
              {jobTitleStr && <Text style={styles.sidebarJobTitle}>{jobTitleStr}</Text>}
              {(name || jobTitleStr) && <View style={styles.sidebarRule} />}
              {contactParts.length > 0 && (
                <View style={styles.sidebarContactGroup}>
                  {contactParts.map((p: string, i: number) => (
                    <Text key={i} style={styles.sidebarContactLine}>{p}</Text>
                  ))}
                </View>
              )}
              {leftSections.map(s => renderSection(s, styles, ...sectionArgs, true, sidebarTextColor))}
            </View>

            {/* Right main column */}
            <View style={styles.rightCol}>
              {rightSections.map(s => renderSection(s, styles, ...sectionArgs, false))}
            </View>

          </View>
        ) : (
          // ── Single-column layout ──────────────────────────────────────────
          <>
            {(name || contactLine) && (
              <View style={styles.header}>
                {name        && <Text style={styles.name}>{name}</Text>}
                {jobTitleStr && <Text style={styles.jobTitle}>{jobTitleStr}</Text>}
                {contactParts.length > 1
                  ? contactParts.map((p: string, i: number) => <Text key={i} style={styles.contactLine}>{p}</Text>)
                  : contactLine
                    ? <Text style={styles.contactLine}>{contactLine}</Text>
                    : null
                }
              </View>
            )}
            {filtered.map(s => renderSection(s, styles, ...sectionArgs))}
          </>
        )}

      </Page>
    </Document>
  );
}
