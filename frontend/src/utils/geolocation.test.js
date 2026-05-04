import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCity } from './geolocation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveCity', () => {
  it('returns fallback when navigator.geolocation is undefined', async () => {
    vi.stubGlobal('navigator', { geolocation: undefined });
    expect(await resolveCity('Toronto, ON')).toBe('Toronto, ON');
  });

  it('returns fallback when getCurrentPosition errors (permission denied)', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok, err) => err(new Error('User denied geolocation')),
      },
    });
    expect(await resolveCity('Toronto, ON')).toBe('Toronto, ON');
  });

  it('returns fallback when getCurrentPosition times out', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok, err) =>
          setTimeout(() => err(new Error('Timeout')), 0),
      },
    });
    expect(await resolveCity('Toronto, ON')).toBe('Toronto, ON');
  });

  it('returns parsed city+state when geocoding succeeds', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok) =>
          ok({ coords: { latitude: 43.65, longitude: -79.38 } }),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        address: { city: 'Toronto', state: 'Ontario' },
      }),
    }));

    expect(await resolveCity('Toronto, ON')).toBe('Toronto, Ontario');
  });

  it('returns fallback when Nominatim response has no city/town/village', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok) =>
          ok({ coords: { latitude: 0, longitude: 0 } }),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ address: {} }),
    }));

    expect(await resolveCity('Toronto, ON')).toBe('Toronto, ON');
  });

  it('returns fallback when fetch throws', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok) =>
          ok({ coords: { latitude: 43.65, longitude: -79.38 } }),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    expect(await resolveCity('Toronto, ON')).toBe('Toronto, ON');
  });
});
