import { supabase, anonKeyIsLegacy } from './supabase'

const LEGACY_KEY_HINT =
  'Your Supabase anon key is the legacy JWT format (eyJ…). Replace VITE_SUPABASE_ANON_KEY ' +
  'in ios-driver-app/.env with the sb_publishable_… key from Supabase → Project Settings → ' +
  'API → "Publishable and secret API keys", then rebuild (npm run cap:sync).'

// Client-side helpers for the AI edge functions. Each function is a thin
// wrapper around a Supabase `functions.invoke(...)` call so callers don't
// have to know which function name they're hitting.

// Fire-and-forget write to the ai_usage log. Called after every Claude
// call so Settings can surface month-to-date token + cost totals. Errors
// are swallowed — a failed log row should never break the user-visible
// parse result.
async function logAiUsage(event: string, usage: RateConUsage): Promise<void> {
  try {
    await supabase.from('ai_usage').insert({
      event,
      input_tokens:       usage.input,
      output_tokens:      usage.output,
      cache_read_tokens:  usage.cache_read,
      cache_write_tokens: usage.cache_write,
    })
  } catch {
    // Intentionally empty — logging is best-effort.
  }
}

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
  const data = await invokeWithJwtRetry<unknown>('parse-rate-con', body)
  const res = data as { prefill?: RateConPrefill; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.prefill) throw new Error('parse-rate-con returned no prefill')
  const usage = res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  void logAiUsage('parse_rate_con', usage)
  return { prefill: res.prefill, usage }
}

// Expand a Supabase FunctionsHttpError into something the UI can
// actually surface — the default message ("Edge Function returned a
// non-2xx status code") hides the response body where the real
// reason lives.
async function expandFunctionError(error: unknown, fn: string, rawBody?: string): Promise<Error> {
  const e = error as { message?: string; context?: Response }
  let detail = e?.message || `${fn} error`
  const body = rawBody ?? await readErrorBody(error)
  if (body) detail += ` — ${body.slice(0, 300)}`
  console.error(`${fn} error:`, error, detail)
  return new Error(detail)
}

async function readErrorBody(error: unknown): Promise<string> {
  const e = error as { context?: Response }
  if (!e?.context) return ''
  try { return await e.context.clone().text() } catch { return '' }
}

// Supabase's edge runtime rejects HS256-signed JWTs with UNAUTHORIZED_LEGACY_JWT.
// Two failure paths:
//   · apikey header is the legacy anon JWT (eyJ…) — only fix is updating .env
//     with the sb_publishable_… key. Refresh cannot rewrite this header.
//   · Authorization header is a stale access_token signed under the old
//     signing key — refresh mints a new one and a retry succeeds.
// We try refresh first; if the retry still returns UNAUTHORIZED_LEGACY_JWT,
// the anon key is the problem and we surface an actionable message.
async function invokeWithJwtRetry<T>(fn: string, body: unknown): Promise<T> {
  if (anonKeyIsLegacy) throw new Error(LEGACY_KEY_HINT)

  let r = await supabase.functions.invoke(fn, { body })
  if (r.error) {
    const raw = await readErrorBody(r.error)
    if (raw.includes('UNAUTHORIZED_LEGACY_JWT')) {
      const { error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr) {
        throw new Error('Session expired — sign out from Profile and sign in again.')
      }
      r = await supabase.functions.invoke(fn, { body })
      if (r.error) {
        const retryRaw = await readErrorBody(r.error)
        if (retryRaw.includes('UNAUTHORIZED_LEGACY_JWT')) throw new Error(LEGACY_KEY_HINT)
        throw await expandFunctionError(r.error, fn, retryRaw)
      }
    } else {
      throw await expandFunctionError(r.error, fn, raw)
    }
  }
  return r.data as T
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
  const data = await invokeWithJwtRetry<unknown>('parse-receipt', { image, mime_type: mimeType })
  const res = data as { prefill?: ReceiptPrefill; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.prefill) throw new Error('parse-receipt returned no prefill')
  const usage = res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  void logAiUsage('parse_receipt', usage)
  return { prefill: res.prefill, usage }
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
  const data = await invokeWithJwtRetry<unknown>('check-broker', payload)
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
  const data = await invokeWithJwtRetry<unknown>('check-broker', { name: q })
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
  const data = await invokeWithJwtRetry<unknown>('draft-broker-email', {
    intent:        args.intent,
    load_id:       args.loadId,
    extra_context: args.extraContext ?? '',
  })
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

// ── Load message drafter (email / notes) ────────────────────────────────────

export type LoadMessageFormat = 'email' | 'notes'

export interface LoadMessageDraft {
  format:       LoadMessageFormat
  subject:      string | null
  body:         string | null
  notes:        string | null
  broker_email: string | null
}

// Ask Claude to produce either a broker email (subject + body) or a
// dispatch-style notes blob for a specific load. The edge function
// server-side-fetches the load / broker / company rows so we never ship
// PII in the request body.
export async function draftLoadMessage(args: {
  loadId:        string
  format:        LoadMessageFormat
  extraContext?: string
}): Promise<{ draft: LoadMessageDraft; usage: RateConUsage }> {
  const data = await invokeWithJwtRetry<unknown>('draft-load-message', {
    load_id:       args.loadId,
    format:        args.format,
    extra_context: args.extraContext ?? '',
  })
  const res = data as {
    format?: LoadMessageFormat
    subject?: string | null; body?: string | null; notes?: string | null
    broker_email?: string | null
    usage?: RateConUsage; error?: string
  }
  if (res?.error) throw new Error(res.error)
  if (!res?.format) throw new Error('draft-load-message returned no format')
  const usage = res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  void logAiUsage('draft_load_message', usage)
  return {
    draft: {
      format:       res.format,
      subject:      res.subject ?? null,
      body:         res.body    ?? null,
      notes:        res.notes   ?? null,
      broker_email: res.broker_email ?? null,
    },
    usage,
  }
}

// ── Load profitability + routing analyst ────────────────────────────────────

export type LoadVerdict = 'good' | 'fair' | 'bad'

export interface LoadAnalysis {
  verdict:       LoadVerdict
  summary:       string
  rpm:           number | null
  loaded_rpm:    number | null
  reference_rpm: number | null
  route: {
    summary:     string
    distance_mi: number | null
    drive_hours: number | null
    stops:       string[]
  }
  pros:          string[]
  cons:          string[]
  risks:         string[]
  recommendation:string
}

// Ask Claude to evaluate whether a load is worth running. Returns a
// structured verdict + RPM vs. the driver's own recent history + a
// suggested interstate route. Sonnet-backed because trip planning
// benefits from deeper reasoning than Haiku.
export async function analyzeLoad(
  loadId: string,
): Promise<{ analysis: LoadAnalysis; usage: RateConUsage }> {
  const data = await invokeWithJwtRetry<unknown>('analyze-load', { load_id: loadId })
  const res = data as { analysis?: LoadAnalysis; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.analysis) throw new Error('analyze-load returned no analysis')
  const usage = res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  void logAiUsage('analyze_load', usage)
  return { analysis: res.analysis, usage }
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
  const data = await invokeWithJwtRetry<unknown>('polish-note', { raw_text: raw, kind: args.kind })
  const res = data as { polished?: string; usage?: RateConUsage; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.polished) throw new Error('polish-note returned no result')
  return {
    polished: res.polished,
    usage:    res.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  }
}
