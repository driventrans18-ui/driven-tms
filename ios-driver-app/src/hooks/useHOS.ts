import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { computeHos, type HosEvent, type HosSummary, type HosStatus, WARN_THRESHOLDS_MS } from '../lib/hos'

async function scheduleWarning(minutes: number) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(minutes),
        title: 'HOS warning',
        body: `${minutes} minutes of drive time remaining.`,
        schedule: { at: new Date(Date.now() + 1000) },
      }],
    })
  } catch { /* web / no plugin */ }
}

export function useHos(driverId: string | undefined) {
  const qc = useQueryClient()
  const [now, setNow] = useState(Date.now())

  const { data: events = [] } = useQuery({
    enabled: Boolean(driverId),
    queryKey: ['hos-events', driverId],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('hos_events')
        .select('*')
        .eq('driver_id', driverId as string)
        .gte('started_at', since)
        .order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as HosEvent[]
    },
    refetchInterval: 60_000,
  })

  // Tick the clock every second while driving so the timer updates.
  useEffect(() => {
    const open = events.some(e => e.status === 'driving' && !e.ended_at)
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [events])

  // Fire local notifications as remaining time crosses thresholds.
  useEffect(() => {
    const s: HosSummary = computeHos(events, now)
    if (!s.driving) return
    const key = `hos-warn-seen:${driverId}`
    const seen = new Set<number>(JSON.parse(sessionStorage.getItem(key) ?? '[]'))
    for (const t of WARN_THRESHOLDS_MS) {
      if (s.remainingMs <= t && !seen.has(t)) {
        seen.add(t)
        void scheduleWarning(t / 60_000)
      }
    }
    sessionStorage.setItem(key, JSON.stringify([...seen]))
  }, [events, now, driverId])

  const summary: HosSummary = computeHos(events, now)

  const setStatus = useMutation({
    mutationFn: async (status: HosStatus) => {
      if (!driverId) return
      // Close any open event.
      const open = events.find(e => !e.ended_at)
      if (open) {
        const { error } = await supabase.from('hos_events')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', open.id)
        if (error) throw error
      }
      // Open a new one.
      const { error } = await supabase.from('hos_events').insert({
        driver_id: driverId,
        status,
        started_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hos-events', driverId] }),
  })

  return { summary, setStatus }
}
