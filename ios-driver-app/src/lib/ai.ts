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
  if (error) throw await expandFunctionError(error, 'parse-rate-con')
  const res = data as { prefill?: RateConPrefill; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.prefill) throw new Error('parse-rate-con returned no prefill')
  return { prefill: res.prefill, usage: res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 } }
}

// Expand a Supabase FunctionsHttpError into something the UI can
// actually surface — the default message ("Edge Function returned a
// non-2xx status code") hides the response body where the real
// reason lives.
async function expandFunctionError(error: unknown, fn: string): Promise<Error> {
  const e = error as { message?: string; context?: Response }
  let detail = e?.message || `${fn} error`
  try {
    const body = e.context ? await e.context.text() : ''
    if (body) detail += ` — ${body.slice(0, 300)}`
  } catch { /* ignore */ }
  console.error(`${fn} error:`, error, detail)
  return new Error(detail)
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
  if (error) throw await expandFunctionError(error, 'parse-receipt')
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
  const payload = mc ? { mc_number: mc } : { dot_number: dot }
  const { data, error } = await supabase.functions.invoke('check-broker', { body: payload })
  if (error) throw await expandFunctionError(error, 'check-broker')
  const res = data as { snapshot?: BrokerSnapshot; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.snapshot) throw new Error('check-broker returned no snapshot')
  return res.snapshot
}

export interface BrokerNameCandidate {
  legal_name: string
  dot_number: string | null
  location:   string | null
}

// Search FMCSA SAFER by company name. Returns a list of candidates the UI
// can show in a picker; the user taps one and we re-query by DOT # to get
// the full snapshot (via checkBroker).
export async function searchBrokerByName(name: string): Promise<BrokerNameCandidate[]> {
  const q = name.trim()
  if (q.length < 2) throw new Error('Enter at least 2 characters')
  const { data, error } = await supabase.functions.invoke('check-broker', { body: { name: q } })
  if (error) throw await expandFunctionError(error, 'check-broker')
  const res = data as { candidates?: BrokerNameCandidate[]; error?: string }
  if (res?.error) throw new Error(res.error)
  return res.candidates ?? []
}

// ── Broker email drafter ────────────────────────────────────────────────────

export type BrokerEmailIntent =
  | 'accept' | 'detention' | 'pod' | 'payment_followup' | 'rate_counter' | 'generic'

export interface BrokerEmailDraft {
  subject:      string
  body:         string
  broker_email: string | null
}

// Ask Claude to draft a broker email for a specific load + intent. The
// edge function server-side-fetches the load / broker / company rows so
// we never ship PII in the request body.
export async function draftBrokerEmail(args: {
  intent:        BrokerEmailIntent
  loadId:        string
  extraContext?: string
}): Promise<{ draft: BrokerEmailDraft; usage: RateConUsage }> {
  const { data, error } = await supabase.functions.invoke('draft-broker-email', {
    body: {
      intent:        args.intent,
      load_id:       args.loadId,
      extra_context: args.extraContext ?? '',
    },
  })
  if (error) throw await expandFunctionError(error, 'draft-broker-email')
  const res = data as {
    subject?: string; body?: string; broker_email?: string | null
    usage?: RateConUsage; error?: string
  }
  if (res?.error) throw new Error(res.error)
  if (!res?.subject || !res?.body) throw new Error('draft-broker-email returned no draft')
  return {
    draft: {
      subject:      res.subject,
      body:         res.body,
      broker_email: res.broker_email ?? null,
    },
    usage: res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  }
}

// ── Dock-note polisher ──────────────────────────────────────────────────────

// Send a raw dictation blob to Claude Haiku for polish into a tight
// 1-2 sentence dock note. Times / dock numbers / references stay verbatim.
export async function polishNote(args: {
  rawText: string
  kind:    'pickup' | 'delivery'
}): Promise<{ polished: string; usage: RateConUsage }> {
  const raw = args.rawText.trim()
  if (!raw) throw new Error('Nothing to polish')
  const { data, error } = await supabase.functions.invoke('polish-note', {
    body: { raw_text: raw, kind: args.kind },
  })
  if (error) throw await expandFunctionError(error, 'polish-note')
  const res = data as { polished?: string; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.polished) throw new Error('polish-note returned no result')
  return {
    polished: res.polished,
    usage:    res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  }
}
