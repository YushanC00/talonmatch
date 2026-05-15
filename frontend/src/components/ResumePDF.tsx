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

// ── Design resolution ─────────────────────────────────────────────────────────

function resolveFonts(sc: StyleConfig | null | undefined) {
  const p = sc?.fontProfile ?? 'sans-serif';
  return {
    base:   p === 'serif' ? 'Times-Roman'    : p === 'monospace' ? 'Courier'        : 'Helvetica',
    bold:   p === 'serif' ? 'Times-Bold'     : p === 'monospace' ? 'Courier-Bold'   : 'Helvetica-Bold',
    italic: p === 'serif' ? 'Times-Italic'   : p === 'monospace' ? 'Courier-Oblique': 'Helvetica-Oblique',
  };
}

function resolveSizes(sc: StyleConfig | null | undefined) {
  return {
    name:    Math.min(Math.max(sc?.fontSize?.name    ?? 18, 14), 26),
    heading: Math.min(Math.max(sc?.fontSize?.heading ?? 10, 8),  13),
    body:    Math.min(Math.max(sc?.fontSize?.body    ?? 10, 8),  12),
  };
}

function resolveMargins(sc: StyleConfig | null | undefined) {
  const raw  = sc?.layout?.marginLeft ?? 57;
  const side = Math.min(Math.max(Math.round(raw * 0.75), 28), 72);
  return { top: 44, bottom: 44, left: side, right: side };
}

// ── Section renderer (shared for single + multi-column) ───────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSection(
  section: Section,
  styles: any,
  bullet: string,
  accent: string,
  fonts: { bold: string; italic: string },
  sizes: { body: number },
  reviews: Record<string, string>,
  editValues: Record<string, string>,
) {
  const isSkills  = /^skills/i.test(section.title);
  const isExp     = /^work experience/i.test(section.title);
  const isSummary = /^summary|professional profile/i.test(section.title);

  return (
    <View key={section.title} style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{section.title}</Text>

      {isSummary && (section.content as ContentItem[]).map((item, i) => (
        <Text key={i} style={styles.paragraph}>
          {effectiveText(item, section.title, reviews, editValues)}
        </Text>
      ))}

      {isSkills && (section.content as ContentItem[]).map((item, i) => (
        <Text key={i} style={styles.skillsText}>
          {item.label ? `${item.label}: ` : ''}{effectiveText(item, section.title, reviews, editValues)}
        </Text>
      ))}

      {isExp && groupExpItems(section.content as ContentItem[]).map((g, gi) => (
        <View key={gi} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body }}>{g.role || g.roleCompany}</Text>
            {g.period ? <Text style={{ fontFamily: fonts.italic, fontSize: sizes.body - 1, color: '#888888' }}>{g.period}</Text> : null}
          </View>
          {g.company ? <Text style={{ fontSize: sizes.body - 1, color: '#666666', marginBottom: 2 }}>{g.company}</Text> : null}
          {g.items.map((item, bi) => (
            <View key={bi} style={{ flexDirection: 'row', marginBottom: 3 }}>
              <Text style={{ width: 12, flexShrink: 0 }}>{bullet}</Text>
              <Text style={{ flex: 1 }}>
                {effectiveText(item, section.title, reviews, editValues)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {!isSummary && !isSkills && !isExp && (section.content as ContentItem[]).map((item, i) => {
        const text = effectiveText(item, section.title, reviews, editValues);
        return item.label
          ? (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: sizes.body, marginBottom: 2, color: accent }}>{item.label}</Text>
              <Text style={styles.paragraph}>{text}</Text>
            </View>
          ) : (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
              <Text style={{ width: 12, flexShrink: 0 }}>{bullet}</Text>
              <Text style={{ flex: 1 }}>{text}</Text>
            </View>
          );
      })}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResumePDF({ sections, parsedResume, reviews, editValues }: ResumePDFProps) {
  const sc      = parsedResume?.style_config;
  console.log('[ResumePDF] sc:', JSON.stringify(sc));
  const fonts   = resolveFonts(sc);
  const sizes   = resolveSizes(sc);
  const margins = resolveMargins(sc);
  const bullet       = sc?.bullets ?? '•';
  const accent       = sc?.accentColor ?? '#333333';
  const headerAlign  = sc?.layout?.headerAlign ?? 'left';
  const headerCenter = headerAlign === 'center';
  const isTwoCols = sc?.layout?.columns === 2 && (sc?.sectionColumns?.left?.length ?? 0) > 0;

  const coloring = StyleSheet.create({
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
    header:      { marginBottom: 14, borderBottom: `1pt solid ${accent}`, paddingBottom: 8, alignItems: headerCenter ? 'center' : 'flex-start' },
    name:        { fontFamily: fonts.bold, fontSize: sizes.name, color: accent, marginBottom: 2, textAlign: headerCenter ? 'center' : 'left' },
    jobTitle:    { fontFamily: fonts.italic, fontSize: sizes.body + 1, color: '#555555', marginBottom: 3, textAlign: headerCenter ? 'center' : 'left' },
    contactLine: { fontFamily: fonts.base, fontSize: sizes.body - 1, color: '#666666', textAlign: headerCenter ? 'center' : 'left' },
    section:     { marginBottom: 12 },
    sectionTitle: {
      fontFamily: fonts.bold, fontSize: sizes.heading,
      textTransform: 'uppercase', letterSpacing: 1.0,
      color: accent, borderBottom: `0.75pt solid ${accent}`,
      paddingBottom: 2, marginBottom: 5,
    },
    paragraph:   { marginBottom: 4 },
    skillsText:  { marginBottom: 3 },
    // 2-col sidebar (left ~32%, right ~68%)
    body:        { flexDirection: 'row', flex: 1 },
    leftCol:     { width: '32%', paddingRight: 12, borderRight: `0.5pt solid #dddddd` },
    rightCol:    { flex: 1, paddingLeft: 12 },
  });

  const name        = parsedResume?.full_name    || '';
  const jobTitleStr = parsedResume?.most_recent_job_title || '';
  const contactLine = parsedResume?.contact_line || '';
  const contactParts = contactLine
    ? contactLine.split(/\s*[|·•]\s*/).map(s => s.trim()).filter(Boolean)
    : [];

  const typedSections = sections as unknown as Section[];

  const sectionArgs = [bullet, accent, fonts, sizes, reviews, editValues] as const;

  // For 2-col: split sections into left/right based on sectionColumns
  const leftTitles = new Set((sc?.sectionColumns?.left ?? []).map(t => t.toLowerCase()));

  function inLeft(title: string) {
    if (leftTitles.size === 0) return false;
    // Fuzzy match: check if any left title contains this section title or vice-versa
    const t = title.toLowerCase();
    for (const l of leftTitles) { if (l.includes(t) || t.includes(l)) return true; }
    return false;
  }

  const leftSections  = typedSections.filter(s => inLeft(s.title));
  const rightSections = typedSections.filter(s => !inLeft(s.title));

  return (
    <Document>
      <Page size="LETTER" style={coloring.page}>

        {/* Header: name + title + contact */}
        {(name || contactLine) && (
          <View style={coloring.header}>
            {name        && <Text style={coloring.name}>{name}</Text>}
            {jobTitleStr && <Text style={coloring.jobTitle}>{jobTitleStr}</Text>}
            {contactParts.length > 1
              ? contactParts.map((part, i) => (
                  <Text key={i} style={coloring.contactLine}>{part}</Text>
                ))
              : contactLine
                ? <Text style={coloring.contactLine}>{contactLine}</Text>
                : null
            }
          </View>
        )}

        {isTwoCols ? (
          /* Two-column layout */
          <View style={coloring.body}>
            <View style={coloring.leftCol}>
              {leftSections.map(s => renderSection(s, coloring, ...sectionArgs))}
            </View>
            <View style={coloring.rightCol}>
              {rightSections.map(s => renderSection(s, coloring, ...sectionArgs))}
            </View>
          </View>
        ) : (
          /* Single-column layout */
          typedSections.map(s => renderSection(s, coloring, ...sectionArgs))
        )}

      </Page>
    </Document>
  );
}
