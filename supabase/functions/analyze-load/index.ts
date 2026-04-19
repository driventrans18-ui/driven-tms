// Load profitability + routing analyst. Client POSTs `{ load_id }` and we:
//   1. Fetch the load + driver's recent delivered loads server-side so the
//      model can compare this load's $/mile against the driver's lane avg.
//   2. Ask Claude Sonnet 4.6 to act as an experienced trip planner — it
//      scores the load, calls out the RPM vs reference, suggests a realistic
//      interstate route, and lists the main risks (deadhead, tight window,
//      low-rate lane, fuel cost).
//   3. Return a structured JSON verdict the mobile app can render.
//
// Model: Sonnet — this needs real reasoning (trip planning, route picking,
// rate benchmarking). Haiku underperforms noticeably on geographic routing.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { logUsage, extractJson, CORS_HEADERS } from '../_shared/logUsage.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1400

const SYSTEM_PROMPT = `You are a veteran freight trip planner helping an owner-operator truck driver decide whether a specific load is worth running.

You will receive a JSON context block describing:
- the candidate load (lane, miles, deadhead, rate, equipment, pickup + delivery windows)
- the driver's recent delivered loads, so you can benchmark this load's $/mile against what they actually run

Return ONLY a single JSON object. No prose, no markdown fences. Schema:

{
  "verdict":        "good" | "fair" | "bad",
  "summary":        string,      // ≤ 240 chars, plain English, the bottom-line recommendation
  "rpm":            number | null,  // $/mile for this load incl. deadhead, 2 decimals
  "loaded_rpm":     number | null,  // $/mile excluding deadhead, 2 decimals
  "reference_rpm":  number | null,  // driver's recent avg $/mile for comparison, 2 decimals, null if no history
  "route": {
    "summary":   string,          // short route in interstate form, e.g. "I-75 S → I-10 W → I-35 N"
    "distance_mi": number | null, // your best estimate of the driving miles, or null
    "drive_hours": number | null, // est. drive time in hours, or null
    "stops":     string[]         // 2-5 suggested fuel / rest stops along the route
  },
  "pros":           string[],     // 2-5 bullet strings, short
  "cons":           string[],     // 2-5 bullet strings, short (can be [] if none)
  "risks":          string[],     // concrete dispatch risks: tight window, deadhead cost, hours-of-service, known low-rate lane
  "recommendation": string        // 1-2 sentence close, imperative voice ("Take it.", "Counter at $X.", "Pass.")
}

Scoring rubric (use your judgment, these are defaults):
- "good": loaded $/mile ≥ reference * 1.10, window is workable, deadhead ≤ 15% of loaded miles.
- "fair": loaded $/mile within ±10% of reference, or one moderate risk.
- "bad":  loaded $/mile ≤ reference * 0.90, or a structural problem (unreachable window, ≥ 30% deadhead, unsafe HoS).

Rules:
- If miles is missing, estimate from the city pairs using general US trucking knowledge and note the estimate in the route summary.
- Reference RPM is ONLY the driver history provided — do not fabricate an industry average if history is empty (return null).
- Routes should reflect real US interstate truck corridors. Never invent road numbers.
- Keep money formatted as numbers (e.g. 2.45), not strings, except in summary / recommendation text.
- Never output markdown or emoji.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase service role not configured' })

  let body: { load_id?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }) }

  const loadId = body.load_id
  if (!loadId) return json({ error: 'load_id required' })

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: loadRow, error: loadErr } = await db.from('loads')
    .select('id, load_number, origin_city, origin_state, dest_city, dest_state, miles, deadhead_miles, rate, pickup_at, deliver_by, load_type, driver_id, pickup_notes, delivery_notes')
    .eq('id', loadId).maybeSingle()
  if (loadErr)  return json({ error: `load lookup failed: ${loadErr.message}` })
  if (!loadRow) return json({ error: 'load not found' })

  // Pull the driver's recent delivered loads to benchmark $/mile. Best effort.
  const driverId = (loadRow as { driver_id: string | null }).driver_id
  let recent: Array<{ rate: number | null; miles: number | null; deadhead: number | null; lane: string }> = []
  let referenceRpm: number | null = null
  if (driverId) {
    const { data: hist } = await db.from('loads')
      .select('rate, miles, deadhead_miles, origin_city, origin_state, dest_city, dest_state')
      .eq('driver_id', driverId)
      .eq('status', 'Delivered')
      .order('created_at', { ascending: false })
      .limit(12)
    const rows = (hist ?? []) as Array<{
      rate: number | null; miles: number | null; deadhead_miles: number | null
      origin_city: string | null; origin_state: string | null
      dest_city:   string | null; dest_state:   string | null
    }>
    recent = rows.map(r => ({
      rate:     r.rate,
      miles:    r.miles,
      deadhead: r.deadhead_miles,
      lane:     [[r.origin_city, r.origin_state].filter(Boolean).join(', '),
                 [r.dest_city,   r.dest_state  ].filter(Boolean).join(', ')].join(' → '),
    }))
    const totalRate  = rows.reduce((s, r) => s + (r.rate  ?? 0), 0)
    const totalMiles = rows.reduce((s, r) => s + (r.miles ?? 0) + (r.deadhead_miles ?? 0), 0)
    if (totalMiles > 0) referenceRpm = +(totalRate / totalMiles).toFixed(2)
  }

  const context = {
    load: {
      number:       loadRow.load_number,
      origin:       [loadRow.origin_city, loadRow.origin_state].filter(Boolean).join(', ') || null,
      destination:  [loadRow.dest_city,   loadRow.dest_state  ].filter(Boolean).join(', ') || null,
      miles:        loadRow.miles,
      deadhead_mi:  loadRow.deadhead_miles,
      rate:         loadRow.rate,
      pickup_at:    loadRow.pickup_at,
      deliver_by:   loadRow.deliver_by,
      load_type:    loadRow.load_type,
      pickup_notes: loadRow.pickup_notes,
      delivery_notes: loadRow.delivery_notes,
    },
    driver_history: {
      reference_rpm: referenceRpm,
      count:         recent.length,
      recent,
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
          text: `Analyse this load end-to-end.\n\nContext:\n${JSON.stringify(context, null, 2)}\n\nReturn only the JSON object.`,
        }],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return json({ error: 'Claude returned no text block' })
    const parsed = extractJson(textBlock.text)
    if (!parsed || typeof parsed !== 'object') {
      return json({ error: 'Claude response was not valid JSON', raw: textBlock.text })
    }

    const usage = {
      input:       response.usage.input_tokens,
      output:      response.usage.output_tokens,
      cache_read:  response.usage.cache_read_input_tokens  ?? 0,
      cache_write: response.usage.cache_creation_input_tokens ?? 0,
    }
    logUsage(req, 'analyze-load', MODEL, usage).catch(err =>
      console.error('claude_usage insert failed:', err)
    )

    return json({ analysis: parsed, usage })
  } catch (e) {
    console.error('analyze-load error:', e)
    return json({ error: e instanceof Error ? e.message : 'analysis failed' })
  }
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}
