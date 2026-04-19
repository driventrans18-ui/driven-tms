import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import { DocViewer } from '../components/DocViewer'
import { CityAutocomplete } from '../components/CityAutocomplete'
import { SwipeRow } from '../components/SwipeRow'
import { ScreenHeader, PlusButton } from '../components/ScreenHeader'
import { isDocScanAvailable, scanDocument } from '../lib/docScan'
import { captureStampedPhoto } from '../lib/stampedCamera'
import { uploadBol } from '../lib/bolDocuments'
import { estimateMiles } from '../lib/estimateMiles'
import { parseRateCon, type RateConPrefill } from '../lib/ai'
import type { Driver } from '../hooks/useDriver'

type DocKind = 'rate_con' | 'pod' | 'freight' | 'other'

interface LoadDocument {
  id: string
  load_id: string
  kind: DocKind
  storage_path: string
  file_name: string
  mime_type: string | null
  created_at: string
}

interface LoadDetail extends LoadCardLoad {
  created_at: string
  pickup_at: string | null
  deliver_by: string | null
  deadhead_miles: number | null
  pickup_rating: number | null
  pickup_notes: string | null
  delivery_rating: number | null
  delivery_notes: string | null
  shipper_name: string | null
  receiver_name: string | null
  brokers: { id: string; name: string; phone: string | null } | null
  trailers: { id: string; trailer_number: string | null } | null
}

type LoadStatus = 'Pending' | 'Assigned' | 'In Transit' | 'Delivered'

const TABS: Array<LoadStatus | 'All'> = ['All', 'Assigned', 'In Transit', 'Delivered']

const DOC_BUCKET = 'load-documents'

const LOAD_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'LTL', 'Other'] as const

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAppt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Apple Maps URL — iOS turns maps:// into native Maps; falls back to web Maps
// on the simulator.
function mapsUrl(parts: Array<string | null>) {
  const q = parts.filter(Boolean).join(', ')
  return `https://maps.apple.com/?daddr=${encodeURIComponent(q)}`
}

// 5-star picker. Tap the same star twice to clear.
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
          className="text-2xl leading-none cursor-pointer select-none"
          style={{ color: n <= value ? '#f59e0b' : '#d1d5db' }}>
          ★
        </button>
      ))}
    </div>
  )
}

export function Loads({ driver }: { driver: Driver }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<typeof TABS[number]>('All')
  const [open, setOpen] = useState<LoadDetail | null>(null)
  // `form` is null when closed, { editing: null } for a fresh load, or
  // { editing: <load> } when swipe-editing a row.
  const [form, setForm] = useState<{ editing: LoadDetail | null } | null>(null)

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['my-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, rate, miles, status, eta, load_type, created_at, pickup_at, deliver_by, deadhead_miles, pickup_rating, pickup_notes, delivery_rating, delivery_notes, shipper_name, receiver_name, brokers(id, name, phone), trailers(id, trailer_number)')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as LoadDetail[]
    },
  })

  const quickDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-loads', driver.id] })
      qc.invalidateQueries({ queryKey: ['active-load', driver.id] })
      qc.invalidateQueries({ queryKey: ['calendar-loads', driver.id] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Loads"
        action={<PlusButton onClick={() => setForm({ editing: null })} label="New load" />}
      />

      <div className="flex gap-1 bg-white rounded-xl p-1">
        {TABS.map(t => {
          const on = t === tab
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
              {t}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No loads.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => {
            const label = l.load_number || `#${l.id.slice(0, 8)}`
            return (
              <SwipeRow
                key={l.id}
                onEdit={() => setForm({ editing: l })}
                onDelete={() => {
                  if (confirm(`Delete load ${label}? This cannot be undone.`)) {
                    quickDelete.mutate(l.id)
                  }
                }}
              >
                <LoadCard load={l} onTap={() => setOpen(l)} />
              </SwipeRow>
            )
          })}
        </div>
      )}

      {open && <LoadSheet load={open} driverId={driver.id} onClose={() => setOpen(null)} />}
      {form && (
        <LoadFormSheet
          driverId={driver.id}
          editing={form.editing}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

// ── Load detail sheet ────────────────────────────────────────────────────────

function LoadSheet({ load, driverId, onClose }: { load: LoadDetail; driverId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ')
  const dest   = [load.dest_city,   load.dest_state].filter(Boolean).join(', ')

  const deleteLoad = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loads').delete().eq('id', load.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['active-load', driverId] })
      qc.invalidateQueries({ queryKey: ['calendar-loads', driverId] })
      onClose()
    },
    onError: (e: Error) => alert(e.message),
  })

  const confirmDelete = () => {
    const label = load.load_number || `#${load.id.slice(0, 8)}`
    if (confirm(`Delete load ${label}? This cannot be undone.`)) {
      deleteLoad.mutate()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{load.load_number || `#${load.id.slice(0, 8)}`}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <dl className="space-y-3 text-base">
          <Row k="Status" v={load.status} />
          <Row k="Origin" v={origin || '—'} />
          <Row k="Destination" v={dest || '—'} />
          <Row k="Broker" v={load.brokers?.name ?? '—'} />
          {load.shipper_name && <Row k="Shipper" v={load.shipper_name} />}
          {load.receiver_name && <Row k="Receiver" v={load.receiver_name} />}
          {load.trailers && <Row k="Trailer" v={load.trailers.trailer_number ?? '—'} />}
          <Row k="Type" v={load.load_type ?? '—'} />
          <Row k="Miles" v={load.miles != null ? load.miles.toLocaleString() : '—'} />
          {load.deadhead_miles != null && load.deadhead_miles > 0 && (
            <>
              <Row k="Deadhead" v={load.deadhead_miles.toLocaleString()} />
              <Row k="Total mi" v={((load.miles ?? 0) + load.deadhead_miles).toLocaleString()} />
            </>
          )}
          <Row k="Rate" v={load.rate != null ? '$' + load.rate.toLocaleString() : '—'} />
          <Row k="ETA" v={fmtDate(load.eta)} />
          <Row k="Pickup" v={fmtAppt(load.pickup_at)} />
          <Row k="Delivery" v={fmtAppt(load.deliver_by)} />
          {load.pickup_rating != null && <Row k="Pickup ★" v={`${load.pickup_rating} / 5`} />}
          {load.delivery_rating != null && <Row k="Delivery ★" v={`${load.delivery_rating} / 5`} />}
        </dl>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <a
            href={origin ? mapsUrl([load.origin_city, load.origin_state]) : undefined}
            aria-disabled={!origin}
            className="py-3 rounded-xl border border-gray-200 text-center text-sm font-semibold text-gray-800 active:bg-gray-50 data-[disabled]:opacity-40 cursor-pointer"
            data-disabled={!origin || undefined}
            target="_blank" rel="noreferrer"
          >
            Directions to pickup
          </a>
          <a
            href={dest ? mapsUrl([load.dest_city, load.dest_state]) : undefined}
            aria-disabled={!dest}
            className="py-3 rounded-xl border border-gray-200 text-center text-sm font-semibold text-gray-800 active:bg-gray-50 data-[disabled]:opacity-40 cursor-pointer"
            data-disabled={!dest || undefined}
            target="_blank" rel="noreferrer"
          >
            Directions to delivery
          </a>
        </div>

        <LoadDocs load={load} />

        {load.brokers?.phone && (
          <a href={`tel:${load.brokers.phone}`}
            className="block mt-4 py-3.5 rounded-xl text-center text-white text-base font-semibold"
            style={{ background: 'var(--color-brand-500)' }}>
            Call {load.brokers.name}
          </a>
        )}

        <button
          onClick={confirmDelete}
          disabled={deleteLoad.isPending}
          className="w-full mt-3 py-3 rounded-xl text-red-600 text-base font-semibold active:bg-red-50 disabled:opacity-50 cursor-pointer"
        >
          {deleteLoad.isPending ? 'Deleting…' : 'Delete load'}
        </button>
      </div>
    </div>
  )
}

// ── Load form sheet (create + edit) ──────────────────────────────────────────

// Read a File into a base64 string (no data:... prefix). Used when the
// driver picks a rate-con PDF or image from the Files app.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.substring(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Turn an ISO timestamp (or null) into the value `<input type="datetime-local">`
// expects: YYYY-MM-DDTHH:MM in local time.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function LoadFormSheet({ driverId, editing, onClose }: {
  driverId: string
  editing?: LoadDetail | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!editing
  const [form, setForm] = useState({
    load_number:   editing?.load_number   ?? '',
    status:        (editing?.status as LoadStatus) ?? 'Assigned',
    origin_city:   editing?.origin_city   ?? '',
    origin_state:  editing?.origin_state  ?? '',
    dest_city:     editing?.dest_city     ?? '',
    dest_state:    editing?.dest_state    ?? '',
    load_type:     editing?.load_type     ?? 'Dry Van',
    miles:         editing?.miles != null ? String(editing.miles) : '',
    rate:          editing?.rate  != null ? String(editing.rate)  : '',
    deadhead_miles: editing?.deadhead_miles != null ? String(editing.deadhead_miles) : '',
    pickup_rating:   editing?.pickup_rating   ?? 0,
    delivery_rating: editing?.delivery_rating ?? 0,
    pickup_notes:   editing?.pickup_notes   ?? '',
    delivery_notes: editing?.delivery_notes ?? '',
    shipper_name:   editing?.shipper_name   ?? '',
    receiver_name:  editing?.receiver_name  ?? '',
    eta:            editing?.eta ?? '',
    pickup_at:      isoToLocalInput(editing?.pickup_at ?? null),
    deliver_by:     isoToLocalInput(editing?.deliver_by ?? null),
    broker_id:   editing?.brokers?.id  ?? '',
    truck_id:    '',
    trailer_id:  editing?.trailers?.id ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [quickBrokerOpen,  setQuickBrokerOpen]  = useState(false)
  const [brokerPickerOpen, setBrokerPickerOpen] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Rate-con scan-to-prefill state. `scanning` gates the button; `scanBanner`
  // is the summary shown once Claude returns ("Auto-filled 11 of 15 fields")
  // so the driver knows to double-check the form before saving.
  const [scanning, setScanning] = useState(false)
  const [scanBanner, setScanBanner] = useState<string | null>(null)

  // Merge a RateConPrefill into the form, skipping nulls so Claude's "I don't
  // know" answers don't clobber whatever the user already typed. Returns the
  // count of fields it actually populated so the banner can show it.
  function applyPrefill(prefill: RateConPrefill): number {
    let filled = 0
    setForm(f => {
      const next = { ...f }
      const put = <K extends keyof typeof f>(key: K, value: (typeof f)[K] | null | undefined) => {
        if (value == null || value === '') return
        if ((next[key] as unknown) === value) return
        next[key] = value as (typeof f)[K]
        filled++
      }
      put('load_number',    prefill.load_number ?? '')
      put('origin_city',    prefill.origin_city ?? '')
      put('origin_state',   prefill.origin_state?.toUpperCase() ?? '')
      put('dest_city',      prefill.dest_city ?? '')
      put('dest_state',     prefill.dest_state?.toUpperCase() ?? '')
      put('shipper_name',   prefill.shipper_name ?? '')
      put('receiver_name',  prefill.receiver_name ?? '')
      put('pickup_notes',   prefill.pickup_notes ?? '')
      put('delivery_notes', prefill.delivery_notes ?? '')
      put('pickup_at',      prefill.pickup_at ?? '')   // ISO w/o tz matches datetime-local
      put('deliver_by',     prefill.deliver_by ?? '')
      if (LOAD_TYPES.includes(prefill.load_type as typeof LOAD_TYPES[number])) {
        put('load_type', prefill.load_type as typeof LOAD_TYPES[number])
      }
      if (prefill.miles != null) put('miles', String(prefill.miles))
      if (prefill.rate  != null) put('rate',  String(prefill.rate))

      // Broker auto-match by MC# first, then by name substring. If we find
      // one, select it; otherwise leave unset so the driver can + New broker…
      if (prefill.broker_mc) {
        const target = prefill.broker_mc.replace(/\D/g, '')
        const byMc = brokers.find(b => b.mc_number?.replace(/\D/g, '') === target)
        if (byMc) put('broker_id', byMc.id)
      }
      if (!next.broker_id && prefill.broker_name) {
        const needle = prefill.broker_name.toLowerCase()
        const byName = brokers.find(b => b.name.toLowerCase().includes(needle) || needle.includes(b.name.toLowerCase()))
        if (byName) put('broker_id', byName.id)
      }
      return next
    })
    return filled
  }

  async function scanToPrefill() {
    if (scanning) return
    setScanning(true); setError(null); setScanBanner(null)
    try {
      const images = await scanDocument()
      if (images.length === 0) return
      const { prefill, usage } = await parseRateCon({ images })
      const filled = applyPrefill(prefill)
      const cached = usage.cache_read > 0 ? ' (cached)' : ''
      setScanBanner(filled > 0
        ? `Auto-filled ${filled} field${filled === 1 ? '' : 's'} from rate con${cached}. Review before saving.`
        : `Couldn't extract any fields from that scan${cached}. Enter manually.`)
    } catch (e) {
      const msg = (e as Error).message
      if (!/cancel/i.test(msg)) setError(`Scan failed: ${msg}`)
    } finally {
      setScanning(false)
    }
  }

  // Pick a rate con PDF / image from the iOS Files app (iCloud Drive, email
  // downloads, etc.) and hand it to the edge function. Unlike scan, this is
  // always available — even on web / simulator where the camera doesn't
  // work, and for brokers who send rate cons as PDFs by email.
  async function fileToPrefill(file: File) {
    if (scanning) return
    setScanning(true); setError(null); setScanBanner(null)
    try {
      const base64 = await fileToBase64(file)
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const { prefill, usage } = isPdf
        ? await parseRateCon({ pdf: base64 })
        : await parseRateCon({ images: [base64], mimeType: file.type || 'image/jpeg' })
      const filled = applyPrefill(prefill)
      const cached = usage.cache_read > 0 ? ' (cached)' : ''
      setScanBanner(filled > 0
        ? `Auto-filled ${filled} field${filled === 1 ? '' : 's'} from ${isPdf ? 'PDF' : 'image'}${cached}. Review before saving.`
        : `Couldn't extract any fields from that file${cached}. Enter manually.`)
    } catch (e) {
      setError(`Parse failed: ${(e as Error).message}`)
    } finally {
      setScanning(false)
    }
  }

  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('id, name, mc_number, dot_number').order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string; mc_number: string | null; dot_number: string | null }>
    },
  })
  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number, make').order('unit_number')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; unit_number: string | null; make: string | null }>
    },
  })
  const { data: trailers = [] } = useQuery({
    queryKey: ['trailers-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trailers').select('id, trailer_number, license_plate').order('trailer_number')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; trailer_number: string | null; license_plate: string | null }>
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        load_number:  form.load_number || null,
        origin_city:  form.origin_city || null,
        origin_state: form.origin_state || null,
        dest_city:    form.dest_city || null,
        dest_state:   form.dest_state || null,
        load_type:    form.load_type,
        miles:        form.miles ? Number(form.miles) : null,
        rate:         form.rate  ? Number(form.rate)  : null,
        status:       form.status,
        eta:          form.eta || null,
        pickup_at:    form.pickup_at  ? new Date(form.pickup_at).toISOString()  : null,
        deliver_by:   form.deliver_by ? new Date(form.deliver_by).toISOString() : null,
        deadhead_miles:  form.deadhead_miles ? Number(form.deadhead_miles) : null,
        pickup_rating:   form.pickup_rating   > 0 ? form.pickup_rating   : null,
        pickup_notes:    form.pickup_notes    || null,
        delivery_rating: form.delivery_rating > 0 ? form.delivery_rating : null,
        delivery_notes:  form.delivery_notes  || null,
        shipper_name:  form.shipper_name || null,
        receiver_name: form.receiver_name || null,
        broker_id:    form.broker_id || null,
        truck_id:     form.truck_id  || null,
        trailer_id:   form.trailer_id || null,
        driver_id:    driverId,
      }
      const { error } = isEdit && editing
        ? await supabase.from('loads').update(payload).eq('id', editing.id)
        : await supabase.from('loads').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['active-load', driverId] })
      qc.invalidateQueries({ queryKey: ['calendar-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSubmit = !save.isPending && (form.origin_city || form.dest_city)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Load' : 'New Load'}</h2>
            <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
          </div>

          {/* Scan (physical rate con) + pick from Files (PDF attachment from
              email / iCloud Drive) — both route through the same
              parse-rate-con edge function and merge into the form below.
              Only offered on create; editing an existing load already has
              the fields. */}
          {!isEdit && (
            <div className="mb-4 space-y-2">
              {isDocScanAvailable() && (
                <button
                  type="button"
                  onClick={scanToPrefill}
                  disabled={scanning}
                  className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: 'var(--color-brand-500)' }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                    <path d="M7 12h10" />
                  </svg>
                  {scanning ? 'Reading rate con…' : 'Scan rate con to auto-fill'}
                </button>
              )}

              <label
                htmlFor="ratecon-file-picker"
                aria-disabled={scanning || undefined}
                className={`w-full py-3 rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 border ${scanning ? 'opacity-60 pointer-events-none' : ''}`}
                style={{ borderColor: 'var(--color-brand-500)', color: 'var(--color-brand-500)' }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                {scanning ? 'Reading…' : 'Pick rate con from Files'}
              </label>
              <input
                id="ratecon-file-picker"
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={scanning}
                onChange={e => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) fileToPrefill(f)
                }}
              />

              {scanBanner && (
                <p className="text-xs px-1" style={{ color: 'var(--color-brand-600)' }}>
                  {scanBanner}
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Load #</label>
              <input value={form.load_number} onChange={e => set('load_number', e.target.value)} placeholder="LD-1042"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Status</label>
              <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1">
                {(['Pending', 'Assigned', 'In Transit', 'Delivered'] as LoadStatus[]).map(s => {
                  const on = form.status === s
                  return (
                    <button key={s} onClick={() => set('status', s)}
                      className="py-2 rounded-lg text-xs font-medium cursor-pointer"
                      style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origin</label>
              <CityAutocomplete
                cityValue={form.origin_city}
                stateValue={form.origin_state}
                onTypeCity={v => set('origin_city', v)}
                onTypeState={v => set('origin_state', v)}
                onPick={(c, s) => { set('origin_city', c); set('origin_state', s) }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination</label>
              <CityAutocomplete
                cityValue={form.dest_city}
                stateValue={form.dest_state}
                onTypeCity={v => set('dest_city', v)}
                onTypeState={v => set('dest_state', v)}
                onPick={(c, s) => { set('dest_city', c); set('dest_state', s) }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Broker</label>
              {/* Opens a searchable sheet — native <select> doesn't scale
                  once the book of brokers gets long. */}
              <button
                type="button"
                onClick={() => setBrokerPickerOpen(true)}
                className="w-full text-left px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base flex items-center justify-between cursor-pointer active:bg-gray-100"
              >
                <span className={form.broker_id ? 'text-gray-900' : 'text-gray-500'}>
                  {brokers.find(b => b.id === form.broker_id)?.name ?? '— None —'}
                </span>
                <span className="text-gray-400 text-sm ml-2">Search</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Load Type</label>
              <select value={form.load_type} onChange={e => set('load_type', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
                {LOAD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Miles</label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (estimating) return
                      setEstimating(true); setError(null)
                      try {
                        const m = await estimateMiles(form.origin_city, form.origin_state, form.dest_city, form.dest_state)
                        if (m == null) {
                          setError('Could not estimate — check the origin and destination.')
                        } else {
                          set('miles', String(m))
                        }
                      } catch (e) {
                        setError((e as Error).message)
                      } finally {
                        setEstimating(false)
                      }
                    }}
                    disabled={estimating || !form.origin_city || !form.dest_city}
                    className="text-[11px] font-semibold uppercase tracking-wide cursor-pointer disabled:opacity-40"
                    style={{ color: 'var(--color-brand-500)' }}
                  >
                    {estimating ? 'Estimating…' : 'Estimate'}
                  </button>
                </div>
                <input type="number" inputMode="decimal" value={form.miles} onChange={e => set('miles', e.target.value)} placeholder="0"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate ($)</label>
                <input type="number" inputMode="decimal" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pickup appt.</label>
                <input type="datetime-local" value={form.pickup_at} onChange={e => set('pickup_at', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Delivery appt.</label>
                <input type="datetime-local" value={form.deliver_by} onChange={e => set('deliver_by', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deadhead miles (empty miles to pickup)</label>
              <input type="number" inputMode="decimal" value={form.deadhead_miles} onChange={e => set('deadhead_miles', e.target.value)} placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pickup rating</label>
                <StarPicker value={form.pickup_rating} onChange={n => set('pickup_rating', n)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Delivery rating</label>
                <StarPicker value={form.delivery_rating} onChange={n => set('delivery_rating', n)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shipper company</label>
              <input value={form.shipper_name} onChange={e => set('shipper_name', e.target.value)} placeholder="Walmart DC #4321"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Receiver company</label>
              <input value={form.receiver_name} onChange={e => set('receiver_name', e.target.value)} placeholder="Target Regional"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pickup notes</label>
              <input value={form.pickup_notes} onChange={e => set('pickup_notes', e.target.value)} placeholder="Shipper notes"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery notes</label>
              <input value={form.delivery_notes} onChange={e => set('delivery_notes', e.target.value)} placeholder="Receiver notes"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Trailer</label>
              <select value={form.trailer_id} onChange={e => set('trailer_id', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
                <option value="">— None —</option>
                {trailers.map(t => (
                  <option key={t.id} value={t.id}>
                    {[t.trailer_number, t.license_plate].filter(Boolean).join(' — ') || t.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Truck</label>
              <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
                <option value="">— None —</option>
                {trucks.map(t => (
                  <option key={t.id} value={t.id}>
                    {[t.unit_number, t.make].filter(Boolean).join(' — ') || t.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={() => save.mutate()}
            disabled={!canSubmit}
            className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--color-brand-500)' }}
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Load'}
          </button>
        </div>
      </div>

      {quickBrokerOpen && (
        <QuickBrokerSheet
          onClose={() => setQuickBrokerOpen(false)}
          onCreated={id => { set('broker_id', id); setQuickBrokerOpen(false) }}
        />
      )}

      {brokerPickerOpen && (
        <BrokerPickerSheet
          brokers={brokers}
          selectedId={form.broker_id}
          onClose={() => setBrokerPickerOpen(false)}
          onPick={id => { set('broker_id', id); setBrokerPickerOpen(false) }}
          onNew={() => { setBrokerPickerOpen(false); setQuickBrokerOpen(true) }}
        />
      )}
    </>
  )
}

// ── Broker picker ────────────────────────────────────────────────────────────
// Bottom-sheet replacement for the native <select> dropdown — with a book
// of 50+ brokers the native wheel is unusable. Matches by name, MC#, or
// DOT# so the driver can type whatever identifier they remember.

function BrokerPickerSheet({ brokers, selectedId, onClose, onPick, onNew }: {
  brokers: Array<{ id: string; name: string; mc_number: string | null; dot_number: string | null }>
  selectedId: string
  onClose: () => void
  onPick: (id: string) => void
  onNew: () => void
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const matches = needle === ''
    ? brokers
    : brokers.filter(b => {
        if (b.name.toLowerCase().includes(needle)) return true
        if (digits && b.mc_number  && b.mc_number.replace(/\D/g, '').includes(digits))  return true
        if (digits && b.dot_number && b.dot_number.replace(/\D/g, '').includes(digits)) return true
        return false
      })

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-5 max-h-[85vh] flex flex-col"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Choose broker</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name, MC#, or DOT#"
          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base mb-3"
        />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {selectedId && (
            <button
              type="button"
              onClick={() => onPick('')}
              className="w-full text-left px-4 py-3 rounded-xl text-base text-gray-600 active:bg-gray-50 cursor-pointer"
            >
              — None —
            </button>
          )}
          {matches.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">
              No brokers match &ldquo;{q}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {matches.map(b => {
                const on = b.id === selectedId
                const sub = [
                  b.mc_number  ? `MC# ${b.mc_number}`   : null,
                  b.dot_number ? `DOT# ${b.dot_number}` : null,
                ].filter(Boolean).join(' · ')
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onPick(b.id)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between active:bg-gray-50 cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-medium text-gray-900 truncate">{b.name}</span>
                        {sub && <span className="block text-xs text-gray-500 mt-0.5 truncate">{sub}</span>}
                      </span>
                      {on && (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                          stroke="var(--color-brand-500)" strokeWidth="2.4"
                          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12l5 5 9-11" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onNew}
          className="mt-3 py-3 rounded-xl text-white text-base font-semibold cursor-pointer shrink-0"
          style={{ background: 'var(--color-brand-500)' }}
        >
          + New broker…
        </button>
      </div>
    </div>
  )
}

// ── Quick broker add ─────────────────────────────────────────────────────────

function QuickBrokerSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [mc, setMc] = useState('')
  const [error, setError] = useState<string | null>(null)

  // FMCSA verify: type the MC, tap Verify, pre-fill name/phone + show
  // authority status / OOS rates inline so the user knows what they're
  // about to save.
  const [fmcsaBusy, setFmcsaBusy] = useState(false)
  const [fmcsaSnap, setFmcsaSnap] = useState<import('../lib/ai').BrokerSnapshot | null>(null)
  async function verifyBroker() {
    const mcDigits = mc.replace(/\D/g, '')
    if (!mcDigits) { setError('Enter an MC# first'); return }
    setFmcsaBusy(true); setError(null); setFmcsaSnap(null)
    try {
      const { checkBroker } = await import('../lib/ai')
      const snap = await checkBroker({ mc: mcDigits })
      setFmcsaSnap(snap)
      if (!name.trim()) setName(snap.legal_name ?? snap.dba_name ?? '')
      if (!phone.trim()) setPhone(snap.phone ?? '')
    } catch (e) {
      setError(`FMCSA lookup failed: ${(e as Error).message}`)
    } finally {
      setFmcsaBusy(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('brokers').insert({
        name: name.trim(),
        phone: phone || null,
        mc_number: mc || null,
      }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['brokers-simple'] })
      qc.invalidateQueries({ queryKey: ['brokers-driver'] })
      onCreated(id)
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New Broker</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Freight Brokers"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(800) 555-0100" type="tel"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">MC #</label>
              <div className="flex gap-2">
                <input value={mc} onChange={e => setMc(e.target.value)} placeholder="MC-123456"
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
                <button type="button" onClick={verifyBroker} disabled={fmcsaBusy || !mc.trim()}
                  className="px-3 py-3 rounded-xl text-sm font-semibold border disabled:opacity-50 cursor-pointer"
                  style={{ borderColor: 'var(--color-brand-500)', color: 'var(--color-brand-500)' }}>
                  {fmcsaBusy ? '…' : 'Verify'}
                </button>
              </div>
            </div>
          </div>
          {fmcsaSnap && <div className="mt-3"><BrokerSnapshotCardInline snap={fmcsaSnap} /></div>}
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim()}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {save.isPending ? 'Saving…' : 'Add Broker'}
        </button>
      </div>
    </div>
  )
}

// ── Documents ────────────────────────────────────────────────────────────────

interface OpenDoc {
  url: string
  mimeType: string | null
  fileName: string
}

function LoadDocs({ load }: { load: LoadDetail }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<DocKind | 'email' | 'files' | null>(null)
  const [viewing, setViewing] = useState<OpenDoc | null>(null)
  const [pickKind, setPickKind] = useState<DocKind>('pod')
  const loadRef = load.load_number || load.id.slice(0, 8)

  const { data: docs = [] } = useQuery({
    queryKey: ['load-documents', load.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('load_documents')
        .select('*').eq('load_id', load.id).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as LoadDocument[]
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings')
        .select('factoring_email, company_name').limit(1).maybeSingle()
      if (error) throw error
      return data as { factoring_email: string | null; company_name: string | null } | null
    },
  })

  const uploadPhoto = async (kind: DocKind) => {
    setBusy(kind); setError(null)
    try {
      // Prefer the native iOS document scanner (VNDocumentCameraViewController)
      // — auto edge detection, multi-page, perspective correction, the same
      // experience as the Notes app. Falls back to the plain camera on
      // devices or kinds where the scanner isn't the right tool.
      if (isDocScanAvailable() && kind !== 'freight') {
        const images = await scanDocument()
        if (images.length === 0) { setBusy(null); return }
        for (const base64 of images) {
          const fileName = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
          const blob = new Blob([bytes], { type: 'image/jpeg' })
          await uploadBol({ loadId: load.id, loadRef, blob, filename: fileName, mimeType: 'image/jpeg', kind })
        }
        qc.invalidateQueries({ queryKey: ['load-documents', load.id] })
        return
      }

      // Non-iOS / unsupported: fall back to the single-shot camera.
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        quality: 80,
      })
      if (!photo.base64String) throw new Error('No photo captured')
      const format = photo.format ?? 'jpg'
      const mime = `image/${format === 'jpg' ? 'jpeg' : format}`
      const fileName = `${kind}-${Date.now()}.${format}`
      const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: mime })
      await uploadBol({ loadId: load.id, loadRef, blob, filename: fileName, mimeType: mime, kind })
      qc.invalidateQueries({ queryKey: ['load-documents', load.id] })
    } catch (e) {
      const msg = (e as Error).message
      if (msg !== 'User cancelled') setError(msg)
    } finally {
      setBusy(null)
    }
  }

  // Pick an existing file from the iPhone Files app (including iCloud Drive)
  // and upload it as the currently-selected doc kind. Mirrors a copy back to
  // the app's Documents folder so it stays browsable offline.
  const uploadFromFiles = async (file: File, kind: DocKind) => {
    setBusy('files'); setError(null)
    try {
      await uploadBol({
        loadId: load.id,
        loadRef,
        blob:     file,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        kind,
      })
      qc.invalidateQueries({ queryKey: ['load-documents', load.id] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const openDoc = async (doc: LoadDocument) => {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(doc.storage_path, 3600)
    if (error) { setError(error.message); return }
    setViewing({ url: data.signedUrl, mimeType: doc.mime_type ?? null, fileName: doc.file_name })
  }

  // Capture a photo with a burned-in timestamp + GPS stamp for freight
  // verification. Upload as a 'freight' doc.
  const captureFreight = async () => {
    setBusy('freight' as DocKind); setError(null)
    try {
      const stamped = await captureStampedPhoto()
      if (!stamped) { setBusy(null); return }
      const fileName = `freight-${Date.now()}.jpg`
      const bytes = Uint8Array.from(atob(stamped.base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'image/jpeg' })
      await uploadBol({
        loadId: load.id,
        loadRef,
        blob,
        filename: fileName,
        mimeType: 'image/jpeg',
        kind: 'freight',
      })
      qc.invalidateQueries({ queryKey: ['load-documents', load.id] })
    } catch (e) {
      const msg = (e as Error).message
      if (msg !== 'User cancelled') setError(msg)
    } finally {
      setBusy(null)
    }
  }


  const deleteDoc = async (doc: LoadDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return
    await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path])
    await supabase.from('load_documents').delete().eq('id', doc.id)
    qc.invalidateQueries({ queryKey: ['load-documents', load.id] })
  }

  const emailFactoring = async () => {
    const to = settings?.factoring_email
    if (!to) {
      setError('Set a factoring email in Settings first (web app).')
      return
    }
    setBusy('email'); setError(null)
    try {
      const docsToSend = docs.filter(d => d.kind === 'rate_con' || d.kind === 'pod')
      if (docsToSend.length === 0) {
        setError('Upload at least one Rate Con or POD first.')
        return
      }
      const links = await Promise.all(docsToSend.map(async d => {
        const { data } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 60 * 60 * 24 * 7)
        return `- ${d.kind.toUpperCase()} (${d.file_name}): ${data?.signedUrl ?? '(link unavailable)'}`
      }))
      const companyName = settings?.company_name ?? 'Driven Transportation'
      const loadLabel = load.load_number || load.id.slice(0, 8)
      const subject = `${companyName} — Load ${loadLabel} documents`
      const lines = [
        `Hi,`,
        ``,
        `Attached are the documents for load ${loadLabel}.`,
        ``,
        `Origin: ${[load.origin_city, load.origin_state].filter(Boolean).join(', ') || '—'}`,
        `Destination: ${[load.dest_city, load.dest_state].filter(Boolean).join(', ') || '—'}`,
        load.brokers?.name ? `Broker: ${load.brokers.name}` : null,
        load.rate != null ? `Rate: $${load.rate.toLocaleString()}` : null,
        ``,
        `Download links (valid 7 days):`,
        ...links,
        ``,
        `— ${companyName}`,
      ].filter(Boolean).join('\n')
      const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`
      window.location.href = mailto
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const scanHint = isDocScanAvailable()
    ? 'Tap any + button below — the iOS scanner auto-detects edges, handles multi-page, and corrects perspective.'
    : null

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</p>
      <button onClick={captureFreight} disabled={busy !== null}
        className="w-full mb-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
        style={{ background: 'var(--color-brand-500)' }}>
        {busy === 'freight' ? 'Uploading freight photo…' : '📸 Freight photo (time-stamped)'}
      </button>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <DocButton label="Scan Rate Con" busy={busy === 'rate_con'} disabled={busy !== null} onClick={() => uploadPhoto('rate_con')} />
        <DocButton label="Scan POD"      busy={busy === 'pod'}      disabled={busy !== null} onClick={() => uploadPhoto('pod')} />
        <DocButton label="Scan Other"    busy={busy === 'other'}    disabled={busy !== null} onClick={() => uploadPhoto('other')} />
      </div>
      {scanHint && <p className="text-[11px] text-gray-500 mb-3 px-1">{scanHint}</p>}

      {/* Upload an existing file (PDF, image, etc.) from Files / iCloud Drive
          and tag it as Rate Con, POD, Freight, or Other. */}
      <div className="mb-3 bg-gray-50 border border-gray-200 rounded-xl p-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Upload from Files</p>
        <div className="grid grid-cols-4 gap-1 bg-white rounded-lg p-0.5 mb-2">
          {(['rate_con', 'pod', 'freight', 'other'] as DocKind[]).map(k => {
            const on = pickKind === k
            const label = k === 'rate_con' ? 'Rate' : k === 'pod' ? 'POD' : k === 'freight' ? 'Freight' : 'Other'
            return (
              <button key={k} onClick={() => setPickKind(k)}
                className="py-1.5 rounded-md text-[11px] font-semibold cursor-pointer"
                style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
                {label}
              </button>
            )
          })}
        </div>
        <label
          htmlFor={`load-${load.id}-files-picker`}
          aria-disabled={busy !== null || undefined}
          className={`block w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-center text-sm font-semibold text-gray-700 bg-white active:bg-gray-100 cursor-pointer ${busy !== null ? 'opacity-40 pointer-events-none' : ''}`}
        >
          {busy === 'files' ? 'Uploading…' : 'Choose file from Files'}
        </label>
        <input
          id={`load-${load.id}-files-picker`}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={busy !== null}
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) uploadFromFiles(f, pickKind)
          }}
        />
      </div>

      {docs.length > 0 ? (
        <ul className="space-y-1.5 mb-3">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                {d.kind === 'rate_con' ? 'RATE' : d.kind === 'pod' ? 'POD' : d.kind === 'freight' ? 'FREIGHT' : 'OTHER'}
              </span>
              <button onClick={() => openDoc(d)} className="flex-1 text-left text-gray-700 truncate cursor-pointer">
                {d.file_name}
              </button>
              <button onClick={() => deleteDoc(d)} className="text-gray-300 text-xs cursor-pointer">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 mb-3">No documents yet.</p>
      )}

      <button
        onClick={emailFactoring}
        disabled={busy !== null}
        className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
        style={{ background: 'var(--color-brand-500)' }}
      >
        {busy === 'email' ? 'Opening Mail…' : `Email docs to factoring${settings?.factoring_email ? ` (${settings.factoring_email})` : ''}`}
      </button>

      {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {viewing && <DocViewer url={viewing.url} mimeType={viewing.mimeType} fileName={viewing.fileName} onClose={() => setViewing(null)} />}
    </div>
  )
}

function DocButton({ label, busy, disabled, onClick }: {
  label: string; busy: boolean; disabled: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-2 py-2 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 cursor-pointer text-center">
      {busy ? 'Uploading…' : label}
    </button>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
      <dt className="text-sm text-gray-500">{k}</dt>
      <dd className="text-base text-gray-900 font-medium">{v}</dd>
    </div>
  )
}

// Small FMCSA snapshot card shown inline after a Verify lookup. Mirrored
// in Invoices.tsx so each screen can render its own without a shared
// component (the two screens already duplicate small helpers for
// isolation).
function BrokerSnapshotCardInline({ snap }: { snap: import('../lib/ai').BrokerSnapshot }) {
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
    <div className="rounded-lg p-3 text-xs"
      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold">{snap.legal_name || snap.dba_name || 'Unnamed carrier'}</span>
        <span className="font-mono text-[10px] opacity-80">
          {snap.mc_number ? `MC# ${snap.mc_number}` : snap.dot_number ? `DOT# ${snap.dot_number}` : ''}
        </span>
      </div>
      {snap.operating_status && <p className="mb-0.5"><span className="opacity-70">Authority:</span> {snap.operating_status}</p>}
      {snap.entity_type && <p className="mb-0.5"><span className="opacity-70">Entity:</span> {snap.entity_type}</p>}
      {(snap.power_units != null || snap.drivers != null) && (
        <p className="mb-0.5">
          <span className="opacity-70">Fleet:</span> {snap.power_units ?? '—'} units · {snap.drivers ?? '—'} drivers
        </p>
      )}
      {(snap.oos_rate_vehicle != null || snap.oos_rate_driver != null) && (
        <p className="mb-0.5">
          <span className="opacity-70">OOS:</span>{' '}
          {snap.oos_rate_vehicle != null ? `vehicle ${snap.oos_rate_vehicle}%` : ''}
          {snap.oos_rate_vehicle != null && snap.oos_rate_driver != null ? ' · ' : ''}
          {snap.oos_rate_driver != null ? `driver ${snap.oos_rate_driver}%` : ''}
        </p>
      )}
      {snap.risk_flags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {snap.risk_flags.map(f => (
            <span key={f} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: tone.text, color: tone.bg }}>
              {FLAG_LABEL[f] ?? f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
