import type { ParsedResume, TailoredSection } from '../types';

export async function buildPdfBlob(
  sections: TailoredSection[],
  parsedResume: ParsedResume | null,
  reviews: Record<string, string> = {},
  editValues: Record<string, string> = {},
): Promise<Blob> {
  const [{ pdf }, { default: ResumePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ResumePDF'),
  ]);
  return pdf(
    <ResumePDF
      sections={sections}
      parsedResume={parsedResume}
      reviews={reviews}
      editValues={editValues}
    />,
  ).toBlob();
}
