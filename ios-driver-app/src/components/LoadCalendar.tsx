import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

type LoadStatus = 'Pending' | 'Assigned' | 'In Transit' | 'Delivered'

interface CalLoad {
  id: string
  load_number: string | null
  origin_city: string | null
  origin_state: string | null
  dest_city: string | null
  dest_state: string | null
  status: LoadStatus
  rate: number | null
  pickup_at: string | null
  eta: string | null
  created_at: string
}

const STATUS_DOT: Record<LoadStatus, string> = {
  Pending:      '#9ca3af',
  Assigned:     '#f59e0b',
  'In Transit': '#3b82f6',
  Delivered:    '#16a34a',
}

// Day of the month the load "belongs to" — prefer pickup_at, then eta,
// then created_at. All normalized to local YYYY-MM-DD.
function loadDayKey(l: CalLoad): string {
  const raw = l.pickup_at ?? l.eta ?? l.created_at
  return toKey(new Date(raw))
}

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthLabel(d: Date) {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function startOfMonth(d: Date) {
  const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x
}

export function LoadCalendar({ driverId }: { driverId: string }) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const { data: loads = [] } = useQuery({
    queryKey: ['calendar-loads', driverId, cursor.getFullYear(), cursor.getMonth()],
    queryFn: async () => {
      const from = new Date(cursor); from.setDate(from.getDate() - 7)
      const to   = new Date(cursor); to.setMonth(to.getMonth() + 1); to.setDate(to.getDate() + 7)
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, status, rate, pickup_at, eta, created_at')
        .eq('driver_id', driverId)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
      if (error) throw error
      return (data ?? []) as CalLoad[]
    },
  })

  const byDay = useMemo(() => {
    const map = new Map<string, CalLoad[]>()
    for (const l of loads) {
      const k = loadDayKey(l)
      const arr = map.get(k) ?? []
      arr.push(l)
      map.set(k, arr)
    }
    return map
  }, [loads])

  const cells = useMemo(() => {
    const start = startOfMonth(cursor)
    const startDay = start.getDay()
    const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - startDay)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const isInCurrentMonth = (d: Date) => d.getMonth() === cursor.getMonth()
  const todayKey = toKey(new Date())

  const selectedLoads = selected ? (byDay.get(selected) ?? []) : []

  const prev = () => setCursor(c => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)))
  const next = () => setCursor(c => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)))

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} aria-label="Previous month" className="w-10 h-10 flex items-center justify-center text-gray-500 text-lg cursor-pointer">‹</button>
        <span className="text-sm font-semibold text-gray-900">{monthLabel(cursor)}</span>
        <button onClick={next} aria-label="Next month" className="w-10 h-10 flex items-center justify-center text-gray-500 text-lg cursor-pointer">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="text-[10px] text-gray-400 text-center font-medium">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const k = toKey(d)
          const inMonth = isInCurrentMonth(d)
          const dayLoads = byDay.get(k) ?? []
          const isToday = k === todayKey
          const isSel = k === selected
          return (
            <button
              key={i}
              // Every cell is tappable now — empty days open the add-load flow
              // so the driver can back-fill ("I forgot to log Tuesday").
              onClick={() => setSelected(isSel ? null : k)}
              aria-label={`${d.toDateString()}${dayLoads.length ? `, ${dayLoads.length} load${dayLoads.length === 1 ? '' : 's'}` : ''}`}
              aria-pressed={isSel}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm cursor-pointer ${
                isSel ? 'ring-2 ring-[var(--color-brand-500)]' : ''
              }`}
              style={{
                color: inMonth ? (isToday ? 'var(--color-brand-500)' : '#111827') : '#d1d5db',
                fontWeight: isToday ? 700 : 500,
                background: isSel ? 'rgba(200,65,10,0.06)' : 'transparent',
              }}
            >
              <span>{d.getDate()}</span>
              <span className="flex gap-0.5 mt-0.5 h-1.5">
                {dayLoads.slice(0, 3).map((l, idx) => (
                  <span key={idx} className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[l.status] }} />
                ))}
                {dayLoads.length > 3 && <span className="text-[8px] text-gray-400 leading-none">+</span>}
              </span>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              {new Date(selected).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <button
              onClick={() => setAdding(true)}
              className="text-xs font-semibold text-[var(--color-brand-500)] active:opacity-70 cursor-pointer"
            >
              + Add load
            </button>
          </div>
          {selectedLoads.length > 0 ? (
            <div className="space-y-1.5">
              {selectedLoads.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[l.status] }} />
                  <span className="text-gray-700 flex-1 truncate">
                    {l.load_number || `#${l.id.slice(0, 8)}`} · {[l.origin_city, l.dest_city].filter(Boolean).join(' → ') || '—'}
                  </span>
                  <span className="text-gray-500 text-xs">{l.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No loads yet. Tap + Add load to record one.</p>
          )}
        </div>
      )}

      {adding && selected && (
        <AddLoadForDateSheet
          dateKey={selected}
          driverId={driverId}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

// ── Add-load-for-date sheet ──────────────────────────────────────────────────

// Minimal backfill sheet. Defaults pickup_at to 09:00 and deliver_by to 17:00
// on the selected date, and defaults status based on whether the date is in
// the past (Delivered) or not (Pending). The full edit form remains available
// under the Loads tab for anything this doesn't cover.
function AddLoadForDateSheet({
  dateKey, driverId, onClose,
}: {
  dateKey: string
  driverId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const dayDate = new Date(dateKey + 'T00:00:00')
  const isPast = dayDate < new Date(new Date().setHours(0, 0, 0, 0))

  const [form, setForm] = useState({
    load_number:  '',
    origin_city:  '',
    origin_state: '',
    dest_city:    '',
    dest_state:   '',
    miles:        '',
    rate:         '',
    broker_id:    '',
    status:       (isPast ? 'Delivered' : 'Pending') as LoadStatus,
    notes:        '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('brokers').select('id, name').order('name')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const pickupAt  = new Date(dateKey + 'T09:00:00').toISOString()
      const deliverBy = new Date(dateKey + 'T17:00:00').toISOString()
      const payload = {
        driver_id:    driverId,
        load_number:  form.load_number || null,
        origin_city:  form.origin_city || null,
        origin_state: form.origin_state || null,
        dest_city:    form.dest_city   || null,
        dest_state:   form.dest_state  || null,
        miles:        form.miles ? Number(form.miles) : null,
        rate:         form.rate  ? Number(form.rate)  : null,
        broker_id:    form.broker_id || null,
        status:       form.status,
        pickup_at:    pickupAt,
        deliver_by:   deliverBy,
        eta:          dateKey,
        delivery_notes: form.notes || null,
      }
      const { error } = await supabase.from('loads').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['my-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['active-load', driverId] })
      qc.invalidateQueries({ queryKey: ['driver-summary', driverId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSubmit = !save.isPending && (form.origin_city || form.dest_city || form.load_number)
  const prettyDate = dayDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby="add-load-for-date-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="add-load-for-date-title" className="text-lg font-bold text-gray-900">Add load</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{prettyDate}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Load #</label>
            <input
              value={form.load_number}
              onChange={e => set('load_number', e.target.value)}
              placeholder="LD-1042"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>

          <div className="grid grid-cols-[1fr_72px] gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origin city</label>
              <input
                value={form.origin_city}
                onChange={e => set('origin_city', e.target.value)}
                placeholder="Webster"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input
                value={form.origin_state}
                onChange={e => set('origin_state', e.target.value.toUpperCase().slice(0, 2))}
                placeholder="NY"
                className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base uppercase"
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_72px] gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination city</label>
              <input
                value={form.dest_city}
                onChange={e => set('dest_city', e.target.value)}
                placeholder="Columbus"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input
                value={form.dest_state}
                onChange={e => set('dest_state', e.target.value.toUpperCase().slice(0, 2))}
                placeholder="OH"
                className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Miles</label>
              <input
                type="number" inputMode="numeric" placeholder="0"
                value={form.miles}
                onChange={e => set('miles', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rate ($)</label>
              <input
                type="number" inputMode="decimal" placeholder="0.00"
                value={form.rate}
                onChange={e => set('rate', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Broker</label>
            <select
              value={form.broker_id}
              onChange={e => set('broker_id', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            >
              <option value="">— None —</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Status</label>
            <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1">
              {(['Pending', 'Assigned', 'In Transit', 'Delivered'] as LoadStatus[]).map(s => {
                const on = form.status === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('status', s)}
                    className="py-2 rounded-lg text-xs font-medium cursor-pointer"
                    style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={!canSubmit}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {save.isPending ? 'Saving…' : 'Save Load'}
        </button>
      </div>
    </div>
  )
}
