import { useEffect, useRef, useState } from 'react'
import { searchCities, type CitySuggestion } from '../lib/citySearch'

interface Props {
  cityValue: string
  stateValue: string
  placeholder?: string
  onPick: (city: string, state: string) => void
  onTypeCity: (v: string) => void
  onTypeState: (v: string) => void
}

// Pair of City + State inputs with a dropdown of OpenStreetMap-powered
// suggestions under the City field. Picking a suggestion auto-fills the
// state. Mobile-friendly: suggestions render inline below the inputs
// instead of as a floating popup.
export function CityAutocomplete({
  cityValue, stateValue, placeholder = 'City', onPick, onTypeCity, onTypeState,
}: Props) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    if (cityValue.trim().length < 2) { setSuggestions([]); return }
    timer.current = setTimeout(async () => {
      const id = ++requestId.current
      setLoading(true)
      const results = await searchCities(cityValue)
      if (id === requestId.current) {
        setSuggestions(results)
        setLoading(false)
      }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [cityValue, open])

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={cityValue}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => onTypeCity(e.target.value)}
          placeholder={placeholder}
          autoCorrect="off"
          autoCapitalize="words"
          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
        />
        <input
          value={stateValue}
          onChange={e => onTypeState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="ST"
          className="w-16 px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base text-center uppercase"
        />
      </div>
      {open && (loading || suggestions.length > 0) && (
        <ul className="mt-1 rounded-xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          {loading && suggestions.length === 0 && (
            <li className="px-4 py-2 text-xs text-gray-400">Searching…</li>
          )}
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onPick(s.city, s.state)
                  setOpen(false)
                  setSuggestions([])
                }}
                className="w-full text-left px-4 py-2.5 text-sm active:bg-gray-50 cursor-pointer"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
