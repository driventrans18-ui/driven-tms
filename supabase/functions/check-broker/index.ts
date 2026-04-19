// Broker FMCSA lookup. Accepts an MC number (or DOT number), fetches the
// carrier snapshot from SAFER's public endpoint, scrapes the key fields,
// and returns a typed JSON object the iOS quick-add broker form can use
// to pre-fill name/phone/address and flag risky carriers.
//
// No FMCSA API key required — this hits the same HTML page any driver can
// see at safer.fmcsa.dot.gov. Parsing is tolerant of whitespace and minor
// markup changes; if FMCSA reshuffles the page we return a clear error
// rather than garbage.
//
// Why server-side: the SAFER endpoint blocks browser fetches via CORS,
// and the extension into QCMobile (if we ever need richer data) needs a
// webKey we don't want on the phone.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BrokerSnapshot {
  mc_number:     string | null
  dot_number:    string | null
  legal_name:    string | null
  dba_name:      string | null
  physical_address: string | null
  phone:         string | null
  entity_type:   string | null   // e.g. "CARRIER", "BROKER"
  operating_status: string | null  // e.g. "AUTHORIZED FOR Property", "OUT-OF-SERVICE"
  mcs150_date:   string | null
  oos_rate_vehicle: number | null  // 0-100 (%)
  oos_rate_driver:  number | null
  power_units:   number | null
  drivers:       number | null
  /** Opinionated summary flag the client can use to render a warning chip. */
  risk_flags: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  // The Supabase functions client throws on any non-2xx and swallows the
  // body, so we always return 200 and put any error text in `{ error }`.
  // Callers discriminate on the body shape.
  if (req.method !== 'POST') return json({ error: 'POST required' })

  let body: { mc_number?: string; dot_number?: string; debug?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' })
  }

  const mc  = (body.mc_number  ?? '').replace(/\D/g, '')
  const dot = (body.dot_number ?? '').replace(/\D/g, '')
  const debug = body.debug === true
  if (!mc && !dot) return json({ error: 'mc_number or dot_number required' })

  // SAFER carrier snapshot. The form that drives this page uses POST, not
  // GET — a GET returns a redirect/landing page, not the snapshot. Either
  // MC or USDOT works as the query_param.
  const param = mc ? 'MC_MX' : 'USDOT'
  const value = mc || dot
  const form = new URLSearchParams({
    searchtype: 'ANY',
    query_type: 'queryCarrierSnapshot',
    query_param: param,
    query_string: value,
  })

  try {
    const res = await fetch('https://safer.fmcsa.dot.gov/query.asp', {
      method: 'POST',
      headers: {
        'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept':        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Content-Type':  'application/x-www-form-urlencoded',
        'Referer':       'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx',
      },
      body: form.toString(),
    })
    if (!res.ok) {
      return json({ error: `SAFER returned ${res.status}` })
    }
    const html = await res.text()

    // Debug mode — returns a chunk of HTML around each key label so we
    // can see the actual markup surrounding the values we want to
    // extract. Call with { "mc_number": "...", "debug": true }.
    if (debug) {
      const around = (label: string, before = 100, after = 400): string | null => {
        const idx = html.toLowerCase().indexOf(label.toLowerCase())
        if (idx === -1) return null
        return html.slice(Math.max(0, idx - before), idx + after)
      }
      return json({
        html_length: html.length,
        around_legal_name:      around('Legal Name'),
        around_dba_name:        around('DBA Name'),
        around_physical_addr:   around('Physical Address'),
        around_phone:           around('Phone'),
        around_operating_status: around('Operating Status'),
        around_entity_type:     around('Entity Type'),
        around_power_units:     around('Power Units'),
        around_drivers:         around('Drivers'),
        around_out_of_service:  around('Out of Service'),
      })
    }

    if (/Record Not Found/i.test(html)) {
      return json({ error: 'No FMCSA record for that MC/DOT number' })
    }
    if (!/Legal Name/i.test(html)) {
      const preview = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
      return json({ error: `SAFER returned an unexpected page: ${preview || '(empty)'}` })
    }

    const snap = parseSnapshot(html)
    snap.mc_number  = mc || snap.mc_number
    snap.dot_number = dot || snap.dot_number
    snap.risk_flags = deriveRiskFlags(snap)
    return json({ snapshot: snap })
  } catch (e) {
    console.error('check-broker error:', e)
    const msg = e instanceof Error ? e.message : 'lookup failed'
    return json({ error: msg })
  }
})

// Always respond 200 with an { error } body instead of 4xx/5xx — the
// Supabase client throws on non-2xx and swallows the body, so errors the
// UI needs to show (e.g. "No FMCSA record") never reach it. Status is
// only overridden for true HTTP errors.
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

// Parse the SAFER carrier-snapshot HTML. Each field sits in a <TD> labeled
// by the preceding <TH>; the tolerant regex handles whitespace and the
// nbsp-heavy formatting SAFER emits.
function parseSnapshot(html: string): BrokerSnapshot {
  const get = (label: string): string | null => {
    const re = new RegExp(
      `<TH[^>]*>\\s*${escapeRegex(label)}\\s*:?\\s*</TH>\\s*<TD[^>]*>([\\s\\S]*?)</TD>`,
      'i',
    )
    const m = html.match(re)
    if (!m) return null
    return cleanText(m[1])
  }

  const powerUnitsRaw = get('Power Units')
  const driversRaw    = get('Drivers')
  const vehOOSRaw     = html.match(/Vehicle\s*[\s\S]*?(\d{1,3}(?:\.\d+)?)\s*%/i)?.[1]
  const drvOOSRaw     = html.match(/Driver\s*[\s\S]*?(\d{1,3}(?:\.\d+)?)\s*%/i)?.[1]

  return {
    mc_number:        null,
    dot_number:       get('USDOT Number'),
    legal_name:       get('Legal Name'),
    dba_name:         get('DBA Name'),
    physical_address: get('Physical Address'),
    phone:            get('Phone'),
    entity_type:      get('Entity Type'),
    operating_status: get('Operating Status'),
    mcs150_date:      get('MCS-150 Form Date'),
    oos_rate_vehicle: vehOOSRaw ? parseFloat(vehOOSRaw) : null,
    oos_rate_driver:  drvOOSRaw ? parseFloat(drvOOSRaw) : null,
    power_units:      powerUnitsRaw ? parseInt(powerUnitsRaw.replace(/\D/g, ''), 10) || null : null,
    drivers:          driversRaw    ? parseInt(driversRaw.replace(/\D/g, ''),    10) || null : null,
    risk_flags:       [],
  }
}

function deriveRiskFlags(s: BrokerSnapshot): string[] {
  const flags: string[] = []
  if (s.operating_status && /out.of.service/i.test(s.operating_status)) flags.push('out_of_service')
  if (s.operating_status && /not authorized/i.test(s.operating_status)) flags.push('not_authorized')
  if (s.oos_rate_vehicle != null && s.oos_rate_vehicle >= 20) flags.push('high_vehicle_oos')
  if (s.oos_rate_driver  != null && s.oos_rate_driver  >= 10) flags.push('high_driver_oos')
  if (!s.legal_name) flags.push('no_name_on_record')
  return flags
}

function cleanText(raw: string): string | null {
  const stripped = raw
    .replace(/<[^>]+>/g, ' ')    // strip inner tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > 0 ? stripped : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
