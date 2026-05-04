const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse?format=json';

/**
 * Resolve the user's city string via the Geolocation API + Nominatim reverse-geocoding.
 * Returns `fallback` if permission is denied, times out, or any network error occurs.
 */
export async function resolveCity(fallback = 'Toronto, ON') {
  if (!navigator.geolocation) return fallback;

  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    );

    const { latitude, longitude } = pos.coords;
    const res  = await fetch(`${NOMINATIM}&lat=${latitude}&lon=${longitude}`);
    const data = await res.json();

    const rawCity = data.address?.city || data.address?.town || data.address?.village || '';
    const state   = data.address?.state || '';
    return rawCity ? (state ? `${rawCity}, ${state}` : rawCity) : fallback;
  } catch {
    return fallback;
  }
}
