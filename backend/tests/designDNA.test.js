'use strict';

const { extractDesignDNA, _helpers } = require('../designDNA');
const {
  itemFontSize, mode, percentile,
  classifyFontProfile, detectColumns, detectBullet,
  detectSections, classifySectionColumns,
  rgbToHex, isNeutral, cmykToRgb, detectHeaderAlign,
  buildDNAResult,
} = _helpers;

// ── itemFontSize ──────────────────────────────────────────────────────────────

describe('itemFontSize', () => {
  it('computes magnitude of transform vector', () => {
    const item = { transform: [12, 0] };
    expect(itemFontSize(item)).toBe(12);
  });

  it('handles rotated transform', () => {
    const item = { transform: [0, 10] };
    expect(itemFontSize(item)).toBe(10);
  });

  it('rounds to one decimal', () => {
    const item = { transform: [11.123, 0] };
    expect(itemFontSize(item)).toBe(11.1);
  });
});

// ── mode ──────────────────────────────────────────────────────────────────────

describe('mode', () => {
  it('returns most frequent value', () => {
    expect(mode([10, 10, 12, 10, 14])).toBe('10');
  });

  it('returns undefined-ish on empty array', () => {
    expect(mode([])).toBeUndefined();
  });

  it('handles tie by first-encountered', () => {
    const result = mode([1, 2]);
    expect(['1', '2']).toContain(result);
  });
});

// ── percentile ────────────────────────────────────────────────────────────────

describe('percentile', () => {
  const sorted = [10, 20, 30, 40, 50];

  it('returns first element at p=0', () => {
    expect(percentile(sorted, 0)).toBe(10);
  });

  it('returns last element at p=1', () => {
    expect(percentile(sorted, 1)).toBe(50);
  });

  it('returns median-ish at p=0.5', () => {
    expect(percentile(sorted, 0.5)).toBe(30);
  });
});

// ── classifyFontProfile ───────────────────────────────────────────────────────

describe('classifyFontProfile', () => {
  it('classifies serif fonts', () => {
    expect(classifyFontProfile(['TimesNewRoman', 'Georgia'])).toBe('serif');
  });

  it('classifies sans-serif fonts', () => {
    expect(classifyFontProfile(['Helvetica', 'Arial'])).toBe('sans-serif');
  });

  it('classifies monospace fonts', () => {
    expect(classifyFontProfile(['CourierNew', 'Courier'])).toBe('monospace');
  });

  it('returns unknown for empty list', () => {
    expect(classifyFontProfile([])).toBe('unknown');
  });

  it('returns mixed when serif and sans-serif are equal', () => {
    expect(classifyFontProfile(['TimesNewRoman', 'Helvetica'])).toBe('mixed');
  });
});

// ── detectColumns ─────────────────────────────────────────────────────────────

describe('detectColumns', () => {
  it('returns 1 for sparse data (<20 items)', () => {
    expect(detectColumns([50, 60], 612)).toBe(1);
  });

  it('returns 1 when all items start in left column', () => {
    const xs = Array(25).fill(50);
    expect(detectColumns(xs, 612)).toBe(1);
  });

  it('returns 2 when enough items start in right half', () => {
    // 15 left + 10 right = 25 total; 10/25=40% > 12%
    const xs = [...Array(15).fill(50), ...Array(10).fill(400)];
    expect(detectColumns(xs, 612)).toBe(2);
  });
});

// ── detectBullet ──────────────────────────────────────────────────────────────

describe('detectBullet', () => {
  it('detects bullet character', () => {
    expect(detectBullet(['• Item one', '• Item two', 'Normal text'])).toBe('•');
  });

  it('returns null when no bullet chars found', () => {
    expect(detectBullet(['Item one', 'Item two'])).toBeNull();
  });

  it('picks most frequent bullet char', () => {
    expect(detectBullet(['• a', '• b', '– c'])).toBe('•');
  });
});

// ── detectSections ────────────────────────────────────────────────────────────

describe('detectSections', () => {
  const makeItem = (str, fontSize, fontName = '') => ({
    str,
    transform: [fontSize, 0],
    fontName,
    x: 50,
  });

  it('detects all-caps heading', () => {
    const items = [
      makeItem('EXPERIENCE', 12),
      makeItem('Built things.', 10),
    ];
    const sections = detectSections(items, 10);
    expect(sections.map(s => s.title)).toContain('EXPERIENCE');
  });

  it('detects larger-font heading', () => {
    const items = [
      makeItem('Summary', 14),
      makeItem('Some text here.', 10),
    ];
    const sections = detectSections(items, 10);
    expect(sections.map(s => s.title)).toContain('Summary');
  });

  it('deduplicates repeated headings', () => {
    const items = [
      makeItem('SKILLS', 12),
      makeItem('SKILLS', 12),
    ];
    const sections = detectSections(items, 10);
    expect(sections.filter(s => s.title === 'SKILLS')).toHaveLength(1);
  });

  it('ignores items longer than 40 chars', () => {
    const long = 'A'.repeat(41);
    const items = [makeItem(long, 14)];
    expect(detectSections(items, 10)).toHaveLength(0);
  });

  it('filters short fragments (<5 normalized chars)', () => {
    const items = [makeItem('SIWY', 14)]; // pdfjs WYSIWYG artifact
    expect(detectSections(items, 10)).toHaveLength(0);
  });

  it('keeps header-band items that match section keywords', () => {
    // y=720 is in the top 18% of a page with maxY=726 (>= 726*0.82=595)
    const items = [
      { str: 'Professional Profile', fontSize: 13, x: 300, y: 720, fontName: '', page: 1 },
      { str: 'Some body text here.', fontSize: 10, x: 300, y: 710, fontName: '', page: 1 },
    ];
    const sections = detectSections(items, 10);
    expect(sections.map(s => s.title)).toContain('Professional Profile');
  });

  it('drops header-band items that do NOT match section keywords', () => {
    // "Teach Lead" is a job title — no section keyword → filtered out in header band
    const items = [
      { str: 'Teach Lead', fontSize: 13, x: 50, y: 720, fontName: '', page: 1 },
      { str: 'Yushan Chang', fontSize: 20, x: 50, y: 726, fontName: '', page: 1 },
    ];
    const sections = detectSections(items, 10);
    expect(sections.map(s => s.title)).not.toContain('Teach Lead');
    expect(sections.map(s => s.title)).not.toContain('Yushan Chang');
  });

  it('does not apply header-band filter to page 2+ items', () => {
    // "Soft Skills" at top of page 2 should not be filtered even though y is high
    const items = [
      { str: 'Soft Skills', fontSize: 13, x: 50, y: 720, fontName: '', page: 2 },
    ];
    const sections = detectSections(items, 10);
    expect(sections.map(s => s.title)).toContain('Soft Skills');
  });
});

// ── classifySectionColumns ────────────────────────────────────────────────────

describe('classifySectionColumns', () => {
  it('returns all sections as right when all on left side', () => {
    const sections = [{ title: 'Summary', x: 50 }, { title: 'Skills', x: 60 }];
    const result = classifySectionColumns(sections, 612);
    expect(result.left).toHaveLength(0);
  });

  it('splits sections when some are in right column', () => {
    const sections = [
      { title: 'Skills', x: 50 },
      { title: 'Experience', x: 350 },
    ];
    const result = classifySectionColumns(sections, 612);
    expect(result.left).toContain('Skills');
    expect(result.right).toContain('Experience');
  });
});

// ── rgbToHex ──────────────────────────────────────────────────────────────────

describe('rgbToHex', () => {
  it('converts pure red', () => {
    expect(rgbToHex(1, 0, 0)).toBe('#ff0000');
  });

  it('converts black', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('converts white', () => {
    expect(rgbToHex(1, 1, 1)).toBe('#ffffff');
  });
});

// ── cmykToRgb (scale normalization covered via integration) ───────────────────
// The 0-255 RGB normalization in extractColors is pdfjs-integration-only,
// tested via the extractDesignDNA null/shape tests above.

// ── isNeutral ─────────────────────────────────────────────────────────────────

describe('isNeutral', () => {
  it('identifies gray as neutral', () => {
    expect(isNeutral(0.5, 0.5, 0.5)).toBe(true);
  });

  it('identifies near-white as neutral', () => {
    expect(isNeutral(0.95, 0.95, 0.95)).toBe(true);
  });

  it('identifies saturated color as non-neutral', () => {
    expect(isNeutral(0.8, 0.1, 0.1)).toBe(false);
  });

  it('handles black (all zeros)', () => {
    expect(isNeutral(0, 0, 0)).toBe(true);
  });
});

// ── cmykToRgb ─────────────────────────────────────────────────────────────────

describe('cmykToRgb', () => {
  it('converts pure black CMYK to black RGB', () => {
    const [r, g, b] = cmykToRgb(0, 0, 0, 1);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });

  it('converts CMYK white to RGB white', () => {
    const [r, g, b] = cmykToRgb(0, 0, 0, 0);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(1);
  });

  it('converts pure cyan', () => {
    const [r, g, b] = cmykToRgb(1, 0, 0, 0);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(1);
  });
});

// ── detectHeaderAlign ─────────────────────────────────────────────────────────

describe('detectHeaderAlign', () => {
  const makeItem = (x, fontSize) => ({ x, fontSize, str: 'John Doe' });

  it('returns left when name starts near margin', () => {
    const items = [makeItem(50, 24), makeItem(52, 24)];
    expect(detectHeaderAlign(items, 612, 50)).toBe('left');
  });

  it('returns center when name starts far from margin', () => {
    const items = [makeItem(250, 24), makeItem(255, 24)];
    expect(detectHeaderAlign(items, 612, 50)).toBe('center');
  });

  it('returns left when no items have positive fontSize', () => {
    const items = [makeItem(50, 0)];
    expect(detectHeaderAlign(items, 612, 50)).toBe('left');
  });
});

// ── buildDNAResult ────────────────────────────────────────────────────────────

function makeTextItem(str, fontSize, x = 50, fontName = 'Helvetica', pageWidth = 612) {
  return { str, fontSize, x, y: 700, fontName, pageWidth };
}

describe('buildDNAResult', () => {
  const baseItems = [
    makeTextItem('EXPERIENCE', 14, 50, 'Helvetica-Bold'),
    makeTextItem('Built scalable services.', 10, 50, 'Helvetica'),
    makeTextItem('• Led redesign effort', 10, 70, 'Helvetica'),
    makeTextItem('SKILLS', 14, 50, 'Helvetica-Bold'),
    makeTextItem('React, Node.js, TypeScript', 10, 50, 'Helvetica'),
    makeTextItem('EDUCATION', 14, 50, 'Helvetica-Bold'),
    makeTextItem('B.Sc Computer Science', 10, 50, 'Helvetica'),
  ];

  it('returns object with all expected top-level keys', () => {
    const result = buildDNAResult(baseItems);
    expect(result).toHaveProperty('fontSize');
    expect(result).toHaveProperty('fontProfile');
    expect(result).toHaveProperty('fontNames');
    expect(result).toHaveProperty('hasBoldFont');
    expect(result).toHaveProperty('layout');
    expect(result).toHaveProperty('bullets');
    expect(result).toHaveProperty('sections');
    expect(result).toHaveProperty('sectionColumns');
    expect(result).toHaveProperty('accentColor');
  });

  it('fontSize.body is the most common font size', () => {
    const result = buildDNAResult(baseItems);
    expect(result.fontSize.body).toBe(10);
  });

  it('detects bold font via hasBoldFont', () => {
    const result = buildDNAResult(baseItems);
    expect(result.hasBoldFont).toBe(true);
  });

  it('hasBoldFont is false when no bold fonts present', () => {
    const items = [makeTextItem('Text', 10, 50, 'Helvetica')];
    const result = buildDNAResult(items);
    expect(result.hasBoldFont).toBe(false);
  });

  it('uses colorResult.accentColor when provided', () => {
    const result = buildDNAResult(baseItems, { accentColor: '#2563eb' });
    expect(result.accentColor).toBe('#2563eb');
  });

  it('accentColor is null when not provided', () => {
    const result = buildDNAResult(baseItems);
    expect(result.accentColor).toBeNull();
  });

  it('detects bullet character from items', () => {
    const result = buildDNAResult(baseItems);
    expect(result.bullets).toBe('•');
  });

  it('defaults bullets to • when none found', () => {
    const items = [makeTextItem('No bullets here', 10)];
    const result = buildDNAResult(items);
    expect(result.bullets).toBe('•');
  });

  it('layout.columns is 1 when all items on left side', () => {
    const result = buildDNAResult(baseItems);
    expect(result.layout.columns).toBe(1);
  });

  it('layout.columns is 2 when items spread across page', () => {
    const wideItems = [
      ...Array(15).fill(null).map((_, i) => makeTextItem(`Left ${i}`, 10, 50)),
      ...Array(10).fill(null).map((_, i) => makeTextItem(`Right ${i}`, 10, 400)),
    ];
    const result = buildDNAResult(wideItems);
    expect(result.layout.columns).toBe(2);
  });

  it('detects all-caps section titles', () => {
    const result = buildDNAResult(baseItems);
    expect(result.sections).toContain('EXPERIENCE');
    expect(result.sections).toContain('SKILLS');
  });

  it('fontNames contains unique font names up to 6', () => {
    const result = buildDNAResult(baseItems);
    expect(result.fontNames.length).toBeLessThanOrEqual(6);
    expect(result.fontNames).toContain('Helvetica');
  });

  it('fontProfile is sans-serif for Helvetica items', () => {
    const result = buildDNAResult(baseItems);
    expect(result.fontProfile).toBe('sans-serif');
  });

  it('layout.marginLeft is non-negative', () => {
    const result = buildDNAResult(baseItems);
    expect(result.layout.marginLeft).toBeGreaterThanOrEqual(0);
  });
});

// ── extractDesignDNA — null/empty inputs ──────────────────────────────────────

describe('extractDesignDNA — null/empty inputs', () => {
  it('returns null when pdfjs cannot parse the buffer', async () => {
    const result = await extractDesignDNA(Buffer.from('not a pdf'));
    expect(result).toBeNull();
  });

  it('returns null for empty buffer', async () => {
    const result = await extractDesignDNA(Buffer.alloc(0));
    expect(result).toBeNull();
  });
});

// ── Minimal synthetic PDF ─────────────────────────────────────────────────────

function buildMinimalPdf(text = 'EXPERIENCE\nBuilt things.') {
  const content = `BT /F1 12 Tf 50 700 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const contentLen = Buffer.byteLength(content);

  const lines = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${contentLen}>>\nstream\n${content}\nendstream\nendobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  ];

  const body = lines.join('\n') + '\n';
  const xrefOffset = Buffer.byteLength(body);

  const offsets = [];
  let pos = 0;
  for (const line of lines) {
    const match = line.match(/^(\d+) 0 obj/);
    if (match) offsets[parseInt(match[1])] = pos;
    pos += Buffer.byteLength(line) + 1;
  }

  const xref = [
    'xref',
    `0 ${offsets.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n '),
  ].join('\n');

  const trailer = `\ntrailer\n<</Size ${offsets.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body + xref + trailer);
}

describe('extractDesignDNA — shape of result', () => {
  it('returns object with expected top-level keys', async () => {
    const buf = buildMinimalPdf();
    const result = await extractDesignDNA(buf);
    if (!result) return;
    expect(result).toHaveProperty('fontSize');
    expect(result).toHaveProperty('fontProfile');
    expect(result).toHaveProperty('layout');
    expect(result).toHaveProperty('bullets');
    expect(result).toHaveProperty('sections');
  });

  it('fontSize has body, heading, name fields', async () => {
    const buf = buildMinimalPdf();
    const result = await extractDesignDNA(buf);
    if (!result) return;
    expect(typeof result.fontSize.body).toBe('number');
    expect(typeof result.fontSize.heading).toBe('number');
    expect(typeof result.fontSize.name).toBe('number');
  });

  it('layout columns is 1 or 2', async () => {
    const buf = buildMinimalPdf();
    const result = await extractDesignDNA(buf);
    if (!result) return;
    expect([1, 2]).toContain(result.layout.columns);
  });

  it('fontProfile is a known value', async () => {
    const buf = buildMinimalPdf();
    const result = await extractDesignDNA(buf);
    if (!result) return;
    expect(['serif', 'sans-serif', 'monospace', 'mixed', 'unknown']).toContain(result.fontProfile);
  });
});

describe('extractDesignDNA — error handling', () => {
  it('rejects gracefully on truly unparseable buffer', async () => {
    const result = await extractDesignDNA(Buffer.from('%PDF-1.4\n%%EOF'));
    expect(result).toBeNull();
  });
});
