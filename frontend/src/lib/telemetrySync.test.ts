import { describe, it, expect } from 'vitest';
import { mergeEntries } from './telemetrySync';
import type { TelemetryEntry } from '../utils/telemetry';
import { MAX_ENTRIES } from '../utils/telemetry';

function makeEntry(overrides: Partial<TelemetryEntry> = {}): TelemetryEntry {
  return {
    timestamp: new Date().toISOString(),
    key: 'exp-0-1',
    decision: 'accepted',
    original: 'Old bullet.',
    tailored: 'New bullet.',
    jobTitle: 'Engineer',
    company: 'Acme',
    ...overrides,
  };
}

describe('mergeEntries', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(mergeEntries([], [])).toEqual([]);
  });

  it('returns local entries when remote is empty', () => {
    const local = [makeEntry({ timestamp: '2026-01-01T00:00:00.000Z' })];
    expect(mergeEntries(local, [])).toEqual(local);
  });

  it('returns remote entries when local is empty', () => {
    const remote = [makeEntry({ timestamp: '2026-01-01T00:00:00.000Z' })];
    expect(mergeEntries([], remote)).toEqual(remote);
  });

  it('deduplicates entries with same timestamp + key', () => {
    const ts = '2026-01-01T10:00:00.000Z';
    const entry = makeEntry({ timestamp: ts, key: 'summary' });
    const result = mergeEntries([entry], [entry]);
    expect(result).toHaveLength(1);
  });

  it('keeps distinct entries even with same key but different timestamps', () => {
    const a = makeEntry({ timestamp: '2026-01-01T10:00:00.000Z', key: 'exp-0-0' });
    const b = makeEntry({ timestamp: '2026-01-02T10:00:00.000Z', key: 'exp-0-0' });
    expect(mergeEntries([a], [b])).toHaveLength(2);
  });

  it('sorts entries chronologically by timestamp', () => {
    const older = makeEntry({ timestamp: '2026-01-01T00:00:00.000Z' });
    const newer = makeEntry({ timestamp: '2026-01-02T00:00:00.000Z' });
    const result = mergeEntries([newer], [older]);
    expect(result[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(result[1].timestamp).toBe('2026-01-02T00:00:00.000Z');
  });

  it('caps result at MAX_ENTRIES, keeping newest', () => {
    const local = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      makeEntry({ timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    const extra = makeEntry({ timestamp: '2027-01-01T00:00:00.000Z', key: 'summary' });
    const result = mergeEntries(local, [extra]);
    expect(result).toHaveLength(MAX_ENTRIES);
    expect(result[result.length - 1].key).toBe('summary');
  });
});
