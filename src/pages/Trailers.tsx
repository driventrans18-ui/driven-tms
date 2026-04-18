import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface Trailer {
  id: string
  trailer_number: string | null
  make: string | null
  model: string | null
  year: number | null
  vin: string | null
  license_plate: string | null
  status: string | null
  notes: string | null
  created_at: string
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]" />
    </div>
  )
}

function TrailerModal({ onClose, editing }: { onClose: () => void; editing: Trailer | null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    trailer_number: editing?.trailer_number ?? '',
    make:           editing?.make           ?? '',
    model:          editing?.model          ?? '',
    year:           editing?.year != null ? String(editing.year) : '',
    vin:            editing?.vin            ?? '',
    license_plate:  editing?.license_plate  ?? '',
    status:         editing?.status         ?? 'Active',
    notes:          editing?.notes          ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        trailer_number: form.trailer_number || null,
        make: form.make || null,
        model: form.model || null,
        year: form.year ? Number(form.year) : null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
        status: form.status,
        notes: form.notes || null,
      }
      const { error } = editing
        ? await supabase.from('trailers').update(payload).eq('id', editing.id)
        : await supabase.from('trailers').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trailers'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Trailer' : 'New Trailer'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trailer #" value={form.trailer_number} onChange={v => set('trailer_number', v)} placeholder="TR-201" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]">
                {['Active', 'In Shop', 'Inactive'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make"  value={form.make}  onChange={v => set('make', v)}  placeholder="Wabash" />
            <Field label="Model" value={form.model} onChange={v => set('model', v)} placeholder="DuraPlate" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year" value={form.year} onChange={v => set('year', v)} type="number" placeholder="2022" />
            <Field label="License Plate" value={form.license_plate} onChange={v => set('license_plate', v)} placeholder="TRL-1234" />
          </div>
          <Field label="VIN" value={form.vin} onChange={v => set('vin', v)} placeholder="1JJV..." />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)] resize-none" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: 'var(--color-brand-500)' }}>
            {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Trailer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Trailers() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing: Trailer | null }>({ open: false, editing: null })

  const { data: trailers = [], isLoading } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trailers').select('*').order('trailer_number')
      if (error) throw error
      return (data ?? []) as Trailer[]
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trailers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trailers'] }),
    onError: (e: Error) => alert(e.message),
  })

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Trailers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{trailers.length} trailers</p>
        </div>
        <button onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: 'var(--color-brand-500)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Trailer
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading trailers…</div>
        ) : trailers.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No trailers yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Trailer #', 'Make', 'Model', 'Year', 'Plate', 'VIN', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {trailers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.trailer_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.make ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.model ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.year ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.license_plate ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.vin ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.status ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button onClick={() => setModal({ open: true, editing: t })}
                      className="text-xs text-gray-500 hover:text-gray-800 mr-3 cursor-pointer">Edit</button>
                    <button onClick={() => { if (confirm(`Delete trailer ${t.trailer_number ?? t.id.slice(0, 8)}?`)) del.mutate(t.id) }}
                      className="text-xs text-red-600 hover:text-red-700 cursor-pointer">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal.open && (
        <TrailerModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />
      )}
    </AppShell>
  )
}
