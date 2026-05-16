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

// Remove sections with no meaningful content and dedup same-type sections
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
    // Keep first occurrence of skills sections; allow duplicates for others
    if (type === 'skills' || type === 'summary') {
      if (seenTypes.has(type)) return false;
    }
    seenTypes.add(type);
    return true;
  });
}

// Ï = Ï — pdfjs encodes ● as U+00CF when font uses a custom glyph map.
// NFC normalization handles composed vs decomposed variants of the same char.
const LEADING_BULLET = /^[Ï•●▪▫▸‣›◦○■⁃·–—»]\s*/;
function cleanBullet(text: string): string {
  return text.normalize('NFC').replace(LEADING_BULLET, '').trim();
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

// ── Section renderer ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Styles = any;

function BulletRow({ item, section, bullet, accent, bodySize, reviews, editValues }: {
  item: ContentItem; section: string; bullet: string; accent: string;
  bodySize: number;
  reviews: Record<string, string>; editValues: Record<string, string>
}) {
  const text = cleanBullet(effectiveText(item, section, reviews, editValues));
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', marginBottom: 3 }}>
      <Text style={{ width: 12, flexShrink: 0, color: accent, fontSize: bodySize }}>{bullet}</Text>
      <Text style={{ flex: 1, fontSize: bodySize }}>{text}</Text>
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
) {
  const items = section.content as ContentItem[];
  const type  = sectionType(section.title);
  const bulletProps = { section: section.title, bullet, accent, bodySize: sizes.body, reviews, editValues };

  return (
    <View key={section.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>

      {type === 'summary' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        return text ? <Text key={i} style={styles.paragraph}>{text}</Text> : null;
      })}

      {type === 'skills' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return (
          <Text key={i} style={styles.skillsText}>
            {item.label
              ? <Text><Text style={{ fontFamily: fonts.bold }}>{item.label}: </Text>{text}</Text>
              : cleanBullet(text)
            }
          </Text>
        );
      })}

      {type === 'experience' && groupExpItems(items).map((g, gi) => (
        <View key={gi} style={{ marginBottom: 10 }} wrap={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body, flex: 1 }}>{g.role || g.roleCompany}</Text>
            {g.period ? <Text style={{ fontFamily: fonts.italic, fontSize: sizes.body - 1, color: '#888888' }}>{g.period}</Text> : null}
          </View>
          {g.company ? <Text style={{ fontSize: sizes.body - 1, color: accent, marginBottom: 3 }}>{g.company}</Text> : null}
          {g.items.map((item, bi) => <BulletRow key={bi} item={item} {...bulletProps} />)}
        </View>
      ))}

      {type === 'education' && (() => {
        const groups = groupExpItems(items);
        if (groups.length > 0) return groups.map((g, gi) => (
          <View key={gi} style={{ marginBottom: 8 }} wrap={false}>
            {(g.role || g.roleCompany) && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body, flex: 1 }}>{g.role || g.roleCompany}</Text>
                {g.period ? <Text style={{ fontFamily: fonts.italic, fontSize: sizes.body - 1, color: '#888888' }}>{g.period}</Text> : null}
              </View>
            )}
            {g.company ? <Text style={{ fontSize: sizes.body - 1, color: '#666666', marginBottom: 2 }}>{g.company}</Text> : null}
            {g.items.map((item, bi) => <BulletRow key={bi} item={item} {...bulletProps} />)}
          </View>
        ));
        return items.map((item, i) => {
          const text = effectiveText(item, section.title, reviews, editValues);
          return text ? <Text key={i} style={styles.paragraph}>{text}</Text> : null;
        });
      })()}

      {type === 'projects' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return item.label ? (
          <View key={i} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body, color: accent, marginBottom: 2 }}>{item.label}</Text>
            <Text style={styles.paragraph}>{text}</Text>
          </View>
        ) : <BulletRow key={i} item={item} {...bulletProps} />;
      })}

      {type === 'generic' && items.map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        if (!text) return null;
        return item.label ? (
          <View key={i} style={{ marginBottom: 6 }} wrap={false}>
            <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body, marginBottom: 2 }}>{item.label}</Text>
            <Text style={styles.paragraph}>{cleanBullet(text)}</Text>
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
  const accent      = sc?.accentColor ?? '#333333';
  const headerAlign = sc?.layout?.headerAlign ?? 'left';

  const styles = StyleSheet.create({
    page: {
      fontFamily: fonts.base,
      fontSize:   sizes.body,
      color:      '#1a1a1a',
      paddingTop:    margins.top,
      paddingBottom: margins.bottom,
      paddingLeft:   margins.left,
      paddingRight:  margins.right,
      lineHeight: 1.45,
    },
    header: {
      marginBottom: 14,
      borderBottom: `1pt solid ${accent}`,
      paddingBottom: 8,
      alignItems: headerAlign === 'center' ? 'center' : 'flex-start',
    },
    name:        { fontFamily: fonts.bold, fontSize: sizes.name, color: accent, marginBottom: 2 },
    jobTitle:    { fontFamily: fonts.italic, fontSize: sizes.body + 1, color: '#555555', marginBottom: 3 },
    contactLine: { fontFamily: fonts.base, fontSize: sizes.body - 1, color: '#666666' },
    section:     { marginBottom: 12 },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: sizes.heading,
      textTransform: 'uppercase',
      letterSpacing: 1.0,
      color: accent,
      borderBottom: `0.75pt solid ${accent}`,
      paddingBottom: 2,
      marginBottom: 5,
    },
    paragraph:  { marginBottom: 4, lineHeight: 1.5 },
    skillsText: { marginBottom: 3 },
  });

  const name        = parsedResume?.full_name             || '';
  const jobTitleStr = parsedResume?.most_recent_job_title || '';
  const contactLine = parsedResume?.contact_line          || '';
  const contactParts = contactLine
    ? contactLine.split(/\s*[|·•]\s*/).map(s => s.trim()).filter(Boolean)
    : [];

  const typedSections = sections as unknown as Section[];
  const sectionArgs   = [bullet, accent, fonts, sizes, reviews, editValues] as const;

  // Remove empty sections + dedup same-type sections
  const filtered = cleanSections(typedSections, reviews, editValues);

  // react-pdf cannot handle multi-page flex rows — full-width layout for all resumes.
  // Design DNA styles (colors, fonts, sizes, accent) are preserved regardless.
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {(name || contactLine) && (
          <View style={styles.header}>
            {name        && <Text style={styles.name}>{name}</Text>}
            {jobTitleStr && <Text style={styles.jobTitle}>{jobTitleStr}</Text>}
            {contactParts.length > 1
              ? contactParts.map((p, i) => <Text key={i} style={styles.contactLine}>{p}</Text>)
              : contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null
            }
          </View>
        )}
        {filtered.map(s => renderSection(s, styles, ...sectionArgs))}
      </Page>
    </Document>
  );
}
