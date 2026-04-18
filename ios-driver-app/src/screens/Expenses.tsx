import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { SwipeRow } from '../components/SwipeRow'

const CATEGORIES = ['Fuel', 'Maintenance', 'Tolls', 'Insurance', 'Permits', 'Lumper', 'Other'] as const
type Category = typeof CATEGORIES[number]

interface Expense {
  id: string
  expense_date: string | null
  category: string | null
  amount: number | null
  vendor: string | null
  notes: string | null
  truck_id: string | null
  load_id: string | null
  created_at: string
}

const BADGE: Record<string, string> = {
  Fuel:        'bg-yellow-100 text-yellow-700',
  Maintenance: 'bg-orange-100 text-orange-700',
  Tolls:       'bg-blue-100 text-blue-700',
  Insurance:   'bg-purple-100 text-purple-700',
  Permits:     'bg-teal-100 text-teal-700',
  Lumper:      'bg-pink-100 text-pink-700',
  Other:       'bg-gray-100 text-gray-600',
}

function fmtMoney(n: number | null | undefined) {
  return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function Expenses() {
  const qc = useQueryClient()
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All')
  const [open, setOpen] = useState<{ editing: Expense | null } | null>(null)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['driver-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*')
        .order('expense_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Expense[]
    },
  })

  const quickDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-expenses'] })
      qc.invalidateQueries({ queryKey: ['driver-summary'] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const filtered = catFilter === 'All' ? expenses : expenses.filter(e => e.category === catFilter)
  const total = filtered.reduce((s, e) => s + (e.amount ?? 0), 0)

  return (
    <div className="space-y-4">
      <button onClick={() => setOpen({ editing: null })}
        className="w-full py-3.5 rounded-xl text-white text-base font-semibold cursor-pointer"
        style={{ background: '#c8410a' }}>
        + Add Expense
      </button>

      <div className="bg-white rounded-2xl p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{catFilter === 'All' ? 'Total' : catFilter}</p>
          <p className="text-xs text-gray-400">{filtered.length} records</p>
        </div>
        <p className="text-3xl font-bold text-gray-900 mt-1">{fmtMoney(total)}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto bg-white rounded-xl p-1">
        {(['All', ...CATEGORIES] as const).map(c => {
          const on = c === catFilter
          return (
            <button key={c} onClick={() => setCatFilter(c)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer"
              style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
              {c}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No expenses.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(e => {
            const cls = BADGE[e.category ?? 'Other'] ?? BADGE.Other
            const label = `${e.category ?? 'expense'} ${fmtMoney(e.amount)}`
            return (
              <li key={e.id}>
                <SwipeRow
                  onEdit={() => setOpen({ editing: e })}
                  onDelete={() => {
                    if (confirm(`Delete ${label}?`)) quickDelete.mutate(e.id)
                  }}
                >
                  <button onClick={() => setOpen({ editing: e })}
                    className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{e.category ?? 'Other'}</span>
                      <span className="text-base font-semibold text-gray-900">{fmtMoney(e.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                      <span className="truncate">{e.vendor ?? '—'}</span>
                      <span>{fmtDate(e.expense_date)}</span>
                    </div>
                  </button>
                </SwipeRow>
              </li>
            )
          })}
        </ul>
      )}

      {open && <ExpenseSheet editing={open.editing} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ExpenseSheet({ editing, onClose }: { editing: Expense | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    expense_date: editing?.expense_date ?? todayISO(),
    category:     (editing?.category as Category) ?? 'Fuel',
    amount:       editing?.amount != null ? String(editing.amount) : '',
    vendor:       editing?.vendor ?? '',
    notes:        editing?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        expense_date: form.expense_date || null,
        category: form.category,
        amount: form.amount ? Number(form.amount) : null,
        vendor: form.vendor || null,
        notes: form.notes || null,
      }
      const { error } = editing
        ? await supabase.from('expenses').update(payload).eq('id', editing.id)
        : await supabase.from('expenses').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['driver-expenses'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const { error } = await supabase.from('expenses').delete().eq('id', editing.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['driver-expenses'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Expense' : 'New Expense'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
            <input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <input value={form.vendor} onChange={e => set('vendor', e.target.value)}
              placeholder="Love's, Pilot, etc."
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Brief description"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: '#c8410a' }}>
          {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
        </button>

        {editing && (
          <button onClick={() => { if (confirm('Delete this expense?')) remove.mutate() }}
            className="w-full mt-2 py-3 rounded-xl text-red-600 text-base font-semibold active:bg-red-50 cursor-pointer">
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
