// Broker email drafter. Client POSTs `{ intent, load_id, extra_context? }`
// and we:
//   1. Look up the load + broker + company_settings server-side so the
//      client never has to ship PII in the request body.
//   2. Hand a tightly-scoped context block to Claude Haiku 4.5 along with
//      an intent-specific tone nudge.
//   3. Return `{ subject, body }` ready to drop into a mailto:.
//
// Model: Haiku 4.5 — drafts are short, structured, latency-sensitive, and
// Sonnet's extra quality isn't worth the cost/time here.
//
// Secrets expected:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (for the load / broker lookup)

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { logUsage, extractJson, CORS_HEADERS } from '../_shared/logUsage.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 700

type Intent = 'accept' | 'detention' | 'pod' | 'payment_followup' | 'rate_counter' | 'generic'

const INTENT_TONES: Record<Intent, string> = {
  accept:           'Confirm you are accepting the load and restate the key terms (load #, pickup window, delivery window, rate) so the broker has a written confirmation. Friendly + professional.',
  detention:        'Request detention pay. State the load number, the scheduled appointment time, the actual time waiting (from the extra context), and ask the broker to confirm the detention rate + payment. Firm but professional — this is a factual claim.',
  pod:              'Inform the broker that the POD is attached / signed and delivery is complete. Short + upbeat.',
  payment_followup: 'Politely follow up on an unpaid invoice. Reference the invoice #, the load #, the amount, and the original issued / due dates. Courteous, not accusatory.',
  rate_counter:     'Counter the broker\'s offered rate. Use the extra context to justify the number (fuel, deadhead, lane rate, etc.). Collaborative, not confrontational — leave room for them to come back.',
  generic:          'Write a short professional email to the broker about this load using the extra context provided. Keep it to the point.',
}

const SYSTEM_PROMPT = `You are an email drafter for a solo owner-operator truck driver writing to a freight broker.

You will receive a JSON context block describing a load (pickup/delivery, rate, miles, times) plus the broker's name, the driver's company, and the desired intent. Return an email the driver can review and send.

Return ONLY a single JSON object — no prose, no markdown fences. Schema:

{
  "subject": string,   // one short line, starts with the load number if known, e.g. "LD-1042 — Detention at Receiver"
  "body":    string    // plain-text email body, 3-6 short paragraphs, \\n-separated. No Markdown. No emoji.
}

Rules:
- Address the broker by name if one is provided; otherwise open with "Hello,".
- Sign off with the driver's company name and MC# if present, e.g. "— Driven Transportation Inc., MC# 123456".
- Use the driver's first name in the sign-off when provided.
- Never invent facts. If the context doesn't contain a piece of information (rate, time, invoice number), leave it out rather than guess.
- Keep dates in "Mon Apr 14, 2026" format when you include them.
- Keep dollar amounts in "$3,450.00" format.
- Never exceed 1400 characters total for body — iOS mailto: starts breaking around 2000.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase service role not configured' })

  let body: { intent?: Intent; load_id?: string; extra_context?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }) }

  const intent = body.intent
  if (!intent || !(intent in INTENT_TONES)) {
    return json({ error: `intent must be one of: ${Object.keys(INTENT_TONES).join(', ')}` })
  }
  const loadId = body.load_id
  if (!loadId) return json({ error: 'load_id required' })
  const extra = typeof body.extra_context === 'string' ? body.extra_context.slice(0, 1000) : ''

  // Server-side fetch: keeps PII + RLS exceptions off the client.
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const [{ data: loadRow, error: loadErr }, { data: companyRow }] = await Promise.all([
    db.from('loads')
      .select('id, load_number, origin_city, origin_state, dest_city, dest_state, miles, rate, pickup_at, deliver_by, load_type, status, pickup_notes, delivery_notes, broker_id, driver_id, brokers(id, name, email, mc_number)')
      .eq('id', loadId).maybeSingle(),
    db.from('company_settings')
      .select('company_name, mc_number, phone, email')
      .limit(1).maybeSingle(),
  ])

  if (loadErr)  return json({ error: `load lookup failed: ${loadErr.message}` })
  if (!loadRow) return json({ error: 'load not found' })

  // Optional: driver's first name for the sign-off. Best-effort.
  let driverFirstName: string | null = null
  const driverId = (loadRow as { driver_id?: string | null }).driver_id
  if (driverId) {
    const { data: drv } = await db.from('drivers').select('first_name').eq('id', driverId).maybeSingle()
    driverFirstName = (drv as { first_name?: string | null } | null)?.first_name ?? null
  }

  // For payment follow-up, pull the most recent unpaid invoice for the load.
  let invoice: { number: string | null; amount: number | null; issued: string | null; due: string | null } | null = null
  if (intent === 'payment_followup') {
    const { data: inv } = await db.from('invoices')
      .select('invoice_number, amount, issued_date, due_date')
      .eq('load_id', loadId)
      .neq('status', 'Paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (inv) {
      invoice = {
        number: (inv as { invoice_number: string | null }).invoice_number,
        amount: (inv as { amount: number | null }).amount,
        issued: (inv as { issued_date: string | null }).issued_date,
        due:    (inv as { due_date: string | null }).due_date,
      }
    }
  }

  const context = {
    intent,
    extra_context: extra || null,
    load: {
      number:     loadRow.load_number,
      origin:     [loadRow.origin_city, loadRow.origin_state].filter(Boolean).join(', ') || null,
      destination:[loadRow.dest_city,   loadRow.dest_state  ].filter(Boolean).join(', ') || null,
      miles:      loadRow.miles,
      rate:       loadRow.rate,
      pickup_at:  loadRow.pickup_at,
      deliver_by: loadRow.deliver_by,
      load_type:  loadRow.load_type,
      status:     loadRow.status,
      pickup_notes:   loadRow.pickup_notes,
      delivery_notes: loadRow.delivery_notes,
    },
    broker: loadRow.brokers
      ? { name: (loadRow.brokers as { name: string }).name, mc: (loadRow.brokers as { mc_number: string | null }).mc_number }
      : null,
    driver: {
      first_name:   driverFirstName,
      company_name: companyRow?.company_name ?? null,
      mc_number:    companyRow?.mc_number    ?? null,
      phone:        companyRow?.phone        ?? null,
    },
    invoice,
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `Intent tone: ${INTENT_TONES[intent]}\n\nContext:\n${JSON.stringify(context, null, 2)}\n\nReturn only the JSON object.`,
        }],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return json({ error: 'Claude returned no text block' })
    const parsed = extractJson(textBlock.text) as { subject?: string; body?: string } | null
    if (!parsed || typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
      return json({ error: 'Claude response was not valid JSON', raw: textBlock.text })
    }

    const usage = {
      input:       response.usage.input_tokens,
      output:      response.usage.output_tokens,
      cache_read:  response.usage.cache_read_input_tokens  ?? 0,
      cache_write: response.usage.cache_creation_input_tokens ?? 0,
    }
    logUsage(req, 'draft-broker-email', MODEL, usage).catch(err =>
      console.error('claude_usage insert failed:', err)
    )

    return json({
      subject:    parsed.subject,
      body:       parsed.body,
      broker_email: (loadRow.brokers as { email: string | null } | null)?.email ?? null,
      usage,
    })
  } catch (e) {
    console.error('draft-broker-email error:', e)
    return json({ error: e instanceof Error ? e.message : 'draft failed' })
  }
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}
