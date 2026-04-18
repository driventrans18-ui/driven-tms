import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
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
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 80,
      })
      if (!photo.base64String) throw new Error('No photo captured')
      const fileName = `pod-${Date.now()}.${photo.format ?? 'jpg'}`
      const path = `${activeLoad.id}/${crypto.randomUUID()}-${fileName}`
      const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: `image/${photo.format ?? 'jpeg'}` })
      const { error: upErr } = await supabase.storage.from('load-documents').upload(path, blob, {
        contentType: `image/${photo.format ?? 'jpeg'}`,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('load_documents').insert({
        load_id: activeLoad.id,
        kind: 'pod',
        storage_path: path,
        file_name: fileName,
        mime_type: `image/${photo.format ?? 'jpeg'}`,
        file_size: blob.size,
      })
      if (dbErr) throw dbErr
    },
    onError: (e: Error) => alert('POD failed: ' + e.message),
    onSuccess: () => alert('POD uploaded.'),
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
      <div className="grid grid-cols-3 gap-2 pb-2">
        <button onClick={() => capturePod.mutate()} disabled={!activeLoad || capturePod.isPending}
          className="bg-white rounded-xl border border-gray-100 py-2.5 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-xl leading-none">📷</span>
          <span className="block text-[11px] font-medium text-gray-700 mt-0.5">
            {capturePod.isPending ? 'Uploading…' : 'Capture POD'}
          </span>
        </button>
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
    </>
  )
}
