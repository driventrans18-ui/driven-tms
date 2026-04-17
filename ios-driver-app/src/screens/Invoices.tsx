import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Driver } from '../hooks/useDriver'

interface DeliveredLoad {
  id: string
  load_number: string | null
  origin_city: string | null
  dest_city: string | null
  rate: number | null
  brokers: { id: string; name: string } | null
  invoices: { id: string; status: string; amount: number | null }[]
}

function fmt(n: number | null | undefined) {
  return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function Invoices({ driver }: { driver: Driver }) {
  const qc = useQueryClient()

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['my-delivered-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, dest_city, rate, brokers(id, name), invoices(id, status, amount)')
        .eq('driver_id', driver.id)
        .eq('status', 'Delivered')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as DeliveredLoad[]
    },
  })

  const createInvoice = useMutation({
    mutationFn: async (load: DeliveredLoad) => {
      const { error } = await supabase.from('invoices').insert({
        load_id: load.id,
        broker_id: load.brokers?.id ?? null,
        amount: load.rate,
        status: 'Draft',
        issued_date: new Date().toISOString().slice(0, 10),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-delivered-loads', driver.id] }),
    onError: (e: Error) => alert(e.message),
  })

  const totals = loads.reduce(
    (acc, l) => {
      const amount = l.invoices.reduce((s, i) => s + (i.amount ?? 0), 0) || (l.rate ?? 0)
      const paid = l.invoices.some(i => i.status === 'Paid')
      if (paid) acc.paid += amount
      else acc.outstanding += amount
      return acc
    },
    { paid: 0, outstanding: 0 }
  )

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totals.outstanding)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(totals.paid)}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : loads.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No delivered loads yet.</p>
      ) : (
        <ul className="space-y-2">
          {loads.map(l => {
            const inv = l.invoices[0]
            return (
              <li key={l.id} className="bg-white rounded-2xl p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-gray-500">{l.load_number || `#${l.id.slice(0, 8)}`}</p>
                  <p className="text-base font-semibold text-gray-900">{fmt(inv?.amount ?? l.rate)}</p>
                </div>
                <p className="text-base font-semibold text-gray-900 mt-1 truncate">
                  {[l.origin_city, l.dest_city].filter(Boolean).join(' → ')}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{l.brokers?.name ?? 'No broker'}</p>
                <div className="mt-3">
                  {inv ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                      Invoice: {inv.status}
                    </span>
                  ) : (
                    <button onClick={() => createInvoice.mutate(l)} disabled={createInvoice.isPending}
                      className="py-2 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                      style={{ background: '#c8410a' }}>
                      {createInvoice.isPending ? 'Creating…' : 'Create invoice'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
