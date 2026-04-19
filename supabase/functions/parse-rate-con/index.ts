// Rate confirmation parser. Client POSTs a base64-encoded rate con (one or
// more pages — typically the raw output of iOS's VNDocumentCameraViewController),
// we hand it to Claude Sonnet 4.6 Vision, and return a typed prefill object
// the Loads form can auto-populate.
//
// Why base64 instead of a storage path: the driver scans BEFORE the load
// exists. There's no load_id to file the scan under yet, and if Claude's
// parse comes back wrong we don't want an orphan in load-documents. Once
// the load is saved, the driver can re-scan as a regular rate_con
// document from the detail sheet.
//
// Secrets expected:
//   ANTHROPIC_API_KEY  — set via `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-sonnet-4-6'
const MAX_PAGES = 10   // rate cons rarely exceed 2; cap to bound token use
const MAX_TOKENS = 2048

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The system prompt is long and stable — mark it cacheable so repeat
// parses on the same worker pay the reduced cache-read rate.
const SYSTEM_PROMPT = `You are a rate confirmation parser for a US trucking TMS app.

You will receive one or more images of a rate confirmation (rate con) — the document a freight broker issues to confirm a load's terms. Extract the booking fields and return them as JSON.

Return ONLY a single JSON object — no prose, no markdown fences, no explanation. The object must match this schema exactly. Every field is required; set a value to null if it is not present or you cannot determine it with reasonable confidence.

{
  "load_number":    string | null,   // broker's load / order / confirmation number
  "broker_name":    string | null,   // brokerage company name (not the rep's personal name)
  "broker_mc":      string | null,   // broker's MC number, digits only (strip "MC" / "MC#")
  "shipper_name":   string | null,   // pickup company name
  "receiver_name":  string | null,   // delivery company name
  "origin_city":    string | null,   // pickup city
  "origin_state":   string | null,   // pickup state as 2-letter USPS code (e.g. "NY", "TX")
  "dest_city":      string | null,   // delivery city
  "dest_state":     string | null,   // delivery state as 2-letter USPS code
  "pickup_at":      string | null,   // pickup appointment, ISO 8601 WITHOUT timezone ("2026-04-18T08:00:00")
  "deliver_by":     string | null,   // delivery appointment, ISO 8601 without timezone
  "miles":          number | null,   // loaded miles as an integer if stated
  "rate":           number | null,   // all-in rate in USD (line haul + fuel + accessorials bundled into the total the carrier receives)
  "load_type":      string | null,   // one of: "Dry Van" | "Reefer" | "Flatbed" | "Step Deck" | "LTL" | "Other". null if unclear.
  "pickup_notes":   string | null,   // concise pickup instructions (dock #, references, lumper, appt vs FCFS, etc.)
  "delivery_notes": string | null    // concise delivery instructions
}

Rules:
- States must be the 2-letter USPS code. If the document spells out "New York", return "NY".
- pickup_at / deliver_by: if only a date is given, use "T00:00:00". If a window like "08:00-12:00" is given, use the start of the window. Never include a timezone offset.
- rate: parse "$3,900.00" as 3900. Prefer the total/all-in rate to the carrier; ignore broker-side commissions.
- broker_mc: digits only. "MC# 090949" → "090949". "MC 1234567" → "1234567".
- load_type: infer from equipment. "53' Van" → "Dry Van". "Reefer -10°F" → "Reefer". If the document says "Flatbed" or "Step Deck" verbatim, use that.
- pickup_notes and delivery_notes should be short (<200 chars each). Pull the most operationally useful detail — dock/door numbers, appointment vs. FCFS, required references. Skip boilerplate.
- If the document contains BOTH an origin and a destination in the same city (rare), still extract both.
- When in doubt, return null rather than guessing.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  // Always return 200 with { error } on failures — the Supabase functions
  // client throws on any non-2xx and swallows the body, so the UI can't
  // surface the real reason otherwise.
  if (req.method !== 'POST') return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured on the edge function' })
  }

  let body: { images?: string[]; pdf?: string; mime_type?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' })
  }

  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_PAGES) : []
  const pdf = typeof body.pdf === 'string' ? body.pdf : ''
  if (images.length === 0 && !pdf) {
    return json({ error: 'images[] or pdf required (base64 content)' })
  }
  const mime = body.mime_type || 'image/jpeg'

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Build Claude's content blocks. Single base64 PDF uses a document block;
  // one or more images use image blocks. Both can sit in the same user turn.
  const contentBlocks: Array<
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
    | { type: 'text'; text: string }
  > = []
  if (pdf) {
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf },
    })
  }
  for (const data of images) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data },
    })
  }
  contentBlocks.push({
    type: 'text',
    text: 'Extract the rate confirmation fields into the JSON object described in the system prompt. Return only the JSON object.',
  })

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return json({ error: 'Claude returned no text block' })
    }

    const parsed = extractJson(textBlock.text)
    if (!parsed) {
      return json({ error: 'Claude response was not valid JSON', raw: textBlock.text })
    }

    return json({
      prefill: parsed,
      usage: {
        input:       response.usage.input_tokens,
        output:      response.usage.output_tokens,
        cache_read:  response.usage.cache_read_input_tokens ?? 0,
        cache_write: response.usage.cache_creation_input_tokens ?? 0,
      },
    })
  } catch (e) {
    console.error('parse-rate-con error:', e)
    const msg = e instanceof Error ? e.message : 'parse failed'
    return json({ error: msg })
  }
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

// Claude may occasionally wrap JSON in ```json fences despite instructions
// to the contrary — strip them defensively before parsing.
function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
  }
  // Last resort: grab the first {...} span.
  const brace = trimmed.match(/\{[\s\S]*\}/)
  if (brace) {
    try { return JSON.parse(brace[0]) } catch { return null }
  }
  return null
}
