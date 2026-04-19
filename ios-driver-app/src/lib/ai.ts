import { supabase } from './supabase'

// Client-side helpers for the AI edge functions. Each function is a thin
// wrapper around a Supabase `functions.invoke(...)` call so callers don't
// have to know which function name they're hitting.

// Fields Claude returns from parse-rate-con. Shape intentionally mirrors
// the LoadFormSheet's editable fields so the merge in the form is a
// flat spread (plus a couple of derived lookups like broker_mc → broker_id).
export interface RateConPrefill {
  load_number:    string | null
  broker_name:    string | null
  broker_mc:      string | null
  shipper_name:   string | null
  receiver_name:  string | null
  origin_city:    string | null
  origin_state:   string | null
  dest_city:      string | null
  dest_state:     string | null
  pickup_at:      string | null   // local ISO, no timezone (e.g. "2026-04-18T08:00:00")
  deliver_by:     string | null
  miles:          number | null
  rate:           number | null
  load_type:      string | null
  pickup_notes:   string | null
  delivery_notes: string | null
}

export interface RateConUsage {
  input: number
  output: number
  cache_read: number
  cache_write: number
}

// Input to the parser. Two shapes because rate cons arrive two ways: the
// driver scans a paper copy (one or more JPEG pages) or picks a PDF from
// the Files app / email attachment.
export type ParseRateConInput =
  | { images: string[]; mimeType?: string }
  | { pdf: string }

// Send rate-con content to the edge function. Returns a best-effort prefill
// — any field the model couldn't extract with confidence comes back null.
export async function parseRateCon(
  input: ParseRateConInput,
): Promise<{ prefill: RateConPrefill; usage: RateConUsage }> {
  const body: Record<string, unknown> = {}
  if ('pdf' in input) {
    if (!input.pdf) throw new Error('Empty PDF payload')
    body.pdf = input.pdf
  } else {
    if (input.images.length === 0) throw new Error('At least one page is required')
    body.images = input.images
    body.mime_type = input.mimeType ?? 'image/jpeg'
  }
  const { data, error } = await supabase.functions.invoke('parse-rate-con', { body })
  if (error) throw new Error(error.message)
  const res = data as { prefill?: RateConPrefill; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.prefill) throw new Error('parse-rate-con returned no prefill')
  return { prefill: res.prefill, usage: res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 } }
}
