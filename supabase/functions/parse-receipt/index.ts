// Expense receipt parser. Client POSTs a base64 JPEG/PNG (from the iOS
// Camera / Photos picker), Claude Haiku 4.5 Vision extracts the vendor,
// amount, date, category, and — for fuel receipts — gallons / price
// per gallon / odometer, and returns a typed prefill the ExpenseSheet
// form can auto-populate.
//
// Haiku 4.5 because receipts are short, structured, and we want this
// to feel instant. Sonnet is overkill.
//
// Secrets expected:
//   ANTHROPIC_API_KEY — same secret the rate-con parser uses.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 1024

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cached on the system message so repeat calls pay the ~10% cache-read
// rate. The prompt is the same on every request.
const SYSTEM_PROMPT = `You are a receipt parser for a US trucking TMS expense tracker.

You will receive a photo of a receipt — fuel, maintenance, tolls, insurance, lumper, or something else. Extract the key fields and return them as JSON.

Return ONLY a single JSON object — no prose, no markdown fences. Every field is required; set null if not present or you can't determine it confidently.

{
  "vendor":        string | null,   // merchant name ("Pilot Flying J", "Love's #422", "Walmart")
  "amount":        number | null,   // total paid in USD (parse "$423.56" as 423.56)
  "date":          string | null,   // ISO YYYY-MM-DD; if the receipt shows 4/18/26 or 04/18/2026, return "2026-04-18"
  "category":      string | null,   // EXACTLY one of: "Fuel" | "Maintenance" | "Tolls" | "Insurance" | "Permits" | "Lumper" | "Other"
  "notes":         string | null,   // concise description (<100 chars). Skip for pure fuel; useful for repairs ("oil change + filter"), other ("parking fee at receiver")
  "gallons":       number | null,   // fuel only: gallons pumped (e.g. 90.5)
  "price_per_gal": number | null,   // fuel only: $/gal (e.g. 4.529)
  "odometer":      number | null    // fuel only: odometer reading in miles if shown (strip any trailing units)
}

Rules:
- Category mapping:
  - Fuel pump receipt (has gallons / price per gallon) → "Fuel"
  - Truck stops like Pilot, Flying J, Love's, TA, Petro, Speedway → "Fuel" unless it's clearly a restaurant/merch receipt
  - Truck shop, oil change, tire, repair, parts → "Maintenance"
  - Toll receipts (EZ-Pass, I-Pass, turnpike) → "Tolls"
  - Insurance premium → "Insurance"
  - Permit / IRP / UCR / 2290 → "Permits"
  - Warehouse lumper / detention / pallet fees → "Lumper"
  - Anything else → "Other"
- Fuel fields only when the receipt is Fuel. For non-fuel receipts, leave gallons / price_per_gal / odometer as null.
- vendor: prefer the chain name over the specific store number. "Pilot Travel Center #422" → "Pilot Travel Center #422" is fine, but "PILOT #422" → "Pilot #422" is OK too. Don't invent names.
- amount: always the grand total paid, not subtotal. Includes tax.
- If the image is unreadable / clearly not a receipt, return all-null except a brief notes explaining why.
- When in doubt, return null rather than guessing.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured on the edge function' })
  }

  let body: { image?: string; mime_type?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' })
  }

  const image = typeof body.image === 'string' ? body.image : ''
  if (!image) return json({ error: 'image required (base64, no data: prefix)' })
  const mime = body.mime_type || 'image/jpeg'

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

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
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: image },
            },
            {
              type: 'text',
              text: 'Extract the receipt fields into the JSON object described in the system prompt. Return only the JSON object.',
            },
          ],
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
    console.error('parse-receipt error:', e)
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

// Claude occasionally wraps JSON in ```json fences despite instructions
// to the contrary — strip them defensively before parsing.
function extractJson(text: string): unknown | null {
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
