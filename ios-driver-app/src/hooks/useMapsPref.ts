import { useEffect, useState, useCallback } from 'react'

// Per-driver preference for which maps app should open when the driver
// taps pickup / delivery links or the big "Navigate" button in Driver
// Mode. Stored in localStorage (same pattern as useTheme) so it sticks
// across sessions without needing a Supabase round-trip.

export type MapsProvider = 'google' | 'apple' | 'waze' | 'truckerpath'

export const MAPS_PROVIDERS: Array<{ key: MapsProvider; label: string; hint: string }> = [
  { key: 'google',      label: 'Google Maps',  hint: 'Default' },
  { key: 'apple',       label: 'Apple Maps',   hint: 'Built-in on iOS' },
  { key: 'waze',        label: 'Waze',         hint: 'Community traffic + police alerts' },
  { key: 'truckerpath', label: 'Trucker Path', hint: 'Truck stops + weigh stations' },
]

const STORAGE_KEY = 'maps-provider'
const DEFAULT: MapsProvider = 'google'

function readStored(): MapsProvider {
  if (typeof localStorage === 'undefined') return DEFAULT
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'apple' || v === 'waze' || v === 'truckerpath' || v === 'google' ? v : DEFAULT
}

// Module-level cache so non-hook callers (like the bare mapsUrl helper
// used inside anchor hrefs) see the latest value without re-reading
// localStorage on every call.
let current: MapsProvider = readStored()

export function getMapsProvider(): MapsProvider {
  return current
}

// Build a "navigate-to" URL for the chosen provider. Google is the
// default and works cross-platform. Apple falls back to web maps on
// Android / simulator. Waze has a universal link. Trucker Path has no
// public deep-link for a specific address, so we open the app and let
// the driver search inside it; if the app isn't installed, iOS shows
// the App Store page for the scheme.
export function buildMapsUrl(parts: Array<string | null | undefined>, provider: MapsProvider = current): string {
  const q = parts.filter(Boolean).join(', ').trim()
  const encoded = encodeURIComponent(q)
  switch (provider) {
    case 'google':      return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
    case 'apple':       return `https://maps.apple.com/?daddr=${encoded}`
    case 'waze':        return `https://www.waze.com/ul?q=${encoded}&navigate=yes`
    case 'truckerpath': return `truckerpath://`
  }
}

export function useMapsPref() {
  const [provider, setProvider] = useState<MapsProvider>(current)

  // Keep the module cache in sync with React state so the bare helper
  // sees the newest value right after a setProvider() call.
  useEffect(() => { current = provider }, [provider])

  const setMapsProvider = useCallback((next: MapsProvider) => {
    if (next === DEFAULT) localStorage.removeItem(STORAGE_KEY)
    else                  localStorage.setItem(STORAGE_KEY, next)
    current = next
    setProvider(next)
  }, [])

  return { provider, setMapsProvider }
}
