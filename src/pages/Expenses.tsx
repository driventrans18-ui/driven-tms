import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

const CATEGORIES = ['Fuel', 'Maintenance', 'Tolls', 'Insurance', 'Permits', 'Lumper', 'Other']

interface Expense {
  id: string
  expense_date: string | null
  category: string | null
  amount: number | null
  vendor: string | null
  notes: string | null
  load_id: string | null
  truck_id: string | null
  gallons: number | null
  price_per_gal: number | null
  odometer: number | null
  created_at: string
}

const CATEGORY_COLORS: Record<string, string> = {
  Fuel:        'bg-yellow-100 text-yellow-700',
  Maintenance: 'bg-orange-100 text-orange-700',
  Tolls:       'bg-blue-100 text-blue-700',
  Insurance:   'bg-purple-100 text-purple-700',
  Permits:     'bg-teal-100 text-teal-700',
  Lumper:      'bg-pink-100 text-pink-700',
  Other:       'bg-gray-100 text-gray-600',
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-300 text-xs">—</span>
  const cls = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{category}</span>
}

function fmt(n: number | null) { return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 }) }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

function NewExpenseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ expense_date: '', category: 'Fuel', amount: '', vendor: '', notes: '', truck_id: '', load_id: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: trucks = [] } = useQuery({ queryKey: ['trucks-simple'], queryFn: async () => {
    const { data } = await supabase.from('trucks').select('id, unit_number').order('unit_number')
    return (data ?? []) as Array<{ id: string; unit_number: string | null }>
  }})

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').insert({
        expense_date: form.expense_date || null,
        category: form.category,
        amount: form.amount ? Number(form.amount) : null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        truck_id: form.truck_id || null,
        load_id: form.load_id || null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">New Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
            <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Love's, Pilot, etc."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Brief description"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Truck</label>
            <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
              <option value="">— None —</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number ?? t.id}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Expense</p>
            <h2 className="text-base font-semibold text-gray-900">{fmt(expense.amount)}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <CategoryBadge category={expense.category} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Date" value={fmtDate(expense.expense_date)} />
            <Detail label="Amount" value={fmt(expense.amount)} />
            <Detail label="Vendor" value={expense.vendor} />
            <Detail label="Gallons" value={expense.gallons ?? undefined} />
            <Detail label="Price/Gal" value={expense.price_per_gal ? '$' + expense.price_per_gal : undefined} />
            <Detail label="Odometer" value={expense.odometer ?? undefined} />
          </dl>
          {expense.notes && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-700">{expense.notes}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export function Expenses() {
  const [selected, setSelected] = useState<Expense | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [catFilter, setCatFilter] = useState('All')

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
  })

  const cats = ['All', ...CATEGORIES]
  const filtered = catFilter === 'All' ? expenses : expenses.filter(e => e.category === catFilter)
  const total = filtered.reduce((s, e) => s + (e.amount ?? 0), 0)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} records · {fmt(total)} total</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Expense
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 flex-wrap">
        {cats.map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${catFilter === c ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading expenses…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No expenses found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date', 'Category', 'Vendor', 'Amount', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(exp => (
                  <tr key={exp.id} onClick={() => setSelected(selected?.id === exp.id ? null : exp)}
                    className={`cursor-pointer transition-colors ${selected?.id === exp.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(exp.expense_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><CategoryBadge category={exp.category} /></td>
                    <td className="px-4 py-3 text-gray-600">{exp.vendor ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(exp.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{exp.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <DetailPanel expense={selected} onClose={() => setSelected(null)} />}
      {showModal && <NewExpenseModal onClose={() => setShowModal(false)} />}
    </AppShell>
  )
}
