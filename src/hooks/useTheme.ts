import { useEffect, useState, useCallback } from 'react'

// Mirrors ios-driver-app/src/hooks/useTheme.ts. Three modes: system (default,
// follows the OS), light, dark. Persists to localStorage.theme; absence of
// the key means "system". The hook owns the data-theme attribute on <html>.

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

  useEffect(() => { applyTheme(mode) }, [mode])

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

export function bootstrapTheme() {
  applyTheme(readStored())
}
