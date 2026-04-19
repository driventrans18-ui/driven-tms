import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { SwipeRow } from '../components/SwipeRow'
import { PlusButton } from '../components/ScreenHeader'

interface Customer {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export function Customers() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Customer | null>(null)
  const [form, setForm] = useState<{ editing: Customer | null } | null>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers-driver'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Customer[]
    },
  })

  const removeCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-driver'] })
      qc.invalidateQueries({ queryKey: ['customers-simple'] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const filtered = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.contact_name?.toLowerCase().includes(q.toLowerCase()) ||
        c.address?.toLowerCase().includes(q.toLowerCase())
      )
    : customers

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers"
          className="flex-1 px-4 py-3.5 rounded-xl bg-white text-base border border-gray-200 focus:outline-none focus:border-[var(--color-brand-500)]" />
        <PlusButton onClick={() => setForm({ editing: null })} label="Add customer" />
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No customers.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(c => (
            <li key={c.id}>
              <SwipeRow
                onEdit={() => setForm({ editing: c })}
                onDelete={() => {
                  if (confirm(`Delete customer "${c.name}"? This cannot be undone.`)) {
                    removeCustomer.mutate(c.id)
                  }
                }}
              >
                <button onClick={() => setOpen(c)}
                  className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                  <p className="text-base font-semibold text-gray-900">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    {c.contact_name && <span>{c.contact_name}</span>}
                    {c.address && <span className="truncate">· {c.address}</span>}
                  </div>
                </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}

      {open && <CustomerSheet customer={open} onClose={() => setOpen(null)} onEdit={() => { setForm({ editing: open }); setOpen(null) }} />}
      {form && <CustomerFormSheet editing={form.editing} onClose={() => setForm(null)} />}
    </div>
  )
}

function CustomerSheet({ customer, onClose, onEdit }: { customer: Customer; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{customer.name}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <dl className="space-y-3 text-base">
          {customer.contact_name && <DetailRow k="Contact" v={customer.contact_name} />}
          {customer.email && <DetailRow k="Email" v={customer.email} />}
          {customer.phone && <DetailRow k="Phone" v={customer.phone} />}
          {customer.address && <DetailRow k="Address" v={customer.address} />}
        </dl>
        {customer.notes && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-base text-gray-900 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-6">
          <button onClick={onEdit}
            className="py-3 rounded-xl border border-gray-200 text-gray-900 text-base font-semibold active:bg-gray-50 cursor-pointer bg-white">
            Edit
          </button>
          {customer.phone ? (
            <a href={`tel:${customer.phone}`}
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

function CustomerFormSheet({ editing, onClose }: { editing: Customer | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!editing
  const [form, setForm] = useState({
    name:         editing?.name         ?? '',
    contact_name: editing?.contact_name ?? '',
    phone:        editing?.phone        ?? '',
    email:        editing?.email        ?? '',
    address:      editing?.address      ?? '',
    notes:        editing?.notes        ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim()
      if (!name) throw new Error('Enter a customer name.')
      const payload = {
        name,
        contact_name: form.contact_name || null,
        phone:        form.phone        || null,
        email:        form.email        || null,
        address:      form.address      || null,
        notes:        form.notes        || null,
      }
      const { error } = isEdit && editing
        ? await supabase.from('customers').update(payload).eq('id', editing.id)
        : await supabase.from('customers').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-driver'] })
      qc.invalidateQueries({ queryKey: ['customers-simple'] })
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
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Walmart DC #4321"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <Field label="Contact">
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" type="tel"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="ap@customer.com" type="email"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </Field>
          </div>
          <Field label="Address">
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, City, ST"
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
          {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
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
      <dd className="text-base text-gray-900 font-medium text-right truncate ml-3">{v}</dd>
    </div>
  )
}
