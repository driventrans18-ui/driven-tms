import { useEffect, useState, useCallback } from 'react'

// Three-way theme: follow the system (default), force light, force dark.
// Setting is persisted to localStorage under `theme`. The hook owns the
// data-theme attribute on <html>, which drives the CSS variable overrides
// in index.css. For "system" we leave the attribute off so the
// prefers-color-scheme media query takes over.

export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readStored(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStored)

  // Apply once on mount and whenever the mode changes.
  useEffect(() => { applyTheme(mode) }, [mode])

  // Resolve the "effective" theme (what's actually showing) so UI rows can
  // render a correct checkmark when in "system" mode.
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: ThemeMode) => {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else                   localStorage.setItem(STORAGE_KEY, next)
    setMode(next)
  }, [])

  const effective: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  return { mode, effective, setTheme }
}

// Call this once at app startup (before React mounts) so the theme is
// applied pre-paint — avoids a flash of light-mode when dark is stored.
export function bootstrapTheme() {
  applyTheme(readStored())
}
