import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Legacy (HS256-signed) anon JWTs still pass PostgREST but the edge-function
// runtime rejects them with UNAUTHORIZED_LEGACY_JWT. The only fix is to use
// the new publishable key (sb_publishable_…) — refreshing the session cannot
// rewrite the apikey header.
export const anonKeyIsLegacy = !!key && key.startsWith('eyJ')
export const anonKeyPrefix   = key ? key.slice(0, 12) : '(empty)'

if (anonKeyIsLegacy) {
  console.error(
    '[supabase] VITE_SUPABASE_ANON_KEY is a legacy JWT (eyJ…). Edge functions ' +
    'will return UNAUTHORIZED_LEGACY_JWT. Replace it with the sb_publishable_… ' +
    'key from Supabase → Project Settings → API → "Publishable and secret API keys".'
  )
}

// Supabase-js stores its session under keys like sb-<projectref>-auth-token.
// If an earlier build shipped with a broken anon key, the stored token can
// still carry that bad apikey and every request 401s with "Invalid API key".
// Invalidate the cached auth whenever the bundled anon key changes.
try {
  const marker = localStorage.getItem('sb-driver-key-fingerprint')
  const fingerprint = `${url}::${key?.slice(-12) ?? ''}`
  if (marker !== fingerprint) {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-')) localStorage.removeItem(k)
    }
    localStorage.setItem('sb-driver-key-fingerprint', fingerprint)
  }
} catch { /* private mode / storage blocked */ }

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
