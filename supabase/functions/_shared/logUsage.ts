// Shared helper — one row per Anthropic call lands in claude_usage so the
// Settings "API usage" card can roll up cost. Best-effort: any DB failure
// is swallowed (logged to stderr) so a metrics write never fails the parse.
//
// Callers should invoke via `logUsage(req, 'my-fn', MODEL, usage).catch(...)`
// and not await it — this keeps the response path snappy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export interface TokenUsage {
  input:       number
  output:      number
  cache_read:  number
  cache_write: number
}

export async function logUsage(
  req: Request,
  fnName: string,
  model: string,
  usage: TokenUsage,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Pull the caller's user_id from the incoming JWT when present so the
  // Settings card can (later) show per-driver draw.
  let userId: string | null = null
  const auth = req.headers.get('authorization') || ''
  const jwt  = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : ''
  if (jwt) {
    const { data } = await client.auth.getUser(jwt)
    userId = data?.user?.id ?? null
  }

  await client.from('claude_usage').insert({
    function:           fnName,
    model,
    input_tokens:       usage.input,
    output_tokens:      usage.output,
    cache_read_tokens:  usage.cache_read,
    cache_write_tokens: usage.cache_write,
    user_id:            userId,
  })
}

// Extracts Claude's JSON response even when wrapped in ```json fences or
// preceded by a prose sentence. Returns null if nothing parseable found.
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
  }
  const brace = trimmed.match(/\{[\s\S]*\}/)
  if (brace) {
    try { return JSON.parse(brace[0]) } catch { return null }
  }
  return null
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
