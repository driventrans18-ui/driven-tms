// Rough road-mile estimator for a city/state origin → destination pair.
// Uses OpenStreetMap's free Nominatim geocoder (no API key) + a Haversine
// great-circle distance × 1.2 road factor.
//
// Expect ±10% on typical intra-US lanes. Respect Nominatim's usage policy:
// max 1 request/sec, always send a User-Agent. https://operations.osmfoundation.org/policies/nominatim/

interface Coords { lat: number; lng: number }

export async function estimateMiles(
  originCity: string,
  originState: string,
  destCity: string,
  destState: string,
): Promise<number | null> {
  if (!originCity || !destCity) return null
  const [origin, dest] = await Promise.all([
    geocode(originCity, originState),
    geocode(destCity, destState),
  ])
  if (!origin || !dest) return null
  const straight = haversineMiles(origin, dest)
  const road = straight * 1.2                      // typical road factor
  return Math.max(1, Math.round(road / 10) * 10)   // round to nearest 10
}

async function geocode(city: string, state: string): Promise<Coords | null> {
  const q = [city, state, 'USA'].filter(Boolean).join(', ')
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        // Nominatim requires an identifying User-Agent; browsers set their own
        // but Capacitor's WebView doesn't always, so we send a Referer hint.
        'Referer': 'https://driven-tms.vercel.app',
      },
    })
    if (!res.ok) return null
    const rows = await res.json() as Array<{ lat: string; lon: string }>
    if (!rows.length) return null
    return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) }
  } catch {
    return null
  }
}

function haversineMiles(a: Coords, b: Coords): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
