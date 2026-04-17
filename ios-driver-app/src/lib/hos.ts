// Simplified HOS clock: 11 hours of driving before a required 10-hour break.
// We treat the current open `driving` event (ended_at = null) as the active
// segment; previous driving time in the last 24 hours gets added to it.

export const DRIVE_LIMIT_MS = 11 * 60 * 60 * 1000
export const WARN_THRESHOLDS_MS = [2 * 60 * 60 * 1000, 60 * 60 * 1000, 30 * 60 * 1000]

export type HosStatus = 'off_duty' | 'sleeper' | 'driving' | 'on_duty'

export interface HosEvent {
  id: string
  driver_id: string
  status: HosStatus
  started_at: string
  ended_at: string | null
}

export interface HosSummary {
  driving: boolean
  drivenMs: number
  remainingMs: number
  warning: 'ok' | '2h' | '1h' | '30m' | 'expired'
}

export function computeHos(events: HosEvent[], now = Date.now()): HosSummary {
  // Sum driving time from events in the last 24 hours.
  const horizon = now - 24 * 60 * 60 * 1000
  let drivenMs = 0
  let driving = false
  for (const e of events) {
    if (e.status !== 'driving') continue
    const start = Math.max(new Date(e.started_at).getTime(), horizon)
    const end = e.ended_at ? new Date(e.ended_at).getTime() : now
    if (end > start) drivenMs += end - start
    if (!e.ended_at) driving = true
  }
  const remainingMs = Math.max(0, DRIVE_LIMIT_MS - drivenMs)
  let warning: HosSummary['warning'] = 'ok'
  if (remainingMs === 0) warning = 'expired'
  else if (remainingMs <= 30 * 60 * 1000) warning = '30m'
  else if (remainingMs <= 60 * 60 * 1000) warning = '1h'
  else if (remainingMs <= 2 * 60 * 60 * 1000) warning = '2h'
  return { driving, drivenMs, remainingMs, warning }
}

export function fmtHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
