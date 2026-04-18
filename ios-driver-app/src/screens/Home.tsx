import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
import { captureBol, uploadBol } from '../lib/bolDocuments'
import { captureStampedPhoto } from '../lib/stampedCamera'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import { ExpirationsCard } from '../components/ExpirationsCard'
import { LoadCalendar } from '../components/LoadCalendar'
import type { Driver } from '../hooks/useDriver'

const ACTIVE_STATUSES = ['Assigned', 'In Transit']

type Range = 'week' | 'month' | 'year'

function startOfWeek(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(d.getDate() + diff)
  return monday
}

function startOfMonth(d = new Date()) {
  const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x
}

function startOfYear(d = new Date()) {
  const x = new Date(d.getFullYear(), 0, 1); x.setHours(0, 0, 0, 0); return x
}

const RANGE_LABEL: Record<Range, string> = { week: 'Week', month: 'Month', year: 'Year' }

function Summary({ driverId }: { driverId: string }) {
  const [range, setRange] = useState<Range>('week')

  const { data } = useQuery({
    queryKey: ['driver-summary', driverId, range],
    queryFn: async () => {
      const since = (range === 'week' ? startOfWeek() : range === 'month' ? startOfMonth() : startOfYear()).toISOString()
      const [loadsRes, expensesRes] = await Promise.all([
        supabase.from('loads')
          .select('rate, miles, deadhead_miles')
          .eq('driver_id', driverId)
          .eq('status', 'Delivered')
          .gte('created_at', since),
        // Expenses for the same window. Currently expenses aren't tied to a
        // driver, so we sum everything for the company — close enough for a
        // solo owner-operator. (Filter by expense_date so the net matches the
        // earnings window.)
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
      return { gross, expenses, net, miles, loads: loads.length, rpm: miles > 0 ? gross / miles : 0 }
    },
  })
  const r = data ?? { gross: 0, expenses: 0, net: 0, miles: 0, loads: 0, rpm: 0 }
  const fmtK = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['week', 'month', 'year'] as Range[]).map(r => {
            const on = r === range
            return (
              <button key={r} onClick={() => setRange(r)}
                className="px-3 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-colors"
                style={on ? { background: 'white', color: '#c8410a' } : { color: '#6b7280' }}>
                {RANGE_LABEL[r]}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-gray-400">{r.loads} delivered</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[11px] text-gray-400">Gross</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{fmtK(r.gross)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">Net (after expenses)</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: r.net >= 0 ? '#16a34a' : '#dc2626' }}>
            {fmtK(r.net)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[11px] text-gray-400">Expenses</p>
          <p className="text-sm font-semibold text-gray-700 mt-0.5">{fmtK(r.expenses)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">Miles</p>
          <p className="text-sm font-semibold text-gray-700 mt-0.5">{r.miles.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">$/mile</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: '#c8410a' }}>
            {r.miles > 0 ? '$' + r.rpm.toFixed(2) : '—'}
          </p>
        </div>
      </div>
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

  const markDelivered = useMutation({
    mutationFn: async (loadId: string) => {
      const { error } = await supabase.from('loads').update({ status: 'Delivered' }).eq('id', loadId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active-load', driver.id] }),
    onError: (e: Error) => alert(e.message),
  })

  const checkIn = useMutation({
    mutationFn: async () => {
      const { Geolocation } = await import('@capacitor/geolocation')
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      const { error } = await supabase.from('load_checkins').insert({
        load_id: activeLoad?.id ?? null,
        driver_id: driver.id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      })
      if (error) throw error
    },
    onError: (e: Error) => alert('Check-in failed: ' + e.message),
    onSuccess: () => alert('Checked in.'),
  })

  const capturePod = useMutation({
    mutationFn: async () => {
      if (!activeLoad) throw new Error('No active load')
      const { blob, filename, mimeType } = await captureBol()
      await uploadBol({
        loadId:  activeLoad.id,
        loadRef: activeLoad.load_number || activeLoad.id.slice(0, 8),
        blob, filename, mimeType,
      })
    },
    onError: (e: Error) => alert('POD failed: ' + e.message),
    onSuccess: () => alert('POD uploaded and saved to Files.'),
  })

  const pickFromFiles = useMutation({
    mutationFn: async (file: File) => {
      if (!activeLoad) throw new Error('No active load')
      await uploadBol({
        loadId:  activeLoad.id,
        loadRef: activeLoad.load_number || activeLoad.id.slice(0, 8),
        blob:     file,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
    },
    onError: (e: Error) => alert('Upload failed: ' + e.message),
    onSuccess: () => alert('Document uploaded.'),
  })

  const captureFreight = useMutation({
    mutationFn: async () => {
      if (!activeLoad) throw new Error('No active load')
      const stamped = await captureStampedPhoto()
      if (!stamped) return
      const bytes = Uint8Array.from(atob(stamped.base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: stamped.mimeType })
      await uploadBol({
        loadId:  activeLoad.id,
        loadRef: activeLoad.load_number || activeLoad.id.slice(0, 8),
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

  return (
    <>
    <div className="space-y-5 pb-28">
      {activeLoad ? (
        <div>
          <h2 className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active load</h2>
          <LoadCard load={activeLoad} onTap={onGoToLoads} />
          <button
            type="button"
            onClick={onOpenDriverMode}
            aria-label="Open Driver Mode"
            className="mt-2 w-full min-h-14 rounded-2xl bg-[#c8410a] text-white text-base font-semibold active:opacity-90 cursor-pointer flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </svg>
            Driver Mode
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
            <span className="w-11 h-11 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center text-xl" aria-hidden>⛽</span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Add Fuel</span>
              <span className="block text-[11px] text-gray-500">Gallons, price, odometer</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => captureFreight.mutate()}
            disabled={!activeLoad || captureFreight.isPending}
            className="bg-white rounded-2xl p-4 text-left active:bg-gray-50 disabled:opacity-40 cursor-pointer flex items-center gap-3"
          >
            <span className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl" aria-hidden>📸</span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {captureFreight.isPending ? 'Uploading…' : 'Capture Freight'}
              </span>
              <span className="block text-[11px] text-gray-500">Time-stamped photo of cargo</span>
            </span>
          </button>
        </div>
      </div>

      <Summary driverId={driver.id} />

      <ExpirationsCard driverId={driver.id} />

      <LoadCalendar driverId={driver.id} />
    </div>

    {/* Fixed quick-action bar — always reachable above the tab bar. */}
    <div
      className="fixed left-0 right-0 z-30 bg-white/90 backdrop-blur border-t border-gray-200 px-4 pt-2"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)' }}
      role="toolbar"
      aria-label="Quick actions"
    >
      <div className="grid grid-cols-4 gap-2 pb-2">
        <button onClick={() => capturePod.mutate()} disabled={!activeLoad || capturePod.isPending}
          className="bg-white rounded-xl border border-gray-100 py-2.5 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-xl leading-none">📷</span>
          <span className="block text-[11px] font-medium text-gray-700 mt-0.5">
            {capturePod.isPending ? 'Uploading…' : 'Capture POD'}
          </span>
        </button>

        <label
          htmlFor="bol-files-picker"
          aria-disabled={!activeLoad || pickFromFiles.isPending || undefined}
          className={`bg-white rounded-xl border border-gray-100 py-2.5 text-center active:bg-gray-50 cursor-pointer ${(!activeLoad || pickFromFiles.isPending) ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <span className="block text-xl leading-none">📁</span>
          <span className="block text-[11px] font-medium text-gray-700 mt-0.5">
            {pickFromFiles.isPending ? 'Uploading…' : 'From Files'}
          </span>
        </label>
        <input
          id="bol-files-picker"
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={!activeLoad || pickFromFiles.isPending}
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pickFromFiles.mutate(f)
          }}
        />

        <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending}
          className="bg-white rounded-xl border border-gray-100 py-2.5 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-xl leading-none">📍</span>
          <span className="block text-[11px] font-medium text-gray-700 mt-0.5">
            {checkIn.isPending ? 'Pinging…' : 'Check In'}
          </span>
        </button>
        <button onClick={() => activeLoad && markDelivered.mutate(activeLoad.id)}
          disabled={!activeLoad || markDelivered.isPending}
          className="bg-white rounded-xl border border-gray-100 py-2.5 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-xl leading-none">✓</span>
          <span className="block text-[11px] font-medium text-gray-700 mt-0.5">
            {markDelivered.isPending ? 'Saving…' : 'Mark Delivered'}
          </span>
        </button>
      </div>
    </div>

    {fuelSheetOpen && (
      <AddFuelSheet
        loadId={activeLoad?.id ?? null}
        onClose={() => setFuelSheetOpen(false)}
      />
    )}
    </>
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
          style={{ background: '#c8410a' }}
        >
          {save.isPending ? 'Saving…' : 'Save Fuel Entry'}
        </button>
      </div>
    </div>
  )
}
