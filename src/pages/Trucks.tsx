import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface Truck {
  id: number
  unit_number: string
  make: string | null
  model: string | null
  year: number | null
  vin: string | null
  license_plate: string | null
  status: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-green-100 text-green-700',
  'In Shop': 'bg-orange-100 text-orange-700',
  Inactive:  'bg-gray-100 text-gray-500',
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] transition-colors" />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

function TruckModal({ onClose, editing }: { onClose: () => void; editing: Truck | null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    unit_number:   editing?.unit_number   ?? '',
    make:          editing?.make          ?? '',
    model:         editing?.model         ?? '',
    year:          editing?.year != null ? String(editing.year) : '',
    vin:           editing?.vin           ?? '',
    license_plate: editing?.license_plate ?? '',
    status:        editing?.status        ?? 'Active',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        unit_number: form.unit_number,
        make: form.make || null,
        model: form.model || null,
        year: form.year ? Number(form.year) : null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
        status: form.status,
      }
      const { error } = editing
        ? await supabase.from('trucks').update(payload).eq('id', editing.id)
        : await supabase.from('trucks').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trucks'] }); qc.invalidateQueries({ queryKey: ['dashboard-stats'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Truck' : 'New Truck'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit #" value={form.unit_number} onChange={v => set('unit_number', v)} placeholder="T-101" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                {['Active', 'In Shop', 'Inactive'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make" value={form.make} onChange={v => set('make', v)} placeholder="Freightliner" />
            <Field label="Model" value={form.model} onChange={v => set('model', v)} placeholder="Cascadia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year" value={form.year} onChange={v => set('year', v)} type="number" placeholder="2022" />
            <Field label="License Plate" value={form.license_plate} onChange={v => set('license_plate', v)} placeholder="ABC-1234" />
          </div>
          <Field label="VIN" value={form.vin} onChange={v => set('vin', v)} placeholder="1FUJHHDR..." />
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.unit_number}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Truck'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ truck, onClose, onEdit, onDelete, deleting }: {
  truck: Truck; onClose: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Truck</p>
            <h2 className="text-base font-semibold text-gray-900">{truck.unit_number}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <StatusBadge status={truck.status} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Make" value={truck.make} />
            <Detail label="Model" value={truck.model} />
            <Detail label="Year" value={truck.year} />
            <Detail label="License Plate" value={truck.license_plate} />
            <Detail label="VIN" value={truck.vin} />
          </dl>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onEdit} className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="flex-1 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 cursor-pointer">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </aside>
    </>
  )
}

export function Trucks() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Truck | null>(null)
  const [modalState, setModalState] = useState<{ open: boolean; editing: Truck | null }>({ open: false, editing: null })
  const [statusFilter, setStatusFilter] = useState('All')

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').order('unit_number')
      if (error) throw error
      return data as Truck[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('trucks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trucks'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setSelected(null)
    },
    onError: (e: Error) => alert(e.message),
  })

  const handleDelete = (truck: Truck) => {
    if (confirm(`Delete truck ${truck.unit_number}? This cannot be undone.`)) {
      deleteMutation.mutate(truck.id)
    }
  }

  const statuses = ['All', 'Active', 'In Shop', 'Inactive']
  const filtered = statusFilter === 'All' ? trucks : trucks.filter(t => t.status === statusFilter)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Trucks</h1>
          <p className="text-sm text-gray-400 mt-0.5">{trucks.length} in fleet</p>
        </div>
        <button onClick={() => setModalState({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Truck
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 w-fit">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${statusFilter === s ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading trucks…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No trucks found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Unit #', 'Make', 'Model', 'Year', 'License Plate', 'VIN', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(truck => (
                  <tr key={truck.id} onClick={() => setSelected(selected?.id === truck.id ? null : truck)}
                    className={`cursor-pointer transition-colors ${selected?.id === truck.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{truck.unit_number}</td>
                    <td className="px-4 py-3 text-gray-600">{truck.make ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{truck.model ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{truck.year ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{truck.license_plate ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{truck.vin ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={truck.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          truck={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setModalState({ open: true, editing: selected })}
          onDelete={() => handleDelete(selected)}
          deleting={deleteMutation.isPending}
        />
      )}
      {modalState.open && (
        <TruckModal
          editing={modalState.editing}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}
    </AppShell>
  )
}
