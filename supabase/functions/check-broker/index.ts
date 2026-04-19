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

// Parse the SAFER carrier-snapshot HTML. SAFER's markup is inconsistent
// — sometimes <TH>Label:</TH><TD>value</TD>, sometimes with nested <FONT>
// tags, and the company name sits bare inside a <B> tag above the table.
// This parser uses indexOf-based lookup (find the label text, then the
// NEXT <TD>…</TD>) rather than strict adjacency regex, which tolerates
// all of SAFER's quirks.
function parseSnapshot(html: string): BrokerSnapshot {
  // SAFER wraps every label in an anchor: <TH><A ...>Label:</A></TH>
  // so the match has to tolerate that. No tolerant fallback — if we
  // can't find the labeled TH/TD pair the field genuinely isn't on the
  // page (intrastate carriers have fewer rows than brokers/for-hire),
  // and a looser match false-positives onto neighbouring cells.
  const findValue = (label: string): string | null => {
    const re = new RegExp(
      `<TH[^>]*>\\s*(?:<A[^>]*>)?\\s*${escapeRegex(label)}\\s*:?\\s*(?:</A>)?\\s*</TH>\\s*<TD[^>]*>([\\s\\S]*?)</TD>`,
      'i',
    )
    const m = re.exec(html)
    return m ? cleanText(m[1]) : null
  }

  // Company name lives in a bare <B>…</B> in the snapshot header above
  // the data table. Pattern: <B>NAME</B><br>…USDOT Number:
  const headerName = html.match(/<B>([A-Z][^<]{2,})<\/B>\s*<br>\s*USDOT Number:/i)?.[1]
  const headerDot  = html.match(/USDOT Number:\s*(\d+)/i)?.[1]

  // OOS rates live in a Safety table. Row labels look like
  // <TH scope="row">Vehicle</TH> or <TH ...>Vehicle </TH> (with a trailing
  // space) or <TH ...>Vehicle Inspections</TH> depending on the carrier.
  // Look for the label at a word boundary inside a TH, then search
  // forward for the first "N.N%" within ~600 chars.
  const nearbyPercent = (label: string): number | null => {
    const labelRe = new RegExp(`<TH[^>]*>\\s*${escapeRegex(label)}\\b[^<]*</TH>`, 'gi')
    let match: RegExpExecArray | null
    while ((match = labelRe.exec(html)) !== null) {
      const window = html.slice(match.index, match.index + 600)
      const pct = window.match(/>\s*(\d{1,3}(?:\.\d+)?)\s*%/)
      if (pct) return parseFloat(pct[1])
    }
    return null
  }

  const powerUnitsRaw = findValue('Power Units')
  const driversRaw    = findValue('Drivers')

  return {
    mc_number:        null,
    dot_number:       headerDot ?? findValue('USDOT Number'),
    legal_name:       headerName ?? findValue('Legal Name'),
    dba_name:         findValue('DBA Name'),
    physical_address: findValue('Physical Address'),
    phone:            findValue('Phone'),
    entity_type:      findValue('Entity Type'),
    operating_status: findValue('Operating Status') ?? findValue('Operating Authority Status'),
    mcs150_date:      findValue('MCS-150 Form Date'),
    oos_rate_vehicle: nearbyPercent('Vehicle'),
    oos_rate_driver:  nearbyPercent('Driver'),
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
    // Drop entire <A>…</A> blocks first — some SAFER TD cells append a
    // "click here for details" link to the real value, and we don't
    // want that helper text bleeding into the output.
    .replace(/<A\b[^>]*>[\s\S]*?<\/A>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > 0 ? stripped : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
