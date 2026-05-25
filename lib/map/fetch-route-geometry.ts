/**
 * Fetches road geometry from OSRM (free, no API key).
 * Caches results in sessionStorage to avoid repeat calls.
 */

interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function cacheKey(start: { lat: number; lng: number }, end: { lat: number; lng: number }) {
  return `osrm:${start.lat.toFixed(3)},${start.lng.toFixed(3)}-${end.lat.toFixed(3)},${end.lng.toFixed(3)}`;
}

export async function fetchRouteGeometry(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<RouteGeometry | null> {
  const key = cacheKey(start, end);

  // Check sessionStorage cache
  if (typeof window !== 'undefined') {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  }

  try {
    const url = `${OSRM_BASE}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const geometry = data.routes?.[0]?.geometry as RouteGeometry | undefined;
    if (!geometry) return null;

    // Cache
    if (typeof window !== 'undefined') {
      try { sessionStorage.setItem(key, JSON.stringify(geometry)); } catch {}
    }

    return geometry;
  } catch {
    return null;
  }
}
