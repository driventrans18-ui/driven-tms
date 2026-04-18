import { useEffect, useRef, useState } from 'react'
import { searchCities, type CitySuggestion } from '../lib/citySearch'

interface Props {
  cityValue: string
  stateValue: string
  onPick: (city: string, state: string) => void
  onTypeCity: (v: string) => void
  onTypeState: (v: string) => void
  placeholder?: string
}

export function CityAutocomplete({
  cityValue, stateValue, onPick, onTypeCity, onTypeState, placeholder = 'City',
}: Props) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    if (cityValue.trim().length < 2) { setSuggestions([]); return }
    timer.current = setTimeout(async () => {
      const id = ++requestId.current
      const results = await searchCities(cityValue)
      if (id === requestId.current) setSuggestions(results)
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [cityValue, open])

  return (
    <div className="relative">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={cityValue}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => onTypeCity(e.target.value)}
          placeholder={placeholder}
          autoCorrect="off"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] transition-colors"
        />
        <input
          value={stateValue}
          onChange={e => onTypeState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="ST"
          className="w-14 px-2 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] text-center uppercase"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 rounded-lg bg-white border border-gray-200 shadow-md overflow-hidden">
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
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
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
