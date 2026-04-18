import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { captureBol, uploadBol } from '../lib/bolDocuments'
import {
  Button, InlineError, impactMedium, impactHeavy, notifySuccess, notifyError,
} from '../components/ui'
import type { Driver } from '../hooks/useDriver'

// ── Types ────────────────────────────────────────────────────────────────────

interface DriverLoad {
  id: string
  load_number: string | null
  status: string
  origin_city: string | null
  origin_state: string | null
  dest_city:   string | null
  dest_state:  string | null
  pickup_at:   string | null
  deliver_by:  string | null
  brokers: { id: string; name: string; phone: string | null } | null
}

type StopKind = 'pickup' | 'delivery'

// ── Driver Mode screen ───────────────────────────────────────────────────────

// A focused, full-screen mode the driver can use one-handed near the wheel
// (stopped, hands free, or mounted). Surfaces only:
//   - current load + next stop address with one-tap Apple Maps navigation
//   - call-broker
//   - photo-upload for POD
//   - mark delivered
//   - check-in (GPS breadcrumb)
// Tap targets are ≥ 60pt; typography is display-sized so it's readable in a
// moving cab. Button labels are plain English so iOS Voice Control can target
// them by name.
export function DriverMode({ driver, onExit }: { driver: Driver; onExit: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: load, refetch, isLoading } = useQuery({
    queryKey: ['driver-mode-load', driver.id],
    queryFn: async (): Promise<DriverLoad | null> => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, status, origin_city, origin_state, dest_city, dest_state, pickup_at, deliver_by, brokers(id, name, phone)')
        .eq('driver_id', driver.id)
        .in('status', ['Assigned', 'In Transit'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      return (data ?? null) as DriverLoad | null
    },
    staleTime: 10_000,
  })

  const nextStop = useMemo<StopKind>(
    () => (load?.status === 'In Transit' ? 'delivery' : 'pickup'),
    [load?.status],
  )

  const stopCity  = nextStop === 'pickup' ? load?.origin_city : load?.dest_city
  const stopState = nextStop === 'pickup' ? load?.origin_state : load?.dest_state
  const stopTime  = nextStop === 'pickup' ? load?.pickup_at   : load?.deliver_by

  const checkIn = useMutation({
    mutationFn: async () => {
      const { Geolocation } = await import('@capacitor/geolocation')
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      const { error } = await supabase.from('load_checkins').insert({
        load_id: load?.id ?? null,
        driver_id: driver.id,
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
      })
      if (error) throw error
    },
    onSuccess: () => { void notifySuccess() },
    onError:   (e: Error) => { setError(`Check-in failed: ${e.message}`); void notifyError() },
  })

  const loadRef = load ? (load.load_number || load.id.slice(0, 8)) : ''

  const capturePod = useMutation({
    mutationFn: async () => {
      if (!load) throw new Error('No active load')
      const { blob, filename, mimeType } = await captureBol()
      await uploadBol({ loadId: load.id, loadRef, blob, filename, mimeType })
    },
    onSuccess: () => { void notifySuccess() },
    onError:   (e: Error) => {
      if (e.message.toLowerCase().includes('cancel')) return
      setError(`POD upload failed: ${e.message}`); void notifyError()
    },
  })

  const pickFromFiles = useMutation({
    mutationFn: async (file: File) => {
      if (!load) throw new Error('No active load')
      await uploadBol({
        loadId: load.id, loadRef,
        blob: file,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
    },
    onSuccess: () => { void notifySuccess() },
    onError:   (e: Error) => { setError(`Upload failed: ${e.message}`); void notifyError() },
  })

  const markDelivered = useMutation({
    mutationFn: async () => {
      if (!load) throw new Error('No active load')
      const { error } = await supabase.from('loads').update({ status: 'Delivered' }).eq('id', load.id)
      if (error) throw error
    },
    onSuccess: () => {
      void impactHeavy(); void notifySuccess()
      qc.invalidateQueries({ queryKey: ['driver-mode-load', driver.id] })
      qc.invalidateQueries({ queryKey: ['active-load', driver.id] })
      qc.invalidateQueries({ queryKey: ['my-loads', driver.id] })
    },
    onError: (e: Error) => { setError(`Delivery update failed: ${e.message}`); void notifyError() },
  })

  function callBroker() {
    if (!load?.brokers?.phone) return
    void impactMedium()
    window.location.href = `tel:${load.brokers.phone.replace(/[^\d+]/g, '')}`
  }

  function openNavigation() {
    if (!stopCity) return
    void impactMedium()
    const q = [stopCity, stopState].filter(Boolean).join(', ')
    window.location.href = `https://maps.apple.com/?daddr=${encodeURIComponent(q)}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-bg"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      role="region"
      aria-label="Driver Mode"
    >
      {/* Top bar — minimal chrome, just identity + exit */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-widest text-text-secondary">
            Driver Mode
          </span>
        </div>
        <button
          type="button"
          onClick={() => { void impactMedium(); onExit() }}
          className="min-h-11 px-4 rounded-md text-base font-semibold text-brand-500 active:bg-brand-100"
        >
          Exit
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {isLoading ? (
          <p className="text-center text-base text-text-tertiary py-12">Loading…</p>
        ) : !load ? (
          <NoActiveLoad onRefresh={() => refetch()} />
        ) : (
          <>
            <LoadHeader load={load} />
            <NextStopCard
              kind={nextStop}
              city={stopCity}
              state={stopState}
              time={stopTime}
              onNavigate={openNavigation}
            />
            <ActionGrid
              canCall={!!load.brokers?.phone}
              brokerName={load.brokers?.name ?? null}
              onCall={callBroker}
              onCapturePod={() => capturePod.mutate()}
              podBusy={capturePod.isPending}
              onPickFile={(f) => pickFromFiles.mutate(f)}
              pickBusy={pickFromFiles.isPending}
              onCheckIn={() => checkIn.mutate()}
              checkInBusy={checkIn.isPending}
              onMarkDelivered={() => markDelivered.mutate()}
              deliveredBusy={markDelivered.isPending}
              deliveredDisabled={load.status === 'Delivered'}
            />
          </>
        )}
        {error && <InlineError message={error} />}
      </main>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LoadHeader({ load }: { load: DriverLoad }) {
  const label = load.load_number || `#${load.id.slice(0, 8)}`
  return (
    <section aria-label="Current load" className="rounded-lg bg-surface-card border border-border-subtle p-5 shadow-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
        Current load
      </p>
      <p className="mt-1 text-3xl font-bold text-text-primary tabular">{label}</p>
      {load.brokers?.name && (
        <p className="mt-1 text-base text-text-secondary">{load.brokers.name}</p>
      )}
    </section>
  )
}

function NextStopCard({
  kind, city, state, time, onNavigate,
}: {
  kind: StopKind
  city: string | null | undefined
  state: string | null | undefined
  time: string | null | undefined
  onNavigate: () => void
}) {
  const hasAddress = !!city
  const address = [city, state].filter(Boolean).join(', ')
  const heading = kind === 'pickup' ? 'Pickup' : 'Delivery'
  return (
    <section aria-label="Next stop" className="rounded-lg bg-surface-card border-2 border-brand-500/30 p-5 shadow-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
        Next stop — {heading}
      </p>
      <p className="mt-2 text-3xl font-bold text-text-primary leading-tight">
        {hasAddress ? address : 'Address not set'}
      </p>
      {time && (
        <p className="mt-1 text-base text-text-secondary tabular">
          {new Date(time).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </p>
      )}
      <button
        type="button"
        onClick={onNavigate}
        disabled={!hasAddress}
        aria-label={`Navigate to ${heading.toLowerCase()} in Apple Maps`}
        className="mt-4 w-full min-h-16 rounded-lg bg-brand-500 text-text-on-brand text-xl font-bold active:bg-brand-600 disabled:opacity-40 flex items-center justify-center gap-3"
      >
        <NavIcon />
        Navigate
      </button>
    </section>
  )
}

function ActionGrid({
  canCall, brokerName,
  onCall, onCapturePod, podBusy,
  onPickFile, pickBusy,
  onCheckIn, checkInBusy,
  onMarkDelivered, deliveredBusy, deliveredDisabled,
}: {
  canCall: boolean
  brokerName: string | null
  onCall: () => void
  onCapturePod: () => void; podBusy: boolean
  onPickFile: (f: File) => void; pickBusy: boolean
  onCheckIn: () => void; checkInBusy: boolean
  onMarkDelivered: () => void; deliveredBusy: boolean; deliveredDisabled: boolean
}) {
  return (
    <section aria-label="Driver actions" className="grid grid-cols-2 gap-3">
      <BigAction
        label={canCall ? `Call ${brokerName ?? 'broker'}` : 'No broker phone'}
        sublabel={canCall ? 'Broker' : undefined}
        icon={<PhoneIcon />}
        onClick={onCall}
        disabled={!canCall}
      />
      <BigAction
        label={podBusy ? 'Uploading…' : 'Capture POD'}
        sublabel="Camera"
        icon={<CameraIcon />}
        onClick={onCapturePod}
        disabled={podBusy}
      />
      <FilePickAction
        busy={pickBusy}
        onPick={onPickFile}
      />
      <BigAction
        label={checkInBusy ? 'Pinging…' : 'Check-in'}
        sublabel="GPS"
        icon={<PinIcon />}
        onClick={onCheckIn}
        disabled={checkInBusy}
      />
      <BigAction
        label={deliveredBusy ? 'Saving…' : 'Mark Delivered'}
        sublabel="Complete"
        icon={<CheckIcon />}
        variant="success"
        onClick={onMarkDelivered}
        disabled={deliveredBusy || deliveredDisabled}
        className="col-span-2"
      />
    </section>
  )
}

function FilePickAction({ busy, onPick }: { busy: boolean; onPick: (f: File) => void }) {
  const id = 'driver-mode-bol-files'
  const label = busy ? 'Uploading…' : 'Upload BOL'
  return (
    <>
      <input
        id={id}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        disabled={busy}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) { void impactMedium(); onPick(f) }
        }}
      />
      <label
        htmlFor={id}
        aria-label={label}
        className={`bg-surface-card text-text-primary border border-border-subtle active:bg-surface-muted min-h-24 rounded-lg px-4 py-4 flex flex-col justify-between shadow-1 ${busy ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
      >
        <div className="text-brand-500"><FolderIcon /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">Files</p>
          <p className="text-lg font-bold leading-tight">{label}</p>
        </div>
      </label>
    </>
  )
}

function BigAction({
  label, sublabel, icon, onClick, disabled, variant = 'default', className = '',
}: {
  label: string
  sublabel?: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'success'
  className?: string
}) {
  const surface = variant === 'success'
    ? 'bg-success-500 text-text-on-brand active:bg-success-500/90'
    : 'bg-surface-card text-text-primary border border-border-subtle active:bg-surface-muted'
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) { void impactMedium(); onClick() } }}
      disabled={disabled}
      aria-label={label}
      className={`${surface} min-h-24 rounded-lg px-4 py-4 text-left flex flex-col justify-between disabled:opacity-40 shadow-1 ${className}`}
    >
      <div className={variant === 'success' ? 'text-text-on-brand' : 'text-brand-500'}>{icon}</div>
      <div>
        {sublabel && (
          <p className={`text-xs font-semibold uppercase tracking-widest ${variant === 'success' ? 'text-text-on-brand/80' : 'text-text-tertiary'}`}>
            {sublabel}
          </p>
        )}
        <p className="text-lg font-bold leading-tight">{label}</p>
      </div>
    </button>
  )
}

function NoActiveLoad({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-lg bg-surface-card border border-border-subtle p-6 text-center">
      <p className="text-lg font-semibold text-text-primary">No active load</p>
      <p className="mt-1 text-base text-text-secondary">
        Assign yourself a load from the Loads tab to use Driver Mode.
      </p>
      <div className="mt-4">
        <Button variant="secondary" size="lg" onClick={onRefresh}>Refresh</Button>
      </div>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l18-8-8 18-2-8-8-2z" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2L7.9 9.8a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l5 5L20 7" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 12v5" />
      <path d="M10 14l2-2 2 2" />
    </svg>
  )
}
