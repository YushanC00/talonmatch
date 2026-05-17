import { describe, it, expect, beforeEach } from 'vitest';
import { addStrike, getStrikes, clearStrikes, type StrikeEntry } from './strikeLog';

beforeEach(() => clearStrikes());

function makeStrike(overrides: Partial<StrikeEntry> = {}): Omit<StrikeEntry, 'id' | 'timestamp'> {
  return {
    kind: 'strike',
    jobTitle: 'Engineer',
    company: 'Acme',
    jobUrl: 'https://acme.com/apply',
    message: 'Auto-applied · résumé v3.5',
    matchDelta: '+12',
    score: 88,
    ...overrides,
  };
}

describe('addStrike', () => {
  it('stores an entry retrievable by getStrikes', () => {
    addStrike(makeStrike());
    expect(getStrikes()).toHaveLength(1);
  });

  it('assigns a unique id and ISO timestamp', () => {
    addStrike(makeStrike());
    const [entry] = getStrikes();
    expect(entry.id).toBeTruthy();
    expect(() => new Date(entry.timestamp)).not.toThrow();
  });

  it('entries are returned newest-first', () => {
    addStrike(makeStrike({ kind: 'tailor' }));
    addStrike(makeStrike({ kind: 'strike' }));
    const entries = getStrikes();
    expect(entries[0].kind).toBe('strike');
    expect(entries[1].kind).toBe('tailor');
  });

  it('caps at 200 entries', () => {
    for (let i = 0; i < 205; i++) addStrike(makeStrike());
    expect(getStrikes()).toHaveLength(200);
  });
});

describe('clearStrikes', () => {
  it('removes all entries', () => {
    addStrike(makeStrike());
    clearStrikes();
    expect(getStrikes()).toHaveLength(0);
  });
});
