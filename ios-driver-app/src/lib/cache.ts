const PREFIX = 'driven-driver:'

export function cacheSet<T>(key: string, value: T) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* quota or privacy mode */ }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

export function cacheRemove(key: string) {
  try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
}
