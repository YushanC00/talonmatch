'use strict';

const path = require('path');
// Require at module level so worker flag is set before any document is opened
const pdfjs = require(path.join(__dirname, 'node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js'));
pdfjs.disableWorker = true;

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemFontSize(item) {
  const [a, b] = item.transform;
  return Math.round(Math.sqrt(a * a + b * b) * 10) / 10;
}

function mode(values) {
  const freq = {};
  for (const v of values) freq[v] = (freq[v] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const SERIF_HINTS    = /times|georgia|garamond|palatino|cambria|charter|serif/i;
const SANS_HINTS     = /helvetica|arial|calibri|inter|roboto|lato|open.?sans|gill|futura|gothic|sans/i;
const MONO_HINTS     = /courier|mono|consol|code/i;
const BOLD_HINTS     = /bold|black|heavy/i;

function classifyFontProfile(fontNames) {
  let serif = 0, sans = 0, mono = 0;
  for (const name of fontNames) {
    if (MONO_HINTS.test(name)) mono++;
    else if (SERIF_HINTS.test(name)) serif++;
    else if (SANS_HINTS.test(name)) sans++;
  }
  const total = serif + sans + mono;
  if (total === 0) return 'unknown';
  if (mono / total > 0.3) return 'monospace';
  if (serif > sans) return 'serif';
  if (sans > serif) return 'sans-serif';
  return 'mixed';
}

function detectColumns(xValues, pageWidth) {
  if (xValues.length < 20) return 1;
  // Count items starting in the right 40-90% of page (clear right-column territory)
  const rightColItems = xValues.filter(x => x > pageWidth * 0.40 && x < pageWidth * 0.90).length;
  // If >12% of items start in right half, strong signal for 2-col layout
  if (rightColItems / xValues.length > 0.12) return 2;
  return 1;
}

const BULLET_CHARS = ['•', '·', '–', '—', '-', '○', '◦', '▸', '▪', '‣'];

function detectBullet(texts) {
  const counts = {};
  for (const t of texts) {
    const c = t.trim()[0];
    if (c && BULLET_CHARS.includes(c)) counts[c] = (counts[c] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

// Section headings with their x positions
function detectSections(items, bodySize) {
  const seen = new Set();
  const sections = [];
  for (const item of items) {
    const txt = item.str.trim();
    if (!txt || txt.length > 40) continue;
    const isHeadingSize = (item.fontSize ?? itemFontSize(item)) >= bodySize + 0.5;
    const isAllCaps = txt === txt.toUpperCase() && /[A-Z]/.test(txt);
    const isBoldFont  = BOLD_HINTS.test(item.fontName || '');
    if (isHeadingSize || isAllCaps || (isBoldFont && txt.length >= 3)) {
      const normalized = txt.replace(/[^a-z\s]/gi, '').trim();
      if (normalized.length > 1 && !seen.has(normalized.toLowerCase())) {
        seen.add(normalized.toLowerCase());
        sections.push({ title: txt, x: item.x });
      }
    }
  }
  return sections.slice(0, 12);
}

function classifySectionColumns(sections, pageWidth) {
  const midX = pageWidth / 2;
  const left = [], right = [];
  for (const s of sections) {
    if (s.x < midX * 0.6) left.push(s.title);
    else right.push(s.title);
  }
  // If everything is on one side, no real column split
  if (left.length === 0 || right.length === 0) {
    return { left: [], right: sections.map(s => s.title) };
  }
  return { left, right };
}

// ── Color extraction ─────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => {
    const byte = Math.round(v * 255);
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function isNeutral(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max > 0 ? (max - min) / max : 0;
  return saturation < 0.12 || (r > 0.85 && g > 0.85 && b > 0.85); // gray or near-white
}

function cmykToRgb(c, m, y, k) {
  const r = (1 - c) * (1 - k);
  const g = (1 - m) * (1 - k);
  const b = (1 - y) * (1 - k);
  return [r, g, b];
}

async function extractColors(page) {
  const OPS = pdfjs.OPS;
  let opList;
  try {
    opList = await page.getOperatorList();
  } catch {
    return { accentColor: null };
  }

  const colorFreq = {};
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    let r, g, b;
    if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
      const args = opList.argsArray[i];
      if (!args || args.length < 3) continue;
      [r, g, b] = args;
    } else if (fn === OPS.setFillCMYKColor || fn === OPS.setStrokeCMYKColor) {
      const args = opList.argsArray[i];
      if (!args || args.length < 4) continue;
      [r, g, b] = cmykToRgb(args[0], args[1], args[2], args[3]);
    } else {
      continue;
    }
    if (isNeutral(r, g, b)) continue;
    const hex = rgbToHex(r, g, b);
    colorFreq[hex] = (colorFreq[hex] || 0) + 1;
  }

  const sorted = Object.entries(colorFreq).sort((a, b) => b[1] - a[1]);
  const accentColor = sorted[0]?.[0] ?? null;
  return { accentColor };
}

function detectHeaderAlign(items, pageWidth, marginLeft) {
  const maxSize = Math.max(...items.map(i => i.fontSize).filter(s => s > 0));
  const nameItems = items.filter(i => i.fontSize >= maxSize - 1 && i.str.trim().length > 0);
  if (nameItems.length === 0) return 'left';
  const avgX = nameItems.reduce((sum, i) => sum + i.x, 0) / nameItems.length;
  // Centered: name start x is much larger than margin (text is indented toward center)
  return avgX > marginLeft * 2.5 ? 'center' : 'left';
}

// ── Main extraction ───────────────────────────────────────────────────────────

async function extractDesignDNA(pdfBuffer) {
  let doc;
  try {
    const task = pdfjs.getDocument(pdfBuffer);
    doc = await (task.promise ?? task);
  } catch {
    return null;
  }

  const allItems = [];
  const pageCount = doc.numPages;
  let colorResult = { accentColor: null };

  for (let p = 1; p <= Math.min(pageCount, 3); p++) {
    const page = await doc.getPage(p);
    const [content, vp] = await Promise.all([
      page.getTextContent({ normalizeWhitespace: false }),
      Promise.resolve(page.getViewport({ scale: 1 })),
    ]);
    // Extract colors from first page (accent color is usually on page 1)
    if (p === 1) {
      colorResult = await extractColors(page).catch(() => ({ accentColor: null }));
    }
    for (const item of content.items) {
      allItems.push({
        str:      item.str,
        fontSize: itemFontSize(item),
        x:        item.transform[4],
        y:        item.transform[5],
        fontName: item.fontName || '',
        pageWidth: vp.width,
      });
    }
  }

  if (allItems.length === 0) return null;
  return buildDNAResult(allItems, colorResult);
}

function buildDNAResult(allItems, colorResult = { accentColor: null }) {
  // Font sizes
  const sizes = allItems.map(i => i.fontSize).filter(s => s > 0).sort((a, b) => a - b);
  const bodySize    = parseFloat(mode(sizes.map(s => Math.round(s))) ?? 10);
  const headingSize = Math.round(percentile(sizes, 0.88) * 10) / 10;
  const nameSize    = Math.round(percentile(sizes, 0.97) * 10) / 10;

  // Font profile
  const fontNames = [...new Set(allItems.map(i => i.fontName).filter(Boolean))];
  const fontProfile = classifyFontProfile(fontNames);

  // Layout
  const pageWidth = allItems[0].pageWidth || 612;
  const xValues   = allItems.map(i => i.x).filter(x => x > 0);
  const marginLeft  = Math.round(percentile([...xValues].sort((a, b) => a - b), 0.05));
  const columns     = detectColumns(xValues, pageWidth);
  const headerAlign = detectHeaderAlign(allItems, pageWidth, Math.max(marginLeft, 20));

  // Bullets
  const bullets = detectBullet(allItems.map(i => i.str));

  // Sections with column classification
  const detectedSections = detectSections(allItems, bodySize);
  const sectionColumns   = classifySectionColumns(detectedSections, pageWidth);
  const hasBoldFont      = fontNames.some(n => BOLD_HINTS.test(n));

  return {
    fontSize:       { body: bodySize, heading: headingSize, name: nameSize },
    fontProfile,
    fontNames:      fontNames.slice(0, 6),
    hasBoldFont,
    layout:         { columns, marginLeft: Math.max(0, marginLeft), pageWidth, headerAlign },
    bullets:        bullets ?? '•',
    sections:       detectedSections.map(s => s.title),
    sectionColumns,
    accentColor:    colorResult.accentColor,
  };
}

module.exports = {
  extractDesignDNA,
  // exported for unit testing only
  _helpers: {
    itemFontSize, mode, percentile,
    classifyFontProfile, detectColumns, detectBullet,
    detectSections, classifySectionColumns,
    rgbToHex, isNeutral, cmykToRgb, detectHeaderAlign,
    buildDNAResult,
  },
};
