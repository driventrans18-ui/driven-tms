import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { SwipeRow } from '../components/SwipeRow'
import { ScreenHeader, PlusButton } from '../components/ScreenHeader'

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

// Small colored square with a letter — matches the mockup's per-category
// leading icon. Colors mirror BADGE tints so category is visually consistent.
const ICON_BG: Record<string, string> = {
  Fuel:        '#fef3c7',
  Maintenance: '#ffedd5',
  Tolls:       '#dbeafe',
  Insurance:   '#ede9fe',
  Permits:     '#ccfbf1',
  Lumper:      '#fce7f3',
  Other:       '#f3f4f6',
}
const ICON_FG: Record<string, string> = {
  Fuel:        '#b45309',
  Maintenance: '#c2410c',
  Tolls:       '#1d4ed8',
  Insurance:   '#6d28d9',
  Permits:     '#0f766e',
  Lumper:      '#be185d',
  Other:       '#4b5563',
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
      <ScreenHeader
        title="Expenses"
        action={<PlusButton onClick={() => setOpen({ editing: null })} label="Add expense" />}
      />

      {/* Total headline — matches the mockup: centered label + large value. */}
      <div className="bg-white rounded-2xl p-5 text-center">
        <p className="text-sm text-gray-500">{catFilter === 'All' ? 'Total' : catFilter}</p>
        <p className="text-4xl font-bold text-gray-900 mt-1">{fmtMoney(total)}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto bg-white rounded-xl p-1">
        {(['All', ...CATEGORIES] as const).map(c => {
          const on = c === catFilter
          return (
            <button key={c} onClick={() => setCatFilter(c)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer"
              style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
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
            const cat = e.category ?? 'Other'
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
                    className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: ICON_BG[cat] ?? ICON_BG.Other, color: ICON_FG[cat] ?? ICON_FG.Other }}
                      aria-hidden
                    >
                      {cat[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-gray-900 truncate">{cat}</span>
                      <span className="block text-xs text-gray-500 mt-0.5 truncate">
                        {[e.vendor, fmtDate(e.expense_date)].filter(Boolean).join(' · ') || fmtDate(e.expense_date)}
                      </span>
                    </span>
                    <span className="text-base font-semibold text-gray-900 shrink-0">{fmtMoney(e.amount)}</span>
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
    expense_date:  editing?.expense_date ?? todayISO(),
    category:      (editing?.category as Category) ?? 'Fuel',
    amount:        editing?.amount != null ? String(editing.amount) : '',
    vendor:        editing?.vendor ?? '',
    notes:         editing?.notes ?? '',
    gallons:       '',
    price_per_gal: '',
    odometer:      '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Scan-to-prefill state. scanning gates the button; banner shows the
  // result summary after Claude returns.
  const [scanning, setScanning] = useState(false)
  const [scanBanner, setScanBanner] = useState<string | null>(null)

  async function scanToPrefill() {
    if (scanning) return
    setScanning(true); setError(null); setScanBanner(null)
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        quality: 80,
      })
      if (!photo.base64String) return
      const mime = `image/${photo.format === 'jpg' ? 'jpeg' : (photo.format ?? 'jpeg')}`
      const { parseReceipt } = await import('../lib/ai')
      const { prefill, usage } = await parseReceipt(photo.base64String, mime)
      const cached = usage.cache_read > 0 ? ' (cached)' : ''

      let filled = 0
      setForm(f => {
        const next: typeof f = { ...f }
        const putStr = (key: 'expense_date' | 'amount' | 'vendor' | 'notes' | 'gallons' | 'price_per_gal' | 'odometer', value: string) => {
          if (!value) return
          if (next[key] === value) return
          next[key] = value
          filled++
        }
        putStr('vendor',       prefill.vendor ?? '')
        putStr('notes',        prefill.notes ?? '')
        putStr('expense_date', prefill.date ?? '')
        if (prefill.category && (CATEGORIES as readonly string[]).includes(prefill.category)) {
          if (next.category !== prefill.category) {
            next.category = prefill.category as Category
            filled++
          }
        }
        if (prefill.amount != null)        putStr('amount',        String(prefill.amount))
        if (prefill.gallons != null)       putStr('gallons',       String(prefill.gallons))
        if (prefill.price_per_gal != null) putStr('price_per_gal', String(prefill.price_per_gal))
        if (prefill.odometer != null)      putStr('odometer',      String(prefill.odometer))
        return next
      })
      setScanBanner(filled > 0
        ? `Auto-filled ${filled} field${filled === 1 ? '' : 's'} from receipt${cached}. Review before saving.`
        : `Couldn't extract fields from that photo${cached}. Enter manually.`)
    } catch (e) {
      const msg = (e as Error).message
      if (!/cancel/i.test(msg)) setError(`Scan failed: ${msg}`)
    } finally {
      setScanning(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const isFuel = form.category === 'Fuel'
      const payload = {
        expense_date:  form.expense_date || null,
        category:      form.category,
        amount:        form.amount ? Number(form.amount) : null,
        vendor:        form.vendor || null,
        notes:         form.notes || null,
        gallons:       isFuel && form.gallons       ? Number(form.gallons)       : null,
        price_per_gal: isFuel && form.price_per_gal ? Number(form.price_per_gal) : null,
        odometer:      isFuel && form.odometer      ? Number(form.odometer)      : null,
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

        {/* Scan receipt → auto-fill. Only on create + native platforms
            (simulator prompts for a photo from the library). */}
        {!editing && Capacitor.isNativePlatform() && (
          <div className="mb-4">
            <button
              type="button"
              onClick={scanToPrefill}
              disabled={scanning}
              className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              style={{ background: 'var(--color-brand-500)' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {scanning ? 'Reading receipt…' : 'Scan receipt to auto-fill'}
            </button>
            {scanBanner && (
              <p className="mt-2 text-xs px-1" style={{ color: 'var(--color-brand-600)' }}>
                {scanBanner}
              </p>
            )}
          </div>
        )}

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
          {form.category === 'Fuel' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gallons</label>
                <input type="number" inputMode="decimal" value={form.gallons} onChange={e => set('gallons', e.target.value)}
                  placeholder="0.0"
                  className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">$/gal</label>
                <input type="number" inputMode="decimal" value={form.price_per_gal} onChange={e => set('price_per_gal', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Odometer</label>
                <input type="number" inputMode="numeric" value={form.odometer} onChange={e => set('odometer', e.target.value)}
                  placeholder="miles"
                  className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
            </div>
          )}
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
          style={{ background: 'var(--color-brand-500)' }}>
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
