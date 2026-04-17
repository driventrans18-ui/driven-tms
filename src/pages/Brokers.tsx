import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface Broker {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  mc_number: string | null
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

function NewBrokerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', email: '', mc_number: '', notes: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('brokers').insert({
        name: form.name,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        mc_number: form.mc_number || null,
        notes: form.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brokers'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">New Broker</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <Field label="Company Name" value={form.name} onChange={v => set('name', v)} placeholder="Acme Freight Brokers" />
          <Field label="Contact Name" value={form.contact_name} onChange={v => set('contact_name', v)} placeholder="Jane Doe" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="(800) 555-0100" type="tel" />
            <Field label="Email" value={form.email} onChange={v => set('email', v)} placeholder="jane@acme.com" type="email" />
          </div>
          <Field label="MC Number" value={form.mc_number} onChange={v => set('mc_number', v)} placeholder="MC-123456" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Any notes…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] resize-none" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : 'Add Broker'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ broker, onClose }: { broker: Broker; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Broker</p>
            <h2 className="text-base font-semibold text-gray-900">{broker.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Contact" value={broker.contact_name} />
            <Detail label="MC Number" value={broker.mc_number} />
            <Detail label="Phone" value={broker.phone} />
            <Detail label="Email" value={broker.email} />
          </dl>
          {broker.notes && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-700">{broker.notes}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export function Brokers() {
  const [selected, setSelected] = useState<Broker | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ['brokers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('*').order('name')
      if (error) throw error
      return data as Broker[]
    },
  })

  const filtered = search
    ? brokers.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.contact_name?.toLowerCase().includes(search.toLowerCase()))
    : brokers

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Brokers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{brokers.length} brokers</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Broker
        </button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brokers…"
          className="px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] w-64" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading brokers…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No brokers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Company', 'Contact', 'Phone', 'Email', 'MC Number'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(broker => (
                  <tr key={broker.id} onClick={() => setSelected(selected?.id === broker.id ? null : broker)}
                    className={`cursor-pointer transition-colors ${selected?.id === broker.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{broker.name}</td>
                    <td className="px-4 py-3 text-gray-600">{broker.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{broker.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{broker.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{broker.mc_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <DetailPanel broker={selected} onClose={() => setSelected(null)} />}
      {showModal && <NewBrokerModal onClose={() => setShowModal(false)} />}
    </AppShell>
  )
}
