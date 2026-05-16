import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logDecision, getTelemetry, clearTelemetry, MAX_ENTRIES } from './telemetry';

const STORAGE_KEY = 'talonmatch_telemetry';

function makeEntry(overrides = {}) {
  return {
    key: 'exp-0-1',
    decision: 'accepted' as const,
    original: 'Built features.',
    tailored: 'Architected scalable features.',
    jobTitle: 'Frontend Engineer',
    company: 'Acme',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('getTelemetry', () => {
  it('returns empty array when nothing stored', () => {
    expect(getTelemetry()).toEqual([]);
  });

  it('returns stored entries', () => {
    const entry = makeEntry();
    logDecision(entry);
    const result = getTelemetry();
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('exp-0-1');
    expect(result[0].decision).toBe('accepted');
    expect(result[0].original).toBe('Built features.');
    expect(result[0].tailored).toBe('Architected scalable features.');
    expect(result[0].jobTitle).toBe('Frontend Engineer');
    expect(result[0].company).toBe('Acme');
  });

  it('returns entries with ISO timestamp', () => {
    logDecision(makeEntry());
    const [entry] = getTelemetry();
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });
});

describe('logDecision', () => {
  it('appends to existing entries', () => {
    logDecision(makeEntry({ key: 'summary', decision: 'accepted' }));
    logDecision(makeEntry({ key: 'exp-0-0', decision: 'rejected' }));
    expect(getTelemetry()).toHaveLength(2);
  });

  it('trims oldest entries when MAX_ENTRIES exceeded', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      logDecision(makeEntry({ key: `exp-0-${i}`, tailored: `bullet ${i}` }));
    }
    const stored = getTelemetry();
    expect(stored).toHaveLength(MAX_ENTRIES);
    expect(stored[stored.length - 1].key).toBe(`exp-0-${MAX_ENTRIES + 4}`);
  });

  it('handles localStorage quota error silently', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => logDecision(makeEntry())).not.toThrow();
  });

  it('handles corrupted localStorage data by resetting', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(() => logDecision(makeEntry())).not.toThrow();
    expect(getTelemetry()).toHaveLength(1);
  });
});

describe('clearTelemetry', () => {
  it('removes all stored entries', () => {
    logDecision(makeEntry());
    logDecision(makeEntry({ key: 'summary' }));
    clearTelemetry();
    expect(getTelemetry()).toEqual([]);
  });
});
