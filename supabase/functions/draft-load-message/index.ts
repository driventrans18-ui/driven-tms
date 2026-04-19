// Load message drafter. Client POSTs `{ load_id, format, extra_context? }`
// where format is 'email' (subject + body for a broker) or 'notes' (a tight
// dispatch-style summary the driver can copy into a log or share over SMS).
//
// We look up the load + broker + company server-side so the client never
// ships PII. Mirrors the server-side lookup in draft-broker-email so
// callers share the same context contract.
//
// Model: Haiku 4.5 — short structured outputs, latency-sensitive.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { logUsage, extractJson, CORS_HEADERS } from '../_shared/logUsage.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 700

type Format = 'email' | 'notes'

const FORMAT_INSTRUCTIONS: Record<Format, string> = {
  email: `Write a short professional email to the broker summarising the load (load #, lane, pickup / delivery windows, rate, equipment). Include a line the driver can edit before sending. Return both a subject and a body.`,
  notes: `Write a compact dispatch-style note the driver can copy into their trip log or paste to a dispatcher over SMS. Plain text, 3-6 short lines, each line a single field (Load, Lane, Pickup, Delivery, Rate, Equipment, Notes). No salutation, no sign-off.`,
}

const SYSTEM_PROMPT = `You generate short load-related messages for an owner-operator truck driver.

You will receive a JSON context block with load + broker + company details and a "format" field — 'email' or 'notes'.

Return ONLY a single JSON object. No prose, no markdown fences. Schema depends on format:

If format == "email":
  { "subject": string, "body": string }
  - subject: one short line, starts with the load number if known.
  - body: plain-text, 3-6 short paragraphs, \\n-separated. No Markdown. No emoji.
  - Open with the broker's name if provided; otherwise "Hello,".
  - Sign off with the driver's first name (if given) and company / MC.
  - Keep under 1400 chars.

If format == "notes":
  { "notes": string }
  - 3-6 short lines, one field per line. Plain text.
  - Use the label style: "Load: LD-1042", "Lane: Atlanta, GA → Dallas, TX".
  - Never invent data. Omit lines where the value is unknown.
  - Keep under 500 chars.

General rules:
- Never invent facts. If a field is missing, leave it out rather than guess.
- Dates: "Mon Apr 14, 2026". Money: "$3,450.00". Miles: "1,240 mi".`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase service role not configured' })

  let body: { load_id?: string; format?: Format; extra_context?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }) }

  const format = body.format
  if (format !== 'email' && format !== 'notes') {
    return json({ error: "format must be 'email' or 'notes'" })
  }
  const loadId = body.load_id
  if (!loadId) return json({ error: 'load_id required' })
  const extra = typeof body.extra_context === 'string' ? body.extra_context.slice(0, 1000) : ''

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

  let driverFirstName: string | null = null
  const driverId = (loadRow as { driver_id?: string | null }).driver_id
  if (driverId) {
    const { data: drv } = await db.from('drivers').select('first_name').eq('id', driverId).maybeSingle()
    driverFirstName = (drv as { first_name?: string | null } | null)?.first_name ?? null
  }

  const context = {
    format,
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
          text: `Format: ${format}\nInstruction: ${FORMAT_INSTRUCTIONS[format]}\n\nContext:\n${JSON.stringify(context, null, 2)}\n\nReturn only the JSON object.`,
        }],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return json({ error: 'Claude returned no text block' })
    const parsed = extractJson(textBlock.text) as
      { subject?: string; body?: string; notes?: string } | null
    if (!parsed) return json({ error: 'Claude response was not valid JSON', raw: textBlock.text })

    if (format === 'email') {
      if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
        return json({ error: 'email draft missing subject/body', raw: textBlock.text })
      }
    } else if (typeof parsed.notes !== 'string') {
      return json({ error: 'notes draft missing notes field', raw: textBlock.text })
    }

    const usage = {
      input:       response.usage.input_tokens,
      output:      response.usage.output_tokens,
      cache_read:  response.usage.cache_read_input_tokens  ?? 0,
      cache_write: response.usage.cache_creation_input_tokens ?? 0,
    }
    logUsage(req, 'draft-load-message', MODEL, usage).catch(err =>
      console.error('claude_usage insert failed:', err)
    )

    return json({
      format,
      subject:     parsed.subject ?? null,
      body:        parsed.body    ?? null,
      notes:       parsed.notes   ?? null,
      broker_email:(loadRow.brokers as { email: string | null } | null)?.email ?? null,
      usage,
    })
  } catch (e) {
    console.error('draft-load-message error:', e)
    return json({ error: e instanceof Error ? e.message : 'draft failed' })
  }
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}
