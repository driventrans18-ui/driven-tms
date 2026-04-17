import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Pending:      '#9ca3af', // gray
  Assigned:     '#f59e0b', // amber
  'In Transit': '#3b82f6', // blue
  Delivered:    '#16a34a', // green
}

// Day of the month the load "belongs to" — prefer pickup_at, then eta,
// then created_at. All normalized to local YYYY-MM-DD.
function loadDayKey(l: CalLoad): string {
  const raw = l.pickup_at ?? l.eta ?? l.created_at
  const d = new Date(raw)
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

  // Pull anything in the current visible month (plus a small buffer) so
  // cells can show dots immediately.
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

  // Build an index of yyyy-mm-dd → loads that day.
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

  // 42-cell grid (6 weeks) starting from the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const start = startOfMonth(cursor)
    const startDay = start.getDay() // 0 = Sun
    const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - startDay)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const isInCurrentMonth = (d: Date) => d.getMonth() === cursor.getMonth()
  const todayKey = (() => {
    const t = new Date(); const y = t.getFullYear(); const m = (t.getMonth()+1).toString().padStart(2,'0'); const d = t.getDate().toString().padStart(2,'0'); return `${y}-${m}-${d}`
  })()

  const selectedLoads = selected ? (byDay.get(selected) ?? []) : []

  const prev = () => setCursor(c => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)))
  const next = () => setCursor(c => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)))

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="w-8 h-8 flex items-center justify-center text-gray-500 text-lg cursor-pointer">‹</button>
        <span className="text-sm font-semibold text-gray-900">{monthLabel(cursor)}</span>
        <button onClick={next} className="w-8 h-8 flex items-center justify-center text-gray-500 text-lg cursor-pointer">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="text-[10px] text-gray-400 text-center font-medium">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const k = (() => {
            const y = d.getFullYear(); const m = (d.getMonth()+1).toString().padStart(2,'0'); const day = d.getDate().toString().padStart(2,'0'); return `${y}-${m}-${day}`
          })()
          const inMonth = isInCurrentMonth(d)
          const dayLoads = byDay.get(k) ?? []
          const isToday = k === todayKey
          const isSel = k === selected
          return (
            <button
              key={i}
              onClick={() => setSelected(dayLoads.length > 0 ? k : null)}
              disabled={dayLoads.length === 0}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm cursor-pointer disabled:cursor-default ${
                isSel ? 'ring-2 ring-[#c8410a]' : ''
              }`}
              style={{
                color: inMonth ? (isToday ? '#c8410a' : '#111827') : '#d1d5db',
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

      {selectedLoads.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            {new Date(selected!).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
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
      )}
    </div>
  )
}
