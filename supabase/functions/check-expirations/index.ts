// Daily cron-triggered edge function. Scans compliance_items, matches each
// against reminder_rules (days_before), and sends APNs push for any (item,
// days_before) pair that hasn't already been delivered. Dedup is enforced by
// a unique (compliance_item_id, days_before) index on reminder_deliveries.
//
// Secrets expected (set via `supabase secrets set …`):
//   APNS_KEY_P8        – contents of the AuthKey .p8 file (PEM string)
//   APNS_KEY_ID        – 10-char Key ID from Apple Developer
//   APNS_TEAM_ID       – 10-char Team ID
//   APNS_BUNDLE_ID     – e.g. com.driventransportation.driver
//   APNS_ENV           – 'production' | 'development' (defaults to development)
//
// Missing APNs secrets → function still runs end-to-end: it logs the
// would-be-sent notification and records a delivery row with recipients=0.
// That lets you verify the cron + dedup before wiring APNs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { signApnsJwt, sendApnsPush } from './apns.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const APNS_KEY_P8 = Deno.env.get('APNS_KEY_P8') ?? ''
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') ?? ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') ?? ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.driventransportation.driver'
const APNS_ENV = (Deno.env.get('APNS_ENV') ?? 'development') as 'production' | 'development'

type EntityType = 'driver' | 'truck' | 'company'

interface ComplianceItem {
  id: string
  entity_type: EntityType
  entity_id: string | null
  kind: string
  expires_at: string
}

interface ReminderRule {
  kind: string | null
  days_before: number[]
}

const KIND_LABEL: Record<string, string> = {
  cdl: 'CDL',
  medical_card: 'DOT medical card',
  hazmat_endorsement: 'HazMat endorsement',
  twic: 'TWIC card',
  tsa_precheck: 'TSA PreCheck',
  annual_dot_inspection: 'Annual DOT inspection',
  registration: 'Vehicle registration',
  irp_apportioned_plate: 'IRP apportioned plate',
  liability_insurance: 'Liability insurance',
  cargo_insurance: 'Cargo insurance',
  ucr: 'UCR registration',
  ifta_decal: 'IFTA decal',
  drug_alcohol_consortium: 'Drug & alcohol consortium',
}

function buildMessage(kind: string, daysLeft: number) {
  const label = KIND_LABEL[kind] ?? kind
  if (daysLeft < 0) {
    const overdue = Math.abs(daysLeft)
    return {
      title: `${label} expired`,
      body: overdue === 1 ? `Expired yesterday — renew immediately.` : `Expired ${overdue} days ago — renew immediately.`,
    }
  }
  if (daysLeft === 0) return { title: `${label} expires today`, body: 'Renew today to stay compliant.' }
  if (daysLeft === 1) return { title: `${label} expires tomorrow`, body: 'Final day — renew now.' }
  return { title: `${label} expires in ${daysLeft} days`, body: 'Plan your renewal soon.' }
}

function daysBetween(a: Date, b: Date) {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
       - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  return Math.round(ms / 86_400_000)
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const today = new Date()

  const [itemsRes, rulesRes, alreadyRes] = await Promise.all([
    supabase.from('compliance_items').select('id, entity_type, entity_id, kind, expires_at'),
    supabase.from('reminder_rules').select('kind, days_before'),
    supabase.from('reminder_deliveries').select('compliance_item_id, days_before'),
  ])

  if (itemsRes.error) return json({ ok: false, step: 'items', error: itemsRes.error.message }, 500)
  if (rulesRes.error) return json({ ok: false, step: 'rules', error: rulesRes.error.message }, 500)
  if (alreadyRes.error) return json({ ok: false, step: 'deliveries', error: alreadyRes.error.message }, 500)

  const items = (itemsRes.data ?? []) as ComplianceItem[]
  const rules = (rulesRes.data ?? []) as ReminderRule[]
  const already = new Set(
    (alreadyRes.data ?? []).map(r => `${r.compliance_item_id}:${r.days_before}`),
  )

  const globalRule = rules.find(r => r.kind === null)?.days_before ?? [90, 60, 30, 7, 0, -1]
  const ruleFor = (kind: string) =>
    rules.find(r => r.kind === kind)?.days_before ?? globalRule

  // Cache APNs JWT once per run. Apple requires the token to be ≤ 60 minutes old.
  let apnsJwt: string | null = null
  if (APNS_KEY_P8 && APNS_KEY_ID && APNS_TEAM_ID) {
    try {
      apnsJwt = await signApnsJwt({ keyP8: APNS_KEY_P8, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID })
    } catch (e) {
      console.error('apns jwt sign failed', e)
    }
  }

  const summary = { scanned: items.length, fired: 0, sentPush: 0, skipped: 0 }

  for (const item of items) {
    const expires = new Date(item.expires_at + 'T00:00:00Z')
    const daysLeft = daysBetween(today, expires)
    const targets = ruleFor(item.kind)
    if (!targets.includes(daysLeft)) { summary.skipped++; continue }

    const dedupKey = `${item.id}:${daysLeft}`
    if (already.has(dedupKey)) { summary.skipped++; continue }

    const { title, body } = buildMessage(item.kind, daysLeft)

    const recipients = await resolveTokens(supabase, item)
    let sent = 0

    if (apnsJwt && recipients.length > 0) {
      for (const tok of recipients) {
        try {
          const ok = await sendApnsPush({
            jwt: apnsJwt,
            deviceToken: tok,
            bundleId: APNS_BUNDLE_ID,
            env: APNS_ENV,
            title,
            body,
            data: { complianceItemId: item.id, kind: item.kind, daysLeft },
          })
          if (ok) sent++
        } catch (e) {
          console.error('apns send failed', e)
        }
      }
    } else {
      console.log('[dry-run]', { title, body, recipients: recipients.length, reason: apnsJwt ? 'no recipients' : 'no APNs secrets' })
    }

    const { error: delErr } = await supabase.from('reminder_deliveries').insert({
      compliance_item_id: item.id,
      days_before: daysLeft,
      recipients: sent,
    })
    if (delErr) console.error('delivery insert failed', delErr)

    summary.fired++
    summary.sentPush += sent
  }

  return json({ ok: true, ...summary })
})

// Find auth user_ids that should receive a push for this item, then gather
// all their iOS device_tokens. Rules:
//   entity_type='driver'  → the driver.user_id only
//   entity_type='truck'   → every user that has a device_token (owner app users)
//   entity_type='company' → every user that has a device_token
async function resolveTokens(supabase: ReturnType<typeof createClient>, item: ComplianceItem): Promise<string[]> {
  if (item.entity_type === 'driver' && item.entity_id) {
    const { data } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', item.entity_id)
      .maybeSingle()
    const userId = (data as { user_id: string | null } | null)?.user_id
    if (!userId) return []
    const { data: toks } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId)
      .eq('platform', 'ios')
    return (toks ?? []).map((r: { token: string }) => r.token)
  }
  // truck / company → everyone registered
  const { data: toks } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('platform', 'ios')
  return (toks ?? []).map((r: { token: string }) => r.token)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
