import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface Driver {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  cdl_class: string | null
  status: string | null
  created_at: string
}

function driverName(d: Driver) {
  return [d.first_name, d.last_name].filter(Boolean).join(' ') || '—'
}

const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-green-100 text-green-700',
  'On Leave':'bg-blue-100 text-blue-700',
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

function DriverModal({ onClose, editing }: { onClose: () => void; editing: Driver | null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    first_name: editing?.first_name ?? '',
    last_name:  editing?.last_name  ?? '',
    phone:      editing?.phone      ?? '',
    email:      editing?.email      ?? '',
    cdl_class:  editing?.cdl_class  ?? 'Class A',
    status:     editing?.status     ?? 'Active',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        phone: form.phone || null,
        email: form.email || null,
        cdl_class: form.cdl_class || null,
        status: form.status,
      }
      const { error } = editing
        ? await supabase.from('drivers').update(payload).eq('id', editing.id)
        : await supabase.from('drivers').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); qc.invalidateQueries({ queryKey: ['dashboard-stats'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Driver' : 'New Driver'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" value={form.first_name} onChange={v => set('first_name', v)} placeholder="John" />
            <Field label="Last Name" value={form.last_name} onChange={v => set('last_name', v)} placeholder="Smith" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="(585) 555-0100" type="tel" />
            <Field label="Email" value={form.email} onChange={v => set('email', v)} placeholder="john@example.com" type="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CDL Class</label>
              <select value={form.cdl_class} onChange={e => set('cdl_class', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                {['Class A', 'Class B', 'Class C', 'Non-CDL'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
              {['Active', 'On Leave', 'Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || (!form.first_name && !form.last_name)}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Driver'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ driver, onClose, onEdit, onDelete, deleting }: {
  driver: Driver; onClose: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Driver</p>
            <h2 className="text-base font-semibold text-gray-900">{driverName(driver)}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <StatusBadge status={driver.status} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Phone" value={driver.phone} />
            <Detail label="Email" value={driver.email} />
            <Detail label="CDL Class" value={driver.cdl_class} />
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

export function Drivers() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Driver | null>(null)
  const [modalState, setModalState] = useState<{ open: boolean; editing: Driver | null }>({ open: false, editing: null })
  const [statusFilter, setStatusFilter] = useState('All')

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').order('last_name')
      if (error) throw error
      return data as Driver[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('drivers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setSelected(null)
    },
    onError: (e: Error) => alert(e.message),
  })

  const handleDelete = (driver: Driver) => {
    if (confirm(`Delete ${driverName(driver)}? This cannot be undone.`)) {
      deleteMutation.mutate(driver.id)
    }
  }

  const statuses = ['All', 'Active', 'On Leave', 'Inactive']
  const filtered = statusFilter === 'All' ? drivers : drivers.filter(d => d.status === statusFilter)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Drivers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{drivers.length} drivers</p>
        </div>
        <button onClick={() => setModalState({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Driver
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
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading drivers…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No drivers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Name', 'Phone', 'Email', 'CDL Class', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(driver => (
                  <tr key={driver.id} onClick={() => setSelected(selected?.id === driver.id ? null : driver)}
                    className={`cursor-pointer transition-colors ${selected?.id === driver.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{driverName(driver)}</td>
                    <td className="px-4 py-3 text-gray-600">{driver.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{driver.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{driver.cdl_class ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={driver.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          driver={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setModalState({ open: true, editing: selected })}
          onDelete={() => handleDelete(selected)}
          deleting={deleteMutation.isPending}
        />
      )}
      {modalState.open && (
        <DriverModal
          editing={modalState.editing}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}
    </AppShell>
  )
}
