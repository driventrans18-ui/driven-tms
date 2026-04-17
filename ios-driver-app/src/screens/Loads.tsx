import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import type { Driver } from '../hooks/useDriver'

interface LoadDetail extends LoadCardLoad {
  created_at: string
  brokers: { id: string; name: string; phone: string | null } | null
}

const TABS: Array<LoadDetail['status'] | 'All'> = ['All', 'Assigned', 'In Transit', 'Delivered']

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Loads({ driver }: { driver: Driver }) {
  const [tab, setTab] = useState<typeof TABS[number]>('All')
  const [open, setOpen] = useState<LoadDetail | null>(null)

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['my-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, rate, miles, status, eta, load_type, created_at, brokers(id, name, phone)')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as LoadDetail[]
    },
  })

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)

  return (
    <div>
      <div className="flex gap-1 bg-white rounded-xl p-1 mb-4">
        {TABS.map(t => {
          const on = t === tab
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
              {t}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No loads.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => <LoadCard key={l.id} load={l} onTap={() => setOpen(l)} />)}
        </div>
      )}

      {open && <LoadSheet load={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function LoadSheet({ load, onClose }: { load: LoadDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{load.load_number || `#${load.id.slice(0, 8)}`}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <dl className="space-y-3 text-base">
          <Row k="Status" v={load.status} />
          <Row k="Origin" v={[load.origin_city, load.origin_state].filter(Boolean).join(', ') || '—'} />
          <Row k="Destination" v={[load.dest_city, load.dest_state].filter(Boolean).join(', ') || '—'} />
          <Row k="Broker" v={load.brokers?.name ?? '—'} />
          <Row k="Type" v={load.load_type ?? '—'} />
          <Row k="Miles" v={load.miles != null ? load.miles.toLocaleString() : '—'} />
          <Row k="Rate" v={load.rate != null ? '$' + load.rate.toLocaleString() : '—'} />
          <Row k="ETA" v={fmtDate(load.eta)} />
        </dl>
        {load.brokers?.phone && (
          <a href={`tel:${load.brokers.phone}`}
            className="block mt-6 py-3.5 rounded-xl text-center text-white text-base font-semibold"
            style={{ background: '#c8410a' }}>
            Call {load.brokers.name}
          </a>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
      <dt className="text-sm text-gray-500">{k}</dt>
      <dd className="text-base text-gray-900 font-medium">{v}</dd>
    </div>
  )
}
