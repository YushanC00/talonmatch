import jsPDF from 'jspdf';

interface TailoredBullet {
  tailored_text?: string;
  original_text?: string;
}

interface TailoredRole {
  title: string;
  company?: string;
  period?: string;
  bullets?: TailoredBullet[];
}

interface TailoredData {
  summary?: { tailored_text?: string };
  experience?: TailoredRole[];
}

/**
 * Generate a tailored-resume PDF from the data returned by /api/tailor-resume.
 *
 * @param params
 * @param params.tailoredData  - full response from tailorResume API
 * @param params.jobTitle      - job title string
 * @param params.company       - company name string
 * @returns jsPDF doc — call .save(filename) or .output('blob') on the result
 */
export function buildResumePdf({ tailoredData, jobTitle, company }: { tailoredData: TailoredData; jobTitle: string; company: string }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const MARGIN = 50;
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  function addPage() {
    doc.addPage();
    y = MARGIN;
  }

  function checkOverflow(neededHeight = 20) {
    if (y + neededHeight > doc.internal.pageSize.getHeight() - MARGIN) {
      addPage();
    }
  }

  function text(str: string, x: number, opts: Record<string, unknown> = {}) {
    doc.text(str, x, y, { maxWidth: CONTENT_WIDTH, ...opts });
  }

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  text('Tailored Resume', MARGIN);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100);
  text(`Tailored for: ${jobTitle} at ${company}`, MARGIN);
  y += 18;
  doc.setTextColor(0);

  // ── Summary ──────────────────────────────────────────────────────────────
  if (tailoredData?.summary?.tailored_text) {
    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    text('Summary', MARGIN);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const summaryLines = doc.splitTextToSize(tailoredData.summary.tailored_text, CONTENT_WIDTH);
    checkOverflow(summaryLines.length * 13);
    doc.text(summaryLines, MARGIN, y);
    y += summaryLines.length * 13 + 6;
  }

  // ── Experience ───────────────────────────────────────────────────────────
  const experiences = tailoredData?.experience || [];
  if (experiences.length > 0) {
    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    checkOverflow(20);
    text('Experience', MARGIN);
    y += 16;

    for (const role of experiences) {
      checkOverflow(40);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      text(`${role.title}  ·  ${role.company}`, MARGIN);
      y += 14;

      if (role.period) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(100);
        text(role.period, MARGIN);
        y += 13;
        doc.setTextColor(0);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      for (const bullet of role.bullets || []) {
        const bulletText = bullet.tailored_text || bullet.original_text || '';
        if (!bulletText) continue;
        const lines = doc.splitTextToSize(`• ${bulletText}`, CONTENT_WIDTH - 10);
        checkOverflow(lines.length * 13);
        doc.text(lines, MARGIN + 8, y);
        y += lines.length * 13 + 3;
      }

      y += 8;
    }
  }

  return doc;
}

export function downloadResumePdf({ tailoredData, jobTitle, company }: { tailoredData: TailoredData; jobTitle: string; company: string }) {
  const doc = buildResumePdf({ tailoredData, jobTitle, company });
  const safeName = `${jobTitle}-${company}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`resume-${safeName}.pdf`);
}
