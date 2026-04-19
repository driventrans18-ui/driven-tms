import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { SwipeRow } from '../components/SwipeRow'
import { PlusButton } from '../components/ScreenHeader'

interface Broker {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  mc_number: string | null
  dot_number: string | null
  notes: string | null
}

export function Brokers() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Broker | null>(null)
  const [form, setForm] = useState<{ editing: Broker | null } | null>(null)

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ['brokers-driver'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Broker[]
    },
  })

  const removeBroker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('brokers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers-driver'] })
      qc.invalidateQueries({ queryKey: ['brokers-simple'] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const filtered = q
    ? brokers.filter(b =>
        b.name.toLowerCase().includes(q.toLowerCase()) ||
        b.mc_number?.toLowerCase().includes(q.toLowerCase()) ||
        b.contact_name?.toLowerCase().includes(q.toLowerCase())
      )
    : brokers

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brokers or MC#"
          className="flex-1 px-4 py-3.5 rounded-xl bg-white text-base border border-gray-200 focus:outline-none focus:border-[var(--color-brand-500)]" />
        <PlusButton onClick={() => setForm({ editing: null })} label="Add broker" />
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No brokers.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(b => (
            <li key={b.id}>
              <SwipeRow
                onEdit={() => setForm({ editing: b })}
                onDelete={() => {
                  if (confirm(`Delete broker "${b.name}"? This cannot be undone.`)) {
                    removeBroker.mutate(b.id)
                  }
                }}
              >
                <button onClick={() => setOpen(b)}
                  className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                  <p className="text-base font-semibold text-gray-900">{b.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    {b.mc_number && <span className="font-mono">{b.mc_number}</span>}
                    {b.contact_name && <span>· {b.contact_name}</span>}
                  </div>
                </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}

      {open && <BrokerSheet broker={open} onClose={() => setOpen(null)} onEdit={() => { setForm({ editing: open }); setOpen(null) }} />}
      {form && <BrokerFormSheet editing={form.editing} onClose={() => setForm(null)} />}
    </div>
  )
}

function BrokerSheet({ broker, onClose, onEdit }: { broker: Broker; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{broker.name}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <dl className="space-y-3 text-base">
          {broker.contact_name && <DetailRow k="Contact" v={broker.contact_name} />}
          {broker.mc_number  && <DetailRow k="MC#"  v={broker.mc_number}  />}
          {broker.dot_number && <DetailRow k="DOT#" v={broker.dot_number} />}
          {broker.email && <DetailRow k="Email" v={broker.email} />}
          {broker.phone && <DetailRow k="Phone" v={broker.phone} />}
        </dl>
        {broker.notes && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-base text-gray-900 whitespace-pre-wrap">{broker.notes}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-6">
          <button onClick={onEdit}
            className="py-3 rounded-xl border border-gray-200 text-gray-900 text-base font-semibold active:bg-gray-50 cursor-pointer bg-white">
            Edit
          </button>
          {broker.phone ? (
            <a href={`tel:${broker.phone}`}
              className="py-3 rounded-xl text-center text-white text-base font-semibold"
              style={{ background: 'var(--color-brand-500)' }}>
              Call
            </a>
          ) : (
            <button onClick={onClose}
              className="py-3 rounded-xl text-white text-base font-semibold cursor-pointer"
              style={{ background: 'var(--color-brand-500)' }}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function BrokerFormSheet({ editing, onClose }: { editing: Broker | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!editing
  const [form, setForm] = useState({
    name:         editing?.name         ?? '',
    contact_name: editing?.contact_name ?? '',
    phone:        editing?.phone        ?? '',
    email:        editing?.email        ?? '',
    mc_number:    editing?.mc_number    ?? '',
    dot_number:   editing?.dot_number   ?? '',
    notes:        editing?.notes        ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim()
      if (!name) throw new Error('Enter a broker name.')
      const payload = {
        name,
        contact_name: form.contact_name || null,
        phone:        form.phone        || null,
        email:        form.email        || null,
        mc_number:    form.mc_number    || null,
        dot_number:   form.dot_number   || null,
        notes:        form.notes        || null,
      }
      const { error } = isEdit && editing
        ? await supabase.from('brokers').update(payload).eq('id', editing.id)
        : await supabase.from('brokers').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers-driver'] })
      qc.invalidateQueries({ queryKey: ['brokers-simple'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Broker' : 'New Broker'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Freight Brokers"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <Field label="Contact">
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Jane Doe"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" type="tel"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="MC#">
              <input value={form.mc_number} onChange={e => set('mc_number', e.target.value)} placeholder="123456"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </Field>
            <Field label="DOT#">
              <input value={form.dot_number} onChange={e => set('dot_number', e.target.value)} placeholder="1234567"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </Field>
          </div>
          <Field label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="dispatch@acme.com" type="email"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}
          className="w-full mt-5 py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Broker'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
      <dt className="text-sm text-gray-500">{k}</dt>
      <dd className="text-base text-gray-900 font-medium">{v}</dd>
    </div>
  )
}
