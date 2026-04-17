import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface MaintenanceRecord {
  id: string
  truck_id: string | null
  service_type: string | null
  description: string | null
  vendor: string | null
  cost: number | null
}

const SERVICE_TYPES = ['Oil Change', 'Tire', 'Brake', 'Engine', 'Transmission', 'Electrical', 'DOT Inspection', 'Preventive', 'Other']

function fmt(n: number | null) { return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 }) }

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

function NewMxModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ truck_id: '', service_type: 'Oil Change', description: '', cost: '', vendor: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: trucks = [] } = useQuery({ queryKey: ['trucks-simple'], queryFn: async () => {
    const { data } = await supabase.from('trucks').select('id, unit_number').order('unit_number')
    return (data ?? []) as Array<{ id: string; unit_number: string | null }>
  }})

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('maintenance').insert({
        truck_id: form.truck_id || null,
        service_type: form.service_type,
        description: form.description || null,
        cost: form.cost ? Number(form.cost) : null,
        vendor: form.vendor || null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">New Maintenance Record</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Truck</label>
            <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
              <option value="">— Select truck —</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number ?? t.id}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service Type</label>
              <select value={form.service_type} onChange={e => set('service_type', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost ($)</label>
              <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of work"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shop / Vendor</label>
            <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Shop name or vendor"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ record, onClose }: { record: MaintenanceRecord; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Maintenance</p>
            <h2 className="text-base font-semibold text-gray-900">{record.service_type ?? 'Record'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Cost" value={fmt(record.cost)} />
            <Detail label="Vendor" value={record.vendor} />
          </dl>
          {record.description && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Description</p>
              <p className="text-sm text-gray-700">{record.description}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export function Maintenance() {
  const [selected, setSelected] = useState<MaintenanceRecord | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [typeFilter, setTypeFilter] = useState('All')

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('maintenance').select('*')
      if (error) throw error
      return data as MaintenanceRecord[]
    },
  })

  const types = ['All', ...SERVICE_TYPES]
  const filtered = typeFilter === 'All' ? records : records.filter(r => r.service_type === typeFilter)
  const totalCost = filtered.reduce((s, r) => s + (r.cost ?? 0), 0)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Maintenance</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} records · {fmt(totalCost)} total cost</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Record
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${typeFilter === t ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading records…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Service Type', 'Description', 'Cost', 'Vendor'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(rec => (
                  <tr key={rec.id} onClick={() => setSelected(selected?.id === rec.id ? null : rec)}
                    className={`cursor-pointer transition-colors ${selected?.id === rec.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{rec.service_type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[240px] truncate">{rec.description ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(rec.cost)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{rec.vendor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <DetailPanel record={selected} onClose={() => setSelected(null)} />}
      {showModal && <NewMxModal onClose={() => setShowModal(false)} />}
    </AppShell>
  )
}
