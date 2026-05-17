const KEY = 'talonmatch_strikes';
const MAX = 200;

export type StrikeKind = 'strike' | 'tailor' | 'draft' | 'skip' | 'interview';

export interface StrikeEntry {
  id: string;
  timestamp: string;
  kind: StrikeKind;
  jobTitle?: string;
  company?: string;
  jobUrl?: string;
  message: string;
  matchDelta?: string;
  score?: number;
}

export function getStrikes(): StrikeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StrikeEntry[]) : [];
  } catch { return []; }
}

export function addStrike(entry: Omit<StrikeEntry, 'id' | 'timestamp'>): void {
  const newEntry: StrikeEntry = {
    ...entry,
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  const existing = getStrikes();
  const updated = [newEntry, ...existing].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch { /* quota */ }
}

export function clearStrikes(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
