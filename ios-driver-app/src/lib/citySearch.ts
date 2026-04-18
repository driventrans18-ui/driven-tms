// Lightweight US city autocomplete using OpenStreetMap's free Nominatim
// API. Debounced at the call site to stay within the 1 req/sec policy.

export interface CitySuggestion {
  city: string
  state: string  // USPS two-letter code when available
  label: string  // "City, ST"
  lat: number
  lng: number
}

// US state names → two-letter codes. Nominatim returns full state names;
// we shorten them for the UI so they match the input field's sizing.
const US_STATE_ABBR: Record<string, string> = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA',
  colorado:'CO', connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA',
  hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA',
  kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD',
  massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS',
  missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH',
  'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
  'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK',
  oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC',
  'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT',
  virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI',
  wyoming:'WY', 'district of columbia':'DC',
}

export async function searchCities(query: string): Promise<CitySuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'us')
  url.searchParams.set('limit', '6')
  url.searchParams.set('q', q)
  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'Referer': 'https://driven-tms.vercel.app' },
    })
    if (!res.ok) return []
    const rows = await res.json() as Array<{
      lat: string; lon: string
      display_name: string
      address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string }
    }>
    const out: CitySuggestion[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const a = r.address ?? {}
      const city = a.city ?? a.town ?? a.village ?? a.hamlet
      if (!city || !a.state) continue
      const stateCode = US_STATE_ABBR[a.state.toLowerCase()] ?? a.state
      const key = `${city.toLowerCase()}|${stateCode}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        city,
        state: stateCode,
        label: `${city}, ${stateCode}`,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })
    }
    return out
  } catch {
    return []
  }
}

// Reverse-geocode a lat/lng to a "City, ST" label. Best-effort: returns null
// if the network call fails or the response doesn't resolve to a US locality,
// so callers can fall back to showing raw coordinates.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('lat', lat.toString())
  url.searchParams.set('lon', lng.toString())
  url.searchParams.set('zoom', '14')
  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'Referer': 'https://driven-tms.vercel.app' },
    })
    if (!res.ok) return null
    const row = await res.json() as {
      address?: {
        city?: string; town?: string; village?: string; hamlet?: string;
        suburb?: string; county?: string; state?: string; country_code?: string
      }
    }
    const a = row.address ?? {}
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county
    if (!city) return null
    if (!a.state) return city
    const stateCode = a.country_code === 'us'
      ? (US_STATE_ABBR[a.state.toLowerCase()] ?? a.state)
      : a.state
    return `${city}, ${stateCode}`
  } catch {
    return null
  }
}

// Simple debounce helper for use inside React components.
export function useDebounced<T extends (...a: never[]) => unknown>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, ms)
  }) as T
}
