import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface Broker {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  mc_number: string | null
  notes: string | null
}

export function Brokers() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Broker | null>(null)

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ['brokers-driver'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Broker[]
    },
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
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brokers or MC#"
        className="w-full px-4 py-3.5 rounded-xl bg-white text-base border border-gray-200 focus:outline-none focus:border-[var(--color-brand-500)] mb-4" />

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No brokers.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(b => (
            <li key={b.id}>
              <button onClick={() => setOpen(b)}
                className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                <p className="text-base font-semibold text-gray-900">{b.name}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                  {b.mc_number && <span className="font-mono">{b.mc_number}</span>}
                  {b.contact_name && <span>· {b.contact_name}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <BrokerSheet broker={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function BrokerSheet({ broker, onClose }: { broker: Broker; onClose: () => void }) {
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
          {broker.contact_name && <Row k="Contact" v={broker.contact_name} />}
          {broker.mc_number && <Row k="MC#" v={broker.mc_number} />}
          {broker.email && <Row k="Email" v={broker.email} />}
          {broker.phone && <Row k="Phone" v={broker.phone} />}
        </dl>
        {broker.notes && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-base text-gray-900 whitespace-pre-wrap">{broker.notes}</p>
          </div>
        )}
        {broker.phone && (
          <a href={`tel:${broker.phone}`}
            className="block mt-6 py-3.5 rounded-xl text-center text-white text-base font-semibold"
            style={{ background: 'var(--color-brand-500)' }}>
            Call
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
