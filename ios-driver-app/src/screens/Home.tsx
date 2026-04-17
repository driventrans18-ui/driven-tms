import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import { ExpirationsCard } from '../components/ExpirationsCard'
import { LoadCalendar } from '../components/LoadCalendar'
import type { Driver } from '../hooks/useDriver'

const ACTIVE_STATUSES = ['Assigned', 'In Transit']

function startOfWeek(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(d.getDate() + diff)
  return monday
}

function WeekSummary({ driverId }: { driverId: string }) {
  const { data } = useQuery({
    queryKey: ['week-summary', driverId],
    queryFn: async () => {
      const since = startOfWeek().toISOString()
      const { data, error } = await supabase.from('loads')
        .select('rate, miles, status')
        .eq('driver_id', driverId)
        .eq('status', 'Delivered')
        .gte('created_at', since)
      if (error) throw error
      const rows = (data ?? []) as Array<{ rate: number | null; miles: number | null }>
      const revenue = rows.reduce((s, r) => s + (r.rate ?? 0), 0)
      const miles   = rows.reduce((s, r) => s + (r.miles ?? 0), 0)
      return { revenue, miles, loads: rows.length, rpm: miles > 0 ? revenue / miles : 0 }
    },
  })
  const r = data ?? { revenue: 0, miles: 0, loads: 0, rpm: 0 }
  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This week</h2>
        <span className="text-xs text-gray-400">{r.loads} delivered</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] text-gray-400">Revenue</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">Miles</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{r.miles.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">$/mile</p>
          <p className="text-xl font-bold mt-0.5" style={{ color: '#c8410a' }}>
            {r.miles > 0 ? '$' + r.rpm.toFixed(2) : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Home({ driver, onGoToLoads }: { driver: Driver; onGoToLoads: () => void }) {
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
    <div className="space-y-5">
      {activeLoad ? (
        <div>
          <h2 className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active load</h2>
          <LoadCard load={activeLoad} onTap={onGoToLoads} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center">
          <p className="text-sm text-gray-500">No active load. Pull a load from Loads tab.</p>
        </div>
      )}

      <WeekSummary driverId={driver.id} />

      <ExpirationsCard driverId={driver.id} />

      <LoadCalendar driverId={driver.id} />

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => capturePod.mutate()} disabled={!activeLoad || capturePod.isPending}
          className="bg-white rounded-2xl p-4 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-2xl">📷</span>
          <span className="block text-xs font-medium text-gray-700 mt-1">
            {capturePod.isPending ? 'Uploading…' : 'Capture POD'}
          </span>
        </button>
        <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending}
          className="bg-white rounded-2xl p-4 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-2xl">📍</span>
          <span className="block text-xs font-medium text-gray-700 mt-1">
            {checkIn.isPending ? 'Pinging…' : 'Check In'}
          </span>
        </button>
        <button onClick={() => activeLoad && markDelivered.mutate(activeLoad.id)}
          disabled={!activeLoad || markDelivered.isPending}
          className="bg-white rounded-2xl p-4 text-center active:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <span className="block text-2xl">✓</span>
          <span className="block text-xs font-medium text-gray-700 mt-1">
            {markDelivered.isPending ? 'Saving…' : 'Mark Delivered'}
          </span>
        </button>
      </div>
    </div>
  )
}
