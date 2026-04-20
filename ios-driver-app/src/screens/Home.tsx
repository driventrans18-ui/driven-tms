import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
import { uploadBol } from '../lib/bolDocuments'
import { captureStampedPhoto } from '../lib/stampedCamera'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import { LoadAIAssistSheet } from '../components/LoadAIAssistSheet'
import { RemindersCard } from '../components/RemindersCard'
import { LoadCalendar } from '../components/LoadCalendar'
import { ScreenHeader } from '../components/ScreenHeader'
import type { Driver } from '../hooks/useDriver'
import dieselIcon       from '../assets/quick-actions/diesel.png'
import cameraFreightIcon from '../assets/quick-actions/camerafreight.png'
import fmcsaIcon         from '../assets/quick-actions/fmcsa.png'
import podScanIcon       from '../assets/quick-actions/podscan.png'
import askAiIcon         from '../assets/quick-actions/askai.png'

const ACTIVE_STATUSES = ['Assigned', 'In Transit']

type LoadStatus = 'Assigned' | 'In Transit' | 'Delivered'
const QUICK_STATUSES: LoadStatus[] = ['Assigned', 'In Transit', 'Delivered']

type Period = 'week' | 'month' | 'year'

// Inclusive lower bound (Date at 00:00) for the chosen rolling window.
// Week is Monday-anchored to match the Expenses tab tile.
function periodStart(p: Period): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (p === 'week') {
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  } else if (p === 'month') {
    d.setDate(1)
  } else {
    d.setMonth(0, 1)
  }
  return d
}

// Summary tile with a Week / Month / Year period selector. Totals Gross,
// Net, Expenses, and $/mile for the selected rolling window so the driver
// can eyeball trends without leaving Home.
function Summary({ driverId }: { driverId: string }) {
  const [period, setPeriod] = useState<Period>('week')
  const { data } = useQuery({
    queryKey: ['driver-summary', driverId, period],
    queryFn: async () => {
      const since = periodStart(period).toISOString()
      const [loadsRes, expensesRes] = await Promise.all([
        supabase.from('loads')
          .select('rate, miles, deadhead_miles')
          .eq('driver_id', driverId)
          .eq('status', 'Delivered')
          .gte('created_at', since),
        supabase.from('expenses')
          .select('amount')
          .gte('expense_date', since.slice(0, 10)),
      ])
      if (loadsRes.error) throw loadsRes.error
      if (expensesRes.error) throw expensesRes.error
      const loads = (loadsRes.data ?? []) as Array<{ rate: number | null; miles: number | null; deadhead_miles: number | null }>
      const exps  = (expensesRes.data ?? []) as Array<{ amount: number | null }>
      const gross   = loads.reduce((s, r) => s + (r.rate ?? 0), 0)
      const miles   = loads.reduce((s, r) => s + (r.miles ?? 0) + (r.deadhead_miles ?? 0), 0)
      const expenses = exps.reduce((s, r) => s + (r.amount ?? 0), 0)
      const net     = gross - expenses
      return { gross, expenses, net, miles, rpm: miles > 0 ? gross / miles : 0 }
    },
  })
  const r = data ?? { gross: 0, expenses: 0, net: 0, miles: 0, rpm: 0 }
  const fmtK = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
        {(['week', 'month', 'year'] as Period[]).map(p => {
          const on = p === period
          return (
            <button key={p} onClick={() => setPeriod(p)}
              className="py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
              style={on ? { background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' } : { color: '#6b7280' }}>
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Year'}
            </button>
          )
        })}
      </div>
      <div className="bg-white rounded-2xl overflow-hidden">
        <div className="grid grid-cols-2">
          <StatCell label="Gross" value={fmtK(r.gross)} />
          <StatCell label="Net" value={fmtK(r.net)} valueColor={r.net >= 0 ? '#16a34a' : '#dc2626'} />
        </div>
        <div className="grid grid-cols-2 border-t border-gray-100">
          <StatCell label="Expenses" value={fmtK(r.expenses)} />
          <StatCell label="$/mile" value={r.miles > 0 ? '$' + r.rpm.toFixed(2) : '—'} valueColor="var(--color-brand-500)" />
        </div>
      </div>
    </div>
  )
}

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="p-4 first:border-r-0 [&:nth-child(odd)]:border-r border-gray-100">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={valueColor ? { color: valueColor } : { color: 'var(--color-text-primary)' }}>
        {value}
      </p>
    </div>
  )
}

export function Home({ driver, onGoToLoads, onOpenDriverMode }: {
  driver: Driver; onGoToLoads: () => void; onOpenDriverMode: () => void
}) {
  const qc = useQueryClient()
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false)

  const { data: activeLoad } = useQuery({
    queryKey: ['active-load', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, rate, miles, status, eta, load_type')
        .eq('driver_id', driver.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      const row = (data ?? null) as LoadCardLoad | null
      if (row) cacheSet(`active-load:${driver.id}`, row)
      return row ?? cacheGet<LoadCardLoad>(`active-load:${driver.id}`)
    },
  })

  useEffect(() => {
    if (activeLoad) cacheSet(`active-load:${driver.id}`, activeLoad)
  }, [activeLoad, driver.id])

  const setStatus = useMutation({
    mutationFn: async ({ loadId, status }: { loadId: string; status: LoadStatus }) => {
      const { error } = await supabase.from('loads').update({ status }).eq('id', loadId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-load', driver.id] })
      qc.invalidateQueries({ queryKey: ['my-loads', driver.id] })
      qc.invalidateQueries({ queryKey: ['driver-summary', driver.id] })
      qc.invalidateQueries({ queryKey: ['calendar-loads', driver.id] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const deleteActive = useMutation({
    mutationFn: async (loadId: string) => {
      const { error } = await supabase.from('loads').delete().eq('id', loadId)
      if (error) throw error
    },
    onSuccess: () => {
      cacheSet(`active-load:${driver.id}`, null)
      qc.invalidateQueries({ queryKey: ['active-load', driver.id] })
      qc.invalidateQueries({ queryKey: ['my-loads', driver.id] })
      qc.invalidateQueries({ queryKey: ['calendar-loads', driver.id] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const [freightPickerOpen, setFreightPickerOpen] = useState(false)
  const [podPickerOpen, setPodPickerOpen] = useState(false)
  const [carrierLookupOpen, setCarrierLookupOpen] = useState(false)
  const [aiAssistLoadId, setAiAssistLoadId] = useState<string | null>(null)
  const [aiPickerOpen, setAiPickerOpen] = useState(false)

  const captureFreight = useMutation({
    mutationFn: async (target: { id: string; loadRef: string }) => {
      const stamped = await captureStampedPhoto()
      if (!stamped) return
      const bytes = Uint8Array.from(atob(stamped.base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: stamped.mimeType })
      await uploadBol({
        loadId:  target.id,
        loadRef: target.loadRef,
        blob,
        filename: `freight-${Date.now()}.jpg`,
        mimeType: stamped.mimeType,
        kind: 'freight',
      })
    },
    onError: (e: Error) => {
      if (e.message.toLowerCase().includes('cancel')) return
      alert('Freight photo failed: ' + e.message)
    },
    onSuccess: () => alert('Freight photo uploaded and saved to Files.'),
  })

  // Capture Freight entry point. With an active load we shoot immediately;
  // otherwise open a picker so the driver can assign the photo to any load.
  const startCaptureFreight = () => {
    if (captureFreight.isPending) return
    if (activeLoad) {
      captureFreight.mutate({
        id: activeLoad.id,
        loadRef: activeLoad.load_number || activeLoad.id.slice(0, 8),
      })
      return
    }
    setFreightPickerOpen(true)
  }

  // Scan POD — always picks a load first because a POD almost never
  // belongs to whatever load is currently "active" (POD happens at
  // delivery, by which point the next load is often already assigned).
  // Capture is the same stamped-photo path as Capture Freight so the
  // timestamp stays printed on the page — useful for detention claims.
  const scanPod = useMutation({
    mutationFn: async (target: { id: string; loadRef: string }) => {
      const stamped = await captureStampedPhoto()
      if (!stamped) return
      const bytes = Uint8Array.from(atob(stamped.base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: stamped.mimeType })
      await uploadBol({
        loadId:  target.id,
        loadRef: target.loadRef,
        blob,
        filename: `pod-${Date.now()}.jpg`,
        mimeType: stamped.mimeType,
        kind: 'pod',
      })
    },
    onError: (e: Error) => {
      if (e.message.toLowerCase().includes('cancel')) return
      alert('POD upload failed: ' + e.message)
    },
    onSuccess: () => alert('POD uploaded and saved to Files.'),
  })

  return (
    <>
    <div className="space-y-5 pb-10">
      <ScreenHeader title="Home" />

      <Summary driverId={driver.id} />

      {activeLoad ? (
        <div>
          <h2 className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active load</h2>
          <LoadCard load={activeLoad} onTap={onGoToLoads} />

          {/* Inline status changer — quickest way for the driver to flip
              Assigned → In Transit → Delivered without opening the load. */}
          <div className="mt-2 grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
            {QUICK_STATUSES.map(s => {
              const on = activeLoad.status === s
              const pending = setStatus.isPending && setStatus.variables?.status === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => !on && setStatus.mutate({ loadId: activeLoad.id, status: s })}
                  disabled={setStatus.isPending}
                  className="py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
                  style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}
                >
                  {pending ? 'Saving…' : s}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={onOpenDriverMode}
            aria-label="Open Driver Mode"
            className="mt-2 w-full min-h-14 rounded-2xl bg-[var(--color-brand-500)] text-white text-base font-semibold active:opacity-90 cursor-pointer flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </svg>
            Driver Mode
          </button>

          <button
            type="button"
            onClick={() => setAiAssistLoadId(activeLoad.id)}
            className="mt-2 w-full min-h-12 rounded-2xl bg-white border text-base font-semibold active:bg-gray-50 cursor-pointer flex items-center justify-center gap-2"
            style={{ borderColor: 'var(--color-brand-500)', color: 'var(--color-brand-500)' }}
          >
            <span aria-hidden>✨</span>
            Ask AI about this load
          </button>

          <button
            type="button"
            onClick={() => {
              const label = activeLoad.load_number || `#${activeLoad.id.slice(0, 8)}`
              if (confirm(`Delete load ${label}? This cannot be undone.`)) {
                deleteActive.mutate(activeLoad.id)
              }
            }}
            disabled={deleteActive.isPending}
            className="mt-2 w-full py-2.5 rounded-xl text-red-600 text-sm font-semibold active:bg-red-50 disabled:opacity-50 cursor-pointer"
          >
            {deleteActive.isPending ? 'Deleting…' : 'Delete load'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center">
          <p className="text-sm text-gray-500">No active load. Pull a load from Loads tab.</p>
        </div>
      )}

      {/* Quick actions — fast logging near the wheel, distinct from the
          pinned end-of-trip bar at the bottom. */}
      <div>
        <h2 className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFuelSheetOpen(true)}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 flex items-center justify-center shrink-0" aria-hidden>
              <img src={dieselIcon} alt="" className="w-full h-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Add Fuel</span>
              <span className="block text-[11px] text-gray-500">Gallons, price, odometer</span>
            </span>
          </button>
          <button
            type="button"
            onClick={startCaptureFreight}
            disabled={captureFreight.isPending}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 disabled:opacity-40 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 flex items-center justify-center shrink-0" aria-hidden>
              <img src={cameraFreightIcon} alt="" className="w-full h-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {captureFreight.isPending ? 'Uploading…' : 'Capture Freight'}
              </span>
              <span className="block text-[11px] text-gray-500">
                {activeLoad ? 'Time-stamped photo of cargo' : 'Pick a load to attach to'}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { if (!scanPod.isPending) setPodPickerOpen(true) }}
            disabled={scanPod.isPending}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 disabled:opacity-40 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 flex items-center justify-center shrink-0" aria-hidden>
              <img src={podScanIcon} alt="" className="w-full h-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {scanPod.isPending ? 'Uploading…' : 'Scan POD'}
              </span>
              <span className="block text-[11px] text-gray-500">Pick a load to attach to</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCarrierLookupOpen(true)}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 flex items-center justify-center shrink-0" aria-hidden>
              <img src={fmcsaIcon} alt="" className="w-full h-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Verify carrier / broker</span>
              <span className="block text-[11px] text-gray-500">FMCSA lookup by MC# or DOT#</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeLoad) setAiAssistLoadId(activeLoad.id)
              else setAiPickerOpen(true)
            }}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 flex items-center justify-center shrink-0" aria-hidden>
              <img src={askAiIcon} alt="" className="w-full h-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Ask AI</span>
              <span className="block text-[11px] text-gray-500">
                {activeLoad ? 'Analyze this load, draft email/notes' : 'Pick a load to analyze'}
              </span>
            </span>
          </button>
        </div>
      </div>

      <RemindersCard driverId={driver.id} />

      <LoadCalendar driverId={driver.id} />
    </div>

    {fuelSheetOpen && (
      <AddFuelSheet
        loadId={activeLoad?.id ?? null}
        onClose={() => setFuelSheetOpen(false)}
      />
    )}
    {carrierLookupOpen && (
      <CarrierLookupSheet onClose={() => setCarrierLookupOpen(false)} />
    )}
    {freightPickerOpen && (
      <FreightLoadPicker
        driverId={driver.id}
        title="Attach freight photo to…"
        onClose={() => setFreightPickerOpen(false)}
        onPick={(id, loadRef) => {
          setFreightPickerOpen(false)
          captureFreight.mutate({ id, loadRef })
        }}
      />
    )}
    {podPickerOpen && (
      <FreightLoadPicker
        driverId={driver.id}
        title="Attach POD to…"
        onClose={() => setPodPickerOpen(false)}
        onPick={(id, loadRef) => {
          setPodPickerOpen(false)
          scanPod.mutate({ id, loadRef })
        }}
      />
    )}
    {aiPickerOpen && (
      <FreightLoadPicker
        driverId={driver.id}
        title="Ask AI about…"
        onClose={() => setAiPickerOpen(false)}
        onPick={(id) => {
          setAiPickerOpen(false)
          setAiAssistLoadId(id)
        }}
      />
    )}
    {aiAssistLoadId && (
      <LoadAIAssistSheet
        loadId={aiAssistLoadId}
        loadLabel={
          activeLoad && activeLoad.id === aiAssistLoadId
            ? (activeLoad.load_number || `#${activeLoad.id.slice(0, 8)}`)
            : `#${aiAssistLoadId.slice(0, 8)}`
        }
        onClose={() => setAiAssistLoadId(null)}
      />
    )}
    </>
  )
}

// ── Freight load picker ──────────────────────────────────────────────────────

// Shown when the driver taps Capture Freight without an active load. Lists
// recent loads so they can attach the photo to one. Tapping a row closes the
// sheet and triggers the camera.
function FreightLoadPicker({ driverId, title, onClose, onPick }: {
  driverId: string
  title: string
  onClose: () => void
  onPick: (loadId: string, loadRef: string) => void
}) {
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['freight-picker-loads', driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, status')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(25)
      if (error) throw error
      return (data ?? []) as Array<{
        id: string; load_number: string | null
        origin_city: string | null; origin_state: string | null
        dest_city: string | null; dest_state: string | null
        status: string
      }>
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        {isLoading ? (
          <p className="text-center text-sm text-gray-400 py-6">Loading…</p>
        ) : loads.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">No loads yet. Add one in the Loads tab.</p>
        ) : (
          <ul className="space-y-2">
            {loads.map(l => {
              const origin = [l.origin_city, l.origin_state].filter(Boolean).join(', ') || '—'
              const dest   = [l.dest_city,   l.dest_state].filter(Boolean).join(', ') || '—'
              const ref = l.load_number || `#${l.id.slice(0, 8)}`
              return (
                <li key={l.id}>
                  <button
                    onClick={() => onPick(l.id, l.load_number || l.id.slice(0, 8))}
                    className="w-full text-left bg-gray-50 rounded-xl p-3 active:bg-gray-100 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500">{ref}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-gray-600 uppercase tracking-wide">{l.status}</span>
                    </div>
                    <p className="text-sm text-gray-900 font-medium truncate">{origin}</p>
                    <p className="text-sm text-gray-900 font-medium truncate">→ {dest}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Quick fuel entry ─────────────────────────────────────────────────────────

// Lightweight bottom sheet for logging a fuel fill-up without opening the
// full Expenses tab. Writes to `expenses` with category='Fuel'. Amount
// auto-computes from gallons × price/gal but can be overridden.
function AddFuelSheet({ loadId, onClose }: { loadId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    expense_date:  new Date().toISOString().slice(0, 10),
    gallons:       '',
    price_per_gal: '',
    odometer:      '',
    vendor:        '',
    amount:        '', // computed but editable
    notes:         '',
  })
  const [amountTouched, setAmountTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Auto-compute amount from gallons × price unless user typed into it.
  const computedAmount = (() => {
    const g = parseFloat(form.gallons)
    const p = parseFloat(form.price_per_gal)
    if (!Number.isFinite(g) || !Number.isFinite(p)) return ''
    return (g * p).toFixed(2)
  })()
  const effectiveAmount = amountTouched ? form.amount : computedAmount

  const save = useMutation({
    mutationFn: async () => {
      const amountNum = parseFloat(effectiveAmount)
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error('Enter gallons and price per gallon, or type an amount.')
      }
      const payload = {
        expense_date:  form.expense_date || new Date().toISOString().slice(0, 10),
        category:      'Fuel',
        amount:        amountNum,
        gallons:       form.gallons       ? parseFloat(form.gallons)       : null,
        price_per_gal: form.price_per_gal ? parseFloat(form.price_per_gal) : null,
        odometer:      form.odometer      ? parseFloat(form.odometer)      : null,
        vendor:        form.vendor || null,
        notes:         form.notes  || null,
        load_id:       loadId,
      }
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-expenses'] })
      qc.invalidateQueries({ queryKey: ['driver-summary'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby="add-fuel-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="add-fuel-title" className="text-lg font-bold text-gray-900">Add Fuel</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={form.expense_date}
              onChange={e => set('expense_date', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Gallons</label>
              <input
                type="number" inputMode="decimal" placeholder="0.0"
                value={form.gallons}
                onChange={e => set('gallons', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price / gal</label>
              <input
                type="number" inputMode="decimal" placeholder="0.00"
                value={form.price_per_gal}
                onChange={e => set('price_per_gal', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Amount {!amountTouched && effectiveAmount && <span className="text-gray-400 font-normal">· auto</span>}
            </label>
            <input
              type="number" inputMode="decimal" placeholder="0.00"
              value={effectiveAmount}
              onChange={e => { setAmountTouched(true); set('amount', e.target.value) }}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Odometer</label>
            <input
              type="number" inputMode="numeric" placeholder="miles"
              value={form.odometer}
              onChange={e => set('odometer', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <input
              placeholder="Love's, Pilot, TA, etc."
              value={form.vendor}
              onChange={e => set('vendor', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input
              placeholder="DEF, cash discount, etc."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {save.isPending ? 'Saving…' : 'Save Fuel Entry'}
        </button>
      </div>
    </div>
  )
}

// ── Carrier / broker FMCSA lookup sheet ──────────────────────────────────────

function CarrierLookupSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'mc' | 'dot' | 'name'>('mc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snap, setSnap] = useState<import('../lib/ai').BrokerSnapshot | null>(null)
  const [candidates, setCandidates] = useState<import('../lib/ai').BrokerNameCandidate[] | null>(null)
  const [saving, setSaving] = useState<'broker' | 'customer' | null>(null)
  const [savedAs, setSavedAs] = useState<'broker' | 'customer' | null>(null)

  async function runLookup() {
    setError(null); setSnap(null); setSavedAs(null); setCandidates(null)
    if (mode === 'name') {
      const q = query.trim()
      if (q.length < 2) { setError('Enter at least 2 characters of the company name'); return }
      setBusy(true)
      try {
        const { searchBrokerByName } = await import('../lib/ai')
        const list = await searchBrokerByName(q)
        if (list.length === 0) setError('No FMCSA matches for that name')
        setCandidates(list)
      } catch (e) {
        setError((e as Error).message)
      } finally { setBusy(false) }
      return
    }
    const digits = query.replace(/\D/g, '')
    if (!digits) { setError('Enter an MC# or DOT#'); return }
    setBusy(true)
    try {
      const { checkBroker } = await import('../lib/ai')
      const s = await checkBroker(mode === 'mc' ? { mc: digits } : { dot: digits })
      setSnap(s)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // User picked a candidate from the name-search results — pull the full
  // snapshot by DOT # so they can review and save.
  async function pickCandidate(dot: string) {
    setBusy(true); setError(null); setSnap(null); setCandidates(null)
    try {
      const { checkBroker } = await import('../lib/ai')
      const s = await checkBroker({ dot })
      setSnap(s)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  // Persist the looked-up carrier as a broker or customer record. We pull
  // the obvious fields straight from the FMCSA snapshot; the user can
  // always edit later in the Brokers/Customers screen on the web.
  async function save(kind: 'broker' | 'customer') {
    if (!snap) return
    setSaving(kind); setError(null)
    try {
      const name = snap.legal_name || snap.dba_name || 'Unnamed carrier'
      if (kind === 'broker') {
        const { error } = await supabase.from('brokers').insert({
          name,
          phone:      snap.phone        || null,
          mc_number:  snap.mc_number    || null,
          dot_number: snap.dot_number   || null,
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['brokers-simple'] })
        qc.invalidateQueries({ queryKey: ['brokers-driver'] })
      } else {
        const { error } = await supabase.from('customers').insert({
          name,
          phone:      snap.phone            || null,
          address:    snap.physical_address || null,
          mc_number:  snap.mc_number        || null,
          dot_number: snap.dot_number       || null,
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['customers-simple'] })
      }
      setSavedAs(kind)
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Verify carrier / broker</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          {(['mc', 'dot', 'name'] as const).map(k => {
            const on = mode === k
            return (
              <button key={k} onClick={() => { setMode(k); setQuery(''); setCandidates(null); setSnap(null); setError(null) }}
                className="py-2 rounded-lg text-sm font-semibold cursor-pointer"
                style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
                {k === 'mc' ? 'MC #' : k === 'dot' ? 'DOT #' : 'Name'}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runLookup() }}
            placeholder={mode === 'mc' ? 'e.g. 090949' : mode === 'dot' ? 'e.g. 3126831' : 'Acme Freight'}
            inputMode={mode === 'name' ? 'text' : 'numeric'}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
          />
          <button type="button" onClick={runLookup} disabled={busy || !query.trim()}
            className="px-5 py-3 rounded-xl text-white text-base font-semibold disabled:opacity-60 cursor-pointer"
            style={{ background: 'var(--color-brand-500)' }}>
            {busy ? '…' : mode === 'name' ? 'Search' : 'Verify'}
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {candidates && candidates.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Tap a match to load full details</p>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {candidates.map(c => (
                <li key={c.dot_number ?? c.legal_name}>
                  <button onClick={() => c.dot_number && pickCandidate(c.dot_number)}
                    disabled={!c.dot_number || busy}
                    className="w-full text-left bg-gray-50 rounded-xl p-3 active:bg-gray-100 cursor-pointer disabled:opacity-50">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.legal_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.dot_number ? `DOT# ${c.dot_number}` : '—'}{c.location ? ` · ${c.location}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {snap && (
          <div className="mt-4 space-y-3">
            <CarrierLookupCard snap={snap} />

            {savedAs ? (
              <p className="text-center text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Saved as {savedAs}. You'll see it in the {savedAs === 'broker' ? 'Broker' : 'Customer'} picker next time.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => save('broker')}
                  disabled={saving !== null}
                  className="py-3 rounded-xl text-white text-base font-semibold disabled:opacity-60 cursor-pointer"
                  style={{ background: 'var(--color-brand-500)' }}
                >
                  {saving === 'broker' ? 'Saving…' : 'Save as broker'}
                </button>
                <button
                  onClick={() => save('customer')}
                  disabled={saving !== null}
                  className="py-3 rounded-xl text-base font-semibold border disabled:opacity-60 cursor-pointer bg-white"
                  style={{ borderColor: 'var(--color-brand-500)', color: 'var(--color-brand-500)' }}
                >
                  {saving === 'customer' ? 'Saving…' : 'Save as customer'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CarrierLookupCard({ snap }: { snap: import('../lib/ai').BrokerSnapshot }) {
  const hasFatal   = snap.risk_flags.some(f => f === 'out_of_service' || f === 'not_authorized')
  const hasWarning = !hasFatal && snap.risk_flags.length > 0
  const tone = hasFatal
    ? { bg: 'rgb(254, 226, 226)', border: '#fca5a5', text: '#991b1b' }
    : hasWarning
      ? { bg: 'rgb(254, 243, 199)', border: '#fcd34d', text: '#92400e' }
      : { bg: 'rgb(220, 252, 231)', border: '#86efac', text: '#14532d' }
  const FLAG_LABEL: Record<string, string> = {
    out_of_service:    'Out of service',
    not_authorized:    'Not authorized',
    high_vehicle_oos:  'High vehicle OOS rate',
    high_driver_oos:   'High driver OOS rate',
    no_name_on_record: 'Missing legal name',
  }
  return (
    <div className="rounded-xl p-4 text-sm"
      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-base">{snap.legal_name || snap.dba_name || 'Unnamed carrier'}</span>
        <span className="font-mono text-xs opacity-80">
          {[
            snap.mc_number  ? `MC# ${snap.mc_number}`   : null,
            snap.dot_number ? `DOT# ${snap.dot_number}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
      </div>
      {snap.dba_name && snap.legal_name && snap.dba_name !== snap.legal_name && (
        <p className="mb-0.5 text-xs"><span className="opacity-70">DBA:</span> {snap.dba_name}</p>
      )}
      {snap.operating_status && <p className="mb-0.5 text-xs"><span className="opacity-70">Authority:</span> {snap.operating_status}</p>}
      {snap.entity_type && <p className="mb-0.5 text-xs"><span className="opacity-70">Entity:</span> {snap.entity_type}</p>}
      {snap.physical_address && <p className="mb-0.5 text-xs"><span className="opacity-70">Address:</span> {snap.physical_address}</p>}
      {snap.phone && <p className="mb-0.5 text-xs"><span className="opacity-70">Phone:</span> {snap.phone}</p>}
      {(snap.power_units != null || snap.drivers != null) && (
        <p className="mb-0.5 text-xs">
          <span className="opacity-70">Fleet:</span> {snap.power_units ?? '—'} units · {snap.drivers ?? '—'} drivers
        </p>
      )}
      {(snap.oos_rate_vehicle != null || snap.oos_rate_driver != null) && (
        <p className="mb-0.5 text-xs">
          <span className="opacity-70">OOS:</span>{' '}
          {snap.oos_rate_vehicle != null ? `vehicle ${snap.oos_rate_vehicle}%` : ''}
          {snap.oos_rate_vehicle != null && snap.oos_rate_driver != null ? ' · ' : ''}
          {snap.oos_rate_driver != null ? `driver ${snap.oos_rate_driver}%` : ''}
        </p>
      )}
      {snap.risk_flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {snap.risk_flags.map(f => (
            <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: tone.text, color: tone.bg }}>
              {FLAG_LABEL[f] ?? f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

