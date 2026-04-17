import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const isValidUrl = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export const supabaseConfigured =
  !!supabaseUrl && !!supabaseAnonKey &&
  isValidUrl(supabaseUrl) &&
  supabaseUrl !== 'your_url_here' &&
  supabaseAnonKey !== 'your_key_here'

// Only create the client when credentials are valid — avoids crash on placeholder values
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key-not-used')
