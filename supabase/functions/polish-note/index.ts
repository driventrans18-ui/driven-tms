// Trucker dock-note polisher. Client POSTs `{ raw_text, kind }` where kind
// is 'pickup' or 'delivery'; we hand the blob to Claude Haiku 4.5 and
// return a tight 1-2 sentence version matching the existing short-form
// convention in pickup_notes / delivery_notes fields.
//
// Why Haiku: 2-sentence rewrites are cheap, fast, and don't need Sonnet's
// reasoning depth. Critical fields (times, dock numbers) stay verbatim.
//
// Secrets: ANTHROPIC_API_KEY (plus SUPABASE_URL + SERVICE_ROLE_KEY for
// the usage log).

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.65.0'
import { logUsage, extractJson, CORS_HEADERS } from '../_shared/logUsage.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 300

const SYSTEM_PROMPT = `You polish raw dock notes from a truck driver into tight, useful notes for a TMS.

You will receive one text blob and a kind ('pickup' or 'delivery'). The blob is usually iOS dictation — rambling, filler words, incomplete sentences. Return the cleanest possible 1-2 sentence version.

Return ONLY a single JSON object — no prose, no markdown fences:

{ "polished": string }

Rules:
- Keep it under 200 characters when possible, never over 280.
- Use imperative, operational voice. Third person. No "I", no "we".
- KEEP VERBATIM: times (0940, 9:40am), appointment numbers, dock / door / bay numbers, PO / BOL / reference numbers, named people ("Mike at receiver").
- STRIP: filler ("uh", "like", "kind of"), redundant framing ("just so you know"), courtesy ("thanks"), speculation ("maybe", "I think").
- Translate rambling duration phrases to concise forms: "waited like two hours" → "detention ~2 hrs".
- Pickup focus: dock/door, appointment vs FCFS, load type, shipper quirks.
- Delivery focus: arrival time, detention, damage, lumper, seal #, receiver quirks.
- If the input is essentially empty or just "ok"/"done", return it unchanged.
- If the input is already concise and clean, return it unchanged.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'POST required' })

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' })

  let body: { raw_text?: string; kind?: 'pickup' | 'delivery' }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }) }

  const raw = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!raw) return json({ error: 'raw_text required' })
  if (raw.length > 2000) return json({ error: 'raw_text too long (max 2000 chars)' })

  const kind = body.kind === 'pickup' || body.kind === 'delivery' ? body.kind : 'delivery'

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
          text: `Kind: ${kind}\n\nRaw note:\n${raw}\n\nReturn only the JSON object.`,
        }],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return json({ error: 'Claude returned no text block' })
    const parsed = extractJson(textBlock.text) as { polished?: string } | null
    if (!parsed || typeof parsed.polished !== 'string') {
      return json({ error: 'Claude response was not valid JSON', raw: textBlock.text })
    }

    const usage = {
      input:       response.usage.input_tokens,
      output:      response.usage.output_tokens,
      cache_read:  response.usage.cache_read_input_tokens  ?? 0,
      cache_write: response.usage.cache_creation_input_tokens ?? 0,
    }
    logUsage(req, 'polish-note', MODEL, usage).catch(err =>
      console.error('claude_usage insert failed:', err)
    )

    return json({ polished: parsed.polished.trim(), usage })
  } catch (e) {
    console.error('polish-note error:', e)
    return json({ error: e instanceof Error ? e.message : 'polish failed' })
  }
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}
