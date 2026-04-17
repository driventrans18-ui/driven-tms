// APNs helpers: sign an ES256 JWT with an Apple AuthKey (.p8) and post an
// HTTP/2 alert-style notification to api.push.apple.com.
//
// Apple's provider auth reference:
//   https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns

interface SignArgs {
  keyP8: string   // PEM string, BEGIN PRIVATE KEY…END PRIVATE KEY
  keyId: string
  teamId: string
}

export async function signApnsJwt({ keyP8, keyId, teamId }: SignArgs): Promise<string> {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) }

  const enc = (obj: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(obj)))

  const unsigned = `${enc(header)}.${enc(payload)}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
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

export async function sendApnsPush(a: PushArgs): Promise<boolean> {
  const host = a.env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
  const url = `https://${host}/3/device/${a.deviceToken}`
  const payload = {
    aps: {
      alert: { title: a.title, body: a.body },
      sound: 'default',
      'thread-id': 'compliance',
    },
    ...(a.data ?? {}),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${a.jwt}`,
      'apns-topic': a.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (res.status === 200) return true
  const text = await res.text().catch(() => '')
  console.error('apns rejected', res.status, text)
  return false
}

// ── helpers ────────────────────────────────────────────────────────────────

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
