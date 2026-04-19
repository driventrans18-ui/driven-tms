// Claude API token → USD cost lookup.
//
// Rates are from anthropic.com/pricing (per million tokens). Stored
// client-side so a price change ships as a code update rather than a
// data migration. Update the MODEL_PRICES table when Anthropic
// publishes new rates; the Settings usage card will pick it up on
// next build.
//
// Values are USD per million tokens for each traffic kind. Cache
// hits are billed at ~10% of base input; cache writes at ~125%.

export interface ModelPrice {
  input:       number  // per million tokens
  output:      number
  cache_read:  number
  cache_write: number
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6':   { input: 3,   output: 15, cache_read: 0.30, cache_write: 3.75 },
  'claude-sonnet-4-7':   { input: 3,   output: 15, cache_read: 0.30, cache_write: 3.75 },
  'claude-opus-4-7':     { input: 15,  output: 75, cache_read: 1.50, cache_write: 18.75 },
  'claude-haiku-4-5':    { input: 1,   output: 5,  cache_read: 0.10, cache_write: 1.25 },
}

// Fallback = Sonnet pricing. Keeps old rows costed when we rename a
// model mid-flight.
const FALLBACK = MODEL_PRICES['claude-sonnet-4-6']

export interface UsageRow {
  function:           string
  model:              string
  input_tokens:       number
  output_tokens:      number
  cache_read_tokens:  number
  cache_write_tokens: number
}

// USD cost of a single logged call.
export function costOf(row: UsageRow): number {
  const p = MODEL_PRICES[row.model] ?? FALLBACK
  return (
    (row.input_tokens       / 1_000_000) * p.input +
    (row.output_tokens      / 1_000_000) * p.output +
    (row.cache_read_tokens  / 1_000_000) * p.cache_read +
    (row.cache_write_tokens / 1_000_000) * p.cache_write
  )
}

export function fmtUsd(n: number): string {
  if (n >= 1)  return '$' + n.toFixed(2)
  if (n >= 0.01) return '$' + n.toFixed(3)
  return '$' + n.toFixed(4)
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
