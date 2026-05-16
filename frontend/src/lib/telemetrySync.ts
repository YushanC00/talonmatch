import type { SupabaseClient } from '@supabase/supabase-js';
import { getTelemetry, MAX_ENTRIES } from '../utils/telemetry';
import type { TelemetryEntry } from '../utils/telemetry';

export function mergeEntries(local: TelemetryEntry[], remote: TelemetryEntry[]): TelemetryEntry[] {
  const seen = new Set<string>();
  const merged: TelemetryEntry[] = [];
  for (const e of [...local, ...remote]) {
    const dedup = `${e.timestamp}|${e.key}`;
    if (!seen.has(dedup)) { seen.add(dedup); merged.push(e); }
  }
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return merged.slice(-MAX_ENTRIES);
}

export async function pushToDb(supabase: SupabaseClient, userId: string): Promise<void> {
  const entries = getTelemetry();
  if (!entries.length) return;
  const rows = entries.map(e => ({
    user_id:    userId,
    key:        e.key,
    decision:   e.decision,
    original:   e.original,
    tailored:   e.tailored,
    job_title:  e.jobTitle,
    company:    e.company,
    created_at: e.timestamp,
  }));
  await supabase
    .from('decision_telemetry')
    .upsert(rows, { onConflict: 'user_id,created_at', ignoreDuplicates: true });
}

export async function pullFromDb(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('decision_telemetry')
    .select('key, decision, original, tailored, job_title, company, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_ENTRIES);
  if (error || !data?.length) return;
  const remote: TelemetryEntry[] = data.map(r => ({
    timestamp: r.created_at as string,
    key:       r.key as string,
    decision:  r.decision as 'accepted' | 'rejected',
    original:  r.original as string,
    tailored:  r.tailored as string,
    jobTitle:  r.job_title as string,
    company:   r.company as string,
  }));
  const merged = mergeEntries(getTelemetry(), remote);
  try {
    localStorage.setItem('talonmatch_telemetry', JSON.stringify(merged));
  } catch { /* quota — leave localStorage as-is */ }
}
