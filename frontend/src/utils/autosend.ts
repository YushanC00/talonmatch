import type { Job } from '../types';

export interface AutosendSettings {
  enabled: boolean;
  scoreThreshold: number;
  intervalMinutes: number;
}

export const DEFAULT_AUTOSEND_SETTINGS: AutosendSettings = {
  enabled: false,
  scoreThreshold: 85,
  intervalMinutes: 30,
};

const SETTINGS_KEY = 'talonmatch_autosend_settings';
const LAST_RUN_KEY = 'talonmatch_autosend_last_run';

export function loadAutosendSettings(): AutosendSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUTOSEND_SETTINGS };
    return { ...DEFAULT_AUTOSEND_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AUTOSEND_SETTINGS };
  }
}

export function saveAutosendSettings(settings: AutosendSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* quota */ }
}

export function getLastRunAt(): string | null {
  return localStorage.getItem(LAST_RUN_KEY);
}

export function markRunNow(): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
  } catch { /* quota */ }
}

export function filterAutoQualify(
  jobs: Job[],
  appliedUrls: Set<string>,
  threshold: number,
): Job[] {
  return jobs.filter(j =>
    j.url &&
    j.match_score >= threshold &&
    !appliedUrls.has(j.url),
  );
}

export function shouldRunNow(lastRunAt: string | null, intervalMinutes: number): boolean {
  if (!lastRunAt) return true;
  const elapsed = Date.now() - new Date(lastRunAt).getTime();
  return elapsed >= intervalMinutes * 60 * 1000;
}
