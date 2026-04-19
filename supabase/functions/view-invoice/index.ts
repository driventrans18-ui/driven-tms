// Invoice open-tracking redirect. The driver embeds a URL like
// https://<project>.supabase.co/functions/v1/view-invoice?id=<uuid>
// in the email / SMS they send. When the recipient clicks:
//   1. Bump last_viewed_at + view_count on the invoice.
//   2. Send an APNs push to the driver's device(s) ("Walmart opened
//      invoice INV-1002").
//   3. 302-redirect the browser to a fresh signed URL for the most
//      recent archived PDF.
//
// No auth required on the recipient side — anyone with the link can
// view the PDF, same as a signed URL. The service-role key below
// lets the function update the counters / read the join graph.
//
// Environment variables (same APNS credentials as check-expirations):
//   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_ENV
//
// The APNs helpers are inlined below so the function can be deployed
// by pasting just this one file into the Supabase dashboard editor.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const APNS_KEY_P8    = Deno.env.get('APNS_KEY_P8') ?? ''
const APNS_KEY_ID    = Deno.env.get('APNS_KEY_ID') ?? ''
const APNS_TEAM_ID   = Deno.env.get('APNS_TEAM_ID') ?? ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.driventransportation.driver'
const APNS_ENV       = (Deno.env.get('APNS_ENV') ?? 'development') as 'production' | 'development'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400, headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve everything we need to (a) format the push body and (b) find
  // the driver's device tokens, in one round-trip.
  const { data: inv } = await supabase.from('invoices')
    .select('id, invoice_number, amount, view_count, loads(driver_id), brokers(name), customers(name)')
    .eq('id', id)
    .maybeSingle()

  // Bump counters even if the full query fails, so we still have a
  // record that someone tried to open the link.
  const prevViewCount = (inv as any)?.view_count ?? 0
  try {
    await supabase.from('invoices').update({
      last_viewed_at: new Date().toISOString(),
      view_count:     prevViewCount + 1,
    }).eq('id', id)
  } catch (e) {
    console.warn('view-invoice: failed to log view', e)
  }

  // Fire the APNs push. Non-fatal: if no credentials / no tokens / send
  // fails, we still redirect the recipient so they can see the PDF.
  if (inv && APNS_KEY_P8 && APNS_KEY_ID && APNS_TEAM_ID) {
    try {
      const driverId = (inv as any).loads?.driver_id as string | undefined
      if (driverId) {
        const { data: drv } = await supabase.from('drivers')
          .select('user_id')
          .eq('id', driverId)
          .maybeSingle()
        const userId = (drv as any)?.user_id as string | undefined
        if (userId) {
          const { data: tokens } = await supabase.from('device_tokens')
            .select('token')
            .eq('user_id', userId)
            .eq('platform', 'ios')
          const list = (tokens ?? []) as { token: string }[]
          if (list.length > 0) {
            const jwt = await signApnsJwt({ keyP8: APNS_KEY_P8, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID })
            const who = (inv as any).customers?.name ?? (inv as any).brokers?.name ?? 'Someone'
            const label = (inv as any).invoice_number || `#${id.slice(0, 8)}`
            const amt = (inv as any).amount != null
              ? '$' + Number((inv as any).amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : ''
            const title = `Invoice ${label} opened`
            const body  = amt ? `${who} opened your invoice for ${amt}` : `${who} opened your invoice`
            await Promise.all(list.map(t =>
              sendApnsPush({
                jwt,
                deviceToken: t.token,
                bundleId:    APNS_BUNDLE_ID,
                env:         APNS_ENV,
                title,
                body,
                data: { invoice_id: id, kind: 'invoice_viewed' },
              }).catch(err => console.warn('apns send failed', err))
            ))
          }
        }
      }
    } catch (e) {
      console.warn('view-invoice: push send failed', e)
    }
  }

  // Find the most recent PDF archived under this invoice's folder.
  const { data: files, error: listErr } = await supabase.storage
    .from('invoice-pdfs')
    .list(id, { limit: 1, sortBy: { column: 'created_at', order: 'desc' } })
  if (listErr || !files || files.length === 0) {
    return new Response('PDF not found — it may not have been generated yet.', { status: 404, headers: CORS })
  }

  const path = `${id}/${files[0].name}`
  const { data: signed, error: signErr } = await supabase.storage
    .from('invoice-pdfs')
    .createSignedUrl(path, 60 * 60) // 1 hour is plenty; recipient opens immediately after clicking
  if (signErr || !signed?.signedUrl) {
    return new Response('Could not sign PDF URL', { status: 500, headers: CORS })
  }

  return Response.redirect(signed.signedUrl, 302)
})

// ── APNs helpers (inlined) ──────────────────────────────────────────────────
// Sign an ES256 JWT with an Apple AuthKey (.p8) and POST an HTTP/2 alert
// notification to api.push.apple.com. Kept in this file so the function
// can be deployed via the Supabase dashboard editor (no shared code).

interface SignArgs { keyP8: string; keyId: string; teamId: string }

async function signApnsJwt({ keyP8, keyId, teamId }: SignArgs): Promise<string> {
  const header  = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) }
  const enc = (obj: unknown) => base64url(new TextEncoder().encode(JSON.stringify(obj)))
  const unsigned = `${enc(header)}.${enc(payload)}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64url(new Uint8Array(sig))}`
}

interface PushArgs {
  jwt: string
  deviceToken: string
  bundleId: string
  env: 'production' | 'development'
  title: string
  body: string
  data?: Record<string, unknown>
}

async function sendApnsPush(a: PushArgs): Promise<boolean> {
  const host = a.env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
  const url  = `https://${host}/3/device/${a.deviceToken}`
  const payload = {
    aps: {
      alert: { title: a.title, body: a.body },
      sound: 'default',
      'thread-id': 'invoice-viewed',
    },
    ...(a.data ?? {}),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization':   `bearer ${a.jwt}`,
      'apns-topic':      a.bundleId,
      'apns-push-type':  'alert',
      'apns-priority':   '10',
      'content-type':    'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (res.status === 200) return true
  const text = await res.text().catch(() => '')
  console.error('apns rejected', res.status, text)
  return false
}

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
