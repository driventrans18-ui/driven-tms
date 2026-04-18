import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import { DocViewer } from '../components/DocViewer'
import { CityAutocomplete } from '../components/CityAutocomplete'
import { isDocScanAvailable, scanDocument } from '../lib/docScan'
import { captureStampedPhoto } from '../lib/stampedCamera'
import { uploadBol } from '../lib/bolDocuments'
import { estimateMiles } from '../lib/estimateMiles'
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
  const [tab, setTab] = useState<typeof TABS[number]>('All')
  const [open, setOpen] = useState<LoadDetail | null>(null)
  const [newLoadOpen, setNewLoadOpen] = useState(false)

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

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)

  return (
    <div className="space-y-4">
      <button
        onClick={() => setNewLoadOpen(true)}
        className="w-full py-3.5 rounded-xl text-white text-base font-semibold cursor-pointer"
        style={{ background: '#c8410a' }}
      >
        + New Load
      </button>

      <div className="flex gap-1 bg-white rounded-xl p-1">
        {TABS.map(t => {
          const on = t === tab
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
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
          {filtered.map(l => <LoadCard key={l.id} load={l} onTap={() => setOpen(l)} />)}
        </div>
      )}

      {open && <LoadSheet load={open} driverId={driver.id} onClose={() => setOpen(null)} />}
      {newLoadOpen && <NewLoadSheet driverId={driver.id} onClose={() => setNewLoadOpen(false)} />}
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
            style={{ background: '#c8410a' }}>
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

// ── New load sheet ───────────────────────────────────────────────────────────

function NewLoadSheet({ driverId, onClose }: { driverId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    load_number: '',
    status: 'Assigned' as LoadStatus,
    origin_city: '', origin_state: '',
    dest_city: '',   dest_state: '',
    load_type: 'Dry Van',
    miles: '', rate: '',
    deadhead_miles: '',
    pickup_rating: 0,
    delivery_rating: 0,
    pickup_notes: '', delivery_notes: '',
    shipper_name: '', receiver_name: '',
    eta: '',
    pickup_at: '', deliver_by: '',
    broker_id: '', truck_id: '', trailer_id: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [quickBrokerOpen, setQuickBrokerOpen] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('id, name').order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string }>
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
      const { error } = await supabase.from('loads').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-loads', driverId] })
      qc.invalidateQueries({ queryKey: ['active-load', driverId] })
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
            <h2 className="text-lg font-bold text-gray-900">New Load</h2>
            <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
          </div>

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
                      style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
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
              <select
                value={form.broker_id}
                onChange={e => {
                  if (e.target.value === '__new') { setQuickBrokerOpen(true); return }
                  set('broker_id', e.target.value)
                }}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
                <option value="">— None —</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="__new">+ New broker…</option>
              </select>
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
                    style={{ color: '#c8410a' }}
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
            style={{ background: '#c8410a' }}
          >
            {save.isPending ? 'Saving…' : 'Create Load'}
          </button>
        </div>
      </div>

      {quickBrokerOpen && (
        <QuickBrokerSheet
          onClose={() => setQuickBrokerOpen(false)}
          onCreated={id => { set('broker_id', id); setQuickBrokerOpen(false) }}
        />
      )}
    </>
  )
}

// ── Quick broker add ─────────────────────────────────────────────────────────

function QuickBrokerSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [mc, setMc] = useState('')
  const [error, setError] = useState<string | null>(null)

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
              <input value={mc} onChange={e => setMc(e.target.value)} placeholder="MC-123456"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim()}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: '#c8410a' }}
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
  const [busy, setBusy] = useState<DocKind | 'email' | 'scan' | 'files' | null>(null)
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
      setError((e as Error).message)
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

  // Upload scanned pages (from native iOS document scanner) as a Rate Con.
  // Each page becomes its own load_documents row so the user can email them
  // or review individually.
  const scanRateCon = async () => {
    setBusy('scan'); setError(null)
    try {
      const images = await scanDocument()
      if (images.length === 0) { setBusy(null); return }
      for (const base64 of images) {
        const fileName = `rate_con-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        await uploadBol({
          loadId: load.id,
          loadRef,
          blob,
          filename: fileName,
          mimeType: 'image/jpeg',
          kind: 'rate_con',
        })
      }
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

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</p>
      {isDocScanAvailable() && (
        <button onClick={scanRateCon} disabled={busy !== null}
          className="w-full mb-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
          style={{ background: '#c8410a' }}>
          {busy === 'scan' ? 'Uploading scan…' : 'Scan Rate Con (multi-page)'}
        </button>
      )}
      <button onClick={captureFreight} disabled={busy !== null}
        className="w-full mb-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
        style={{ background: '#0a7fc8' }}>
        {busy === 'freight' ? 'Uploading freight photo…' : '📸 Freight photo (time-stamped)'}
      </button>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <DocButton label="+ Rate Con" busy={busy === 'rate_con'} disabled={busy !== null} onClick={() => uploadPhoto('rate_con')} />
        <DocButton label="+ POD"      busy={busy === 'pod'}      disabled={busy !== null} onClick={() => uploadPhoto('pod')} />
        <DocButton label="+ Other"    busy={busy === 'other'}    disabled={busy !== null} onClick={() => uploadPhoto('other')} />
      </div>

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
                style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
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
        style={{ background: '#c8410a' }}
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
