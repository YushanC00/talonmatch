// Pure TypeScript helpers for ResumePDF — no JSX imports so type inference is clean

export interface ContentItem {
  id: string
  label: string
  original: string
  tailored: string
  rationale?: string
}

export interface Section {
  title: string
  rationale: string
  content: ContentItem[]
}

export interface ExpGroup {
  label: string
  role: string
  company: string
  roleCompany: string
  period: string
  items: ContentItem[]
}

export function effectiveText(
  item: ContentItem,
  sectionTitle: string,
  reviews: Record<string, string>,
  editValues: Record<string, string>,
): string {
  const rkey = `${sectionTitle}:${item.id}`;
  if (editValues[rkey] !== undefined) return editValues[rkey];
  if (reviews[rkey] === 'cancelled') return item.original;
  return item.tailored || item.original;
}

export function groupExpItems(items: ContentItem[]): ExpGroup[] {
  const groups: ExpGroup[] = [];
  let cur: ExpGroup | null = null;
  for (const item of items) {
    const lbl: string = item.label as string;
    const curLabel: string = cur !== null ? (cur.label as string) : '';
    if (lbl && lbl !== curLabel) {
      const periodMatch: RegExpMatchArray | null = lbl.match(/\(([^)]+)\)\s*$/);
      const roleCompany = lbl.replace(/\s*\([^)]+\)\s*$/, '');
      const atIdx = roleCompany.indexOf(' @ ');
      const role    = atIdx >= 0 ? roleCompany.slice(0, atIdx) : roleCompany;
      const company = atIdx >= 0 ? roleCompany.slice(atIdx + 3) : '';
      cur = {
        label:      lbl,
        role,
        company,
        roleCompany,
        period:     periodMatch?.[1] ?? '',
        items:      [],
      };
      groups.push(cur);
    }
    cur?.items.push(item);
  }
  return groups;
}
