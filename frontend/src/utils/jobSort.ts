import type { Job } from '../types';

type SortableJob = { postedAt?: string | null; match_score: number };
type FilterableJob = Pick<Job, 'url'>;

const FRESH_MS = 48 * 60 * 60 * 1000;

export function isFresh(job: { postedAt?: string | null }): boolean {
  if (!job.postedAt) return false;
  const t = new Date(job.postedAt).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < FRESH_MS;
}

export function makeFreshnessComparator(sortBy: string) {
  return (a: SortableJob, b: SortableJob): number => {
    const af = isFresh(a);
    const bf = isFresh(b);
    if (af !== bf) return af ? -1 : 1;
    if (sortBy === 'match_score') return b.match_score - a.match_score;
    const ra = a as unknown as Record<string, unknown>;
    const rb = b as unknown as Record<string, unknown>;
    return String(ra[sortBy] ?? '').localeCompare(String(rb[sortBy] ?? ''));
  };
}

export function sortByFreshnessThenScore(a: SortableJob, b: SortableJob): number {
  return makeFreshnessComparator('match_score')(a, b);
}

export function filterExpired(expiredUrls: Set<string>) {
  return (job: FilterableJob): boolean => {
    if (!job.url) return true;
    return !expiredUrls.has(job.url);
  };
}
