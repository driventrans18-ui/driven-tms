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

// ── Receipt (expense) parser ────────────────────────────────────────────────

export interface ReceiptPrefill {
  vendor:        string | null
  amount:        number | null
  date:          string | null   // YYYY-MM-DD
  category:      string | null   // one of ExpenseSheet's CATEGORIES
  notes:         string | null
  gallons:       number | null   // fuel only
  price_per_gal: number | null   // fuel only
  odometer:      number | null   // fuel only
}

// Send a receipt photo to Claude Haiku Vision and get back a typed prefill.
// Any field Claude can't extract with confidence comes back null.
export async function parseReceipt(
  image: string,
  mimeType = 'image/jpeg',
): Promise<{ prefill: ReceiptPrefill; usage: RateConUsage }> {
  if (!image) throw new Error('Image required')
  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    body: { image, mime_type: mimeType },
  })
  if (error) throw new Error(error.message)
  const res = data as { prefill?: ReceiptPrefill; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.prefill) throw new Error('parse-receipt returned no prefill')
  return { prefill: res.prefill, usage: res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 } }
}

// ── Broker FMCSA lookup ─────────────────────────────────────────────────────

export interface BrokerSnapshot {
  mc_number:        string | null
  dot_number:       string | null
  legal_name:       string | null
  dba_name:         string | null
  physical_address: string | null
  phone:            string | null
  entity_type:      string | null
  operating_status: string | null
  mcs150_date:      string | null
  oos_rate_vehicle: number | null
  oos_rate_driver:  number | null
  power_units:      number | null
  drivers:          number | null
  risk_flags:       string[]
}

// Look a broker up in FMCSA's SAFER database by MC or DOT number. Returns
// the carrier snapshot + a computed set of risk_flags the UI can use to
// render warnings (out_of_service, not_authorized, high_vehicle_oos, etc.).
// Throws on missing records so the caller can display an inline error.
export async function checkBroker(query: { mc?: string; dot?: string }): Promise<BrokerSnapshot> {
  const mc  = (query.mc  ?? '').replace(/\D/g, '')
  const dot = (query.dot ?? '').replace(/\D/g, '')
  if (!mc && !dot) throw new Error('MC# or DOT# required')
  const { data, error } = await supabase.functions.invoke('check-broker', {
    body: mc ? { mc_number: mc } : { dot_number: dot },
  })
  if (error) throw new Error(error.message)
  const res = data as { snapshot?: BrokerSnapshot; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.snapshot) throw new Error('check-broker returned no snapshot')
  return res.snapshot
}
