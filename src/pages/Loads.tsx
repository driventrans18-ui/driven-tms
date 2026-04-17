import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = 'Pending' | 'Assigned' | 'In Transit' | 'Delivered'

interface Load {
  id: string
  load_number: string | null
  origin_city: string | null
  origin_state: string | null
  dest_city: string | null
  dest_state: string | null
  load_type: string | null
  miles: number | null
  rate: number | null
  status: LoadStatus
  eta: string | null
  created_at: string
  brokers: { id: string; name: string } | null
  drivers: { id: string; first_name: string | null; last_name: string | null } | null
  trucks: { id: string; unit_number: string | null; make: string | null } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function driverName(d: Load['drivers']) {
  if (!d) return '—'
  return [d.first_name, d.last_name].filter(Boolean).join(' ') || '—'
}

function routeStr(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(', ') || '—'
}

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—'
  return prefix + n.toLocaleString()
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<LoadStatus, string> = {
  Pending:      'bg-gray-100 text-gray-600',
  Assigned:     'bg-orange-100 text-orange-700',
  'In Transit': 'bg-blue-100 text-blue-700',
  Delivered:    'bg-green-100 text-green-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CFG[status as LoadStatus] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

const TABS: Array<LoadStatus | 'All'> = ['All', 'Pending', 'Assigned', 'In Transit', 'Delivered']
const selectCls = "w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]"

// ── Shared field ──────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder = '', type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] transition-colors" />
    </div>
  )
}

// ── New Load Modal ────────────────────────────────────────────────────────────

function NewLoadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    load_number: '',
    origin_city: '', origin_state: '',
    dest_city: '',   dest_state: '',
    load_type: 'Dry Van',
    miles: '', rate: '',
    status: 'Pending' as LoadStatus,
    eta: '',
    broker_id: '', driver_id: '', truck_id: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Fetch dropdown options
  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('brokers').select('id, name').order('name')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, first_name, last_name').order('last_name')
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>
    },
  })
  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('trucks').select('id, unit_number, make').order('unit_number')
      return (data ?? []) as Array<{ id: string; unit_number: string | null; make: string | null }>
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loads').insert({
        load_number:  form.load_number  || null,
        origin_city:  form.origin_city  || null,
        origin_state: form.origin_state || null,
        dest_city:    form.dest_city    || null,
        dest_state:   form.dest_state   || null,
        load_type:    form.load_type,
        miles:        form.miles  ? Number(form.miles)  : null,
        rate:         form.rate   ? Number(form.rate)   : null,
        status:       form.status,
        eta:          form.eta    || null,
        broker_id:    form.broker_id || null,
        driver_id:    form.driver_id || null,
        truck_id:     form.truck_id  || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loads'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSubmit = !mutation.isPending && (form.origin_city || form.dest_city)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">New Load</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          {/* Load # and Status */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Load #" value={form.load_number} onChange={v => set('load_number', v)} placeholder="LD-1042" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                {(['Pending', 'Assigned', 'In Transit', 'Delivered'] as LoadStatus[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Origin */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Origin</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="" value={form.origin_city} onChange={v => set('origin_city', v)} placeholder="City" />
              <Field label="" value={form.origin_state} onChange={v => set('origin_state', v)} placeholder="ST" />
            </div>
          </div>

          {/* Destination */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Destination</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="" value={form.dest_city} onChange={v => set('dest_city', v)} placeholder="City" />
              <Field label="" value={form.dest_state} onChange={v => set('dest_state', v)} placeholder="ST" />
            </div>
          </div>

          {/* Dropdowns */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Broker</label>
              <select value={form.broker_id} onChange={e => set('broker_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Driver</label>
              <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {[d.first_name, d.last_name].filter(Boolean).join(' ') || d.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Truck</label>
              <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {trucks.map(t => (
                  <option key={t.id} value={t.id}>
                    {[t.unit_number, t.make].filter(Boolean).join(' — ') || t.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type / Miles / Rate */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Load Type</label>
              <select value={form.load_type} onChange={e => set('load_type', e.target.value)} className={selectCls}>
                {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'LTL', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Miles" value={form.miles} onChange={v => set('miles', v)} placeholder="0" type="number" />
            <Field label="Rate ($)" value={form.rate} onChange={v => set('rate', v)} placeholder="0.00" type="number" />
          </div>

          <Field label="ETA" value={form.eta} onChange={v => set('eta', v)} type="date" />
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canSubmit}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : 'Create Load'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ load, onClose }: { load: Load; onClose: () => void }) {
  const origin = routeStr(load.origin_city, load.origin_state)
  const dest   = routeStr(load.dest_city,   load.dest_state)

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Load</p>
            <h2 className="text-base font-semibold text-gray-900">{load.load_number || `#${load.id.slice(0,8)}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <StatusBadge status={load.status} />
            {load.load_type && <span className="text-xs text-gray-400">{load.load_type}</span>}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Route</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="text-gray-700">{origin}</span>
              </div>
              <div className="w-px h-3 bg-gray-200 ml-[5px]" />
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#c8410a' }} />
                <span className="text-gray-700">{dest}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Details</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Broker', load.brokers?.name],
                ['Driver', driverName(load.drivers)],
                ['Truck',  load.trucks?.unit_number],
                ['ETA',    fmtDate(load.eta)],
                ['Miles',  fmt(load.miles)],
                ['Rate',   fmt(load.rate, '$')],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </aside>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Loads() {
  const [tab, setTab] = useState<LoadStatus | 'All'>('All')
  const [selected, setSelected] = useState<Load | null>(null)
  const [showModal, setShowModal] = useState(false)

  const { data: loads = [], isLoading, isError } = useQuery({
    queryKey: ['loads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loads')
        .select('*, brokers(id, name), drivers(id, first_name, last_name), trucks(id, unit_number, make)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Load[]
    },
  })

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)
  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'All' ? loads.length : loads.filter(l => l.status === t).length
    return acc
  }, {} as Record<string, number>)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Loads</h1>
          <p className="text-sm text-gray-400 mt-0.5">{loads.length} total loads</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Load
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              tab === t ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading loads…</div>
        ) : isError ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-500">Failed to load — check RLS policies.</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No loads found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Load #', 'Route', 'Broker', 'Driver', 'Type', 'Miles', 'Rate', 'Status', 'ETA'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(load => (
                  <tr key={load.id} onClick={() => setSelected(selected?.id === load.id ? null : load)}
                    className={`cursor-pointer transition-colors ${selected?.id === load.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {load.load_number || `#${load.id.slice(0, 8)}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                      <div className="truncate">
                        <span className="text-gray-900">{routeStr(load.origin_city, load.origin_state)}</span>
                        <span className="text-gray-300 mx-1">→</span>
                        <span>{routeStr(load.dest_city, load.dest_state)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{load.brokers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{driverName(load.drivers)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{load.load_type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(load.miles)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(load.rate, '$')}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={load.status} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(load.eta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <DetailPanel load={selected} onClose={() => setSelected(null)} />}
      {showModal && <NewLoadModal onClose={() => setShowModal(false)} />}
    </AppShell>
  )
}
