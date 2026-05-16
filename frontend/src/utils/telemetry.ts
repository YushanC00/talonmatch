export const MAX_ENTRIES = 200;
const STORAGE_KEY = 'talonmatch_telemetry';

export interface TelemetryEntry {
  timestamp: string;
  key: string;
  decision: 'accepted' | 'rejected';
  original: string;
  tailored: string;
  jobTitle: string;
  company: string;
}

export function getTelemetry(): TelemetryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TelemetryEntry[];
  } catch {
    return [];
  }
}

export function logDecision(entry: Omit<TelemetryEntry, 'timestamp'>): void {
  try {
    let entries = getTelemetry();
    entries.push({ ...entry, timestamp: new Date().toISOString() });
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded or other storage error — silently ignore
  }
}

export function clearTelemetry(): void {
  localStorage.removeItem(STORAGE_KEY);
}
