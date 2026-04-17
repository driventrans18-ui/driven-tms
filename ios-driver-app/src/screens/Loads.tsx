import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LoadCard, type LoadCardLoad } from '../components/LoadCard'
import type { Driver } from '../hooks/useDriver'

type DocKind = 'rate_con' | 'pod' | 'other'

interface LoadDocument {
  id: string
  load_id: string
  kind: DocKind
  storage_path: string
  file_name: string
  created_at: string
}

interface LoadDetail extends LoadCardLoad {
  created_at: string
  pickup_at: string | null
  deliver_by: string | null
  brokers: { id: string; name: string; phone: string | null } | null
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

export function Loads({ driver }: { driver: Driver }) {
  const [tab, setTab] = useState<typeof TABS[number]>('All')
  const [open, setOpen] = useState<LoadDetail | null>(null)
  const [newLoadOpen, setNewLoadOpen] = useState(false)

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['my-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, rate, miles, status, eta, load_type, created_at, pickup_at, deliver_by, brokers(id, name, phone)')
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

      {open && <LoadSheet load={open} onClose={() => setOpen(null)} />}
      {newLoadOpen && <NewLoadSheet driverId={driver.id} onClose={() => setNewLoadOpen(false)} />}
    </div>
  )
}

// ── Load detail sheet ────────────────────────────────────────────────────────

function LoadSheet({ load, onClose }: { load: LoadDetail; onClose: () => void }) {
  const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ')
  const dest   = [load.dest_city,   load.dest_state].filter(Boolean).join(', ')

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
          <Row k="Type" v={load.load_type ?? '—'} />
          <Row k="Miles" v={load.miles != null ? load.miles.toLocaleString() : '—'} />
          <Row k="Rate" v={load.rate != null ? '$' + load.rate.toLocaleString() : '—'} />
          <Row k="ETA" v={fmtDate(load.eta)} />
          <Row k="Pickup" v={fmtAppt(load.pickup_at)} />
          <Row k="Delivery" v={fmtAppt(load.deliver_by)} />
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
    eta: '',
    pickup_at: '', deliver_by: '',
    broker_id: '', truck_id: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [quickBrokerOpen, setQuickBrokerOpen] = useState(false)
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
        broker_id:    form.broker_id || null,
        truck_id:     form.truck_id  || null,
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
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={form.origin_city} onChange={e => set('origin_city', e.target.value)} placeholder="City"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
                <input value={form.origin_state} onChange={e => set('origin_state', e.target.value.toUpperCase().slice(0, 2))} placeholder="ST"
                  className="w-16 px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base text-center uppercase" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination</label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={form.dest_city} onChange={e => set('dest_city', e.target.value)} placeholder="City"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
                <input value={form.dest_state} onChange={e => set('dest_state', e.target.value.toUpperCase().slice(0, 2))} placeholder="ST"
                  className="w-16 px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base text-center uppercase" />
              </div>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Miles</label>
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

function LoadDocs({ load }: { load: LoadDetail }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<DocKind | 'email' | null>(null)

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
      const fileName = `${kind}-${Date.now()}.${format}`
      const path = `${load.id}/${crypto.randomUUID()}-${fileName}`
      const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: `image/${format}` })
      const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, blob, {
        contentType: `image/${format}`,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('load_documents').insert({
        load_id: load.id,
        kind,
        storage_path: path,
        file_name: fileName,
        mime_type: `image/${format}`,
        file_size: blob.size,
      })
      if (dbErr) throw dbErr
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
    window.open(data.signedUrl, '_blank')
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
      <div className="grid grid-cols-3 gap-2 mb-3">
        <DocButton label="+ Rate Con" busy={busy === 'rate_con'} disabled={busy !== null} onClick={() => uploadPhoto('rate_con')} />
        <DocButton label="+ POD"      busy={busy === 'pod'}      disabled={busy !== null} onClick={() => uploadPhoto('pod')} />
        <DocButton label="+ Other"    busy={busy === 'other'}    disabled={busy !== null} onClick={() => uploadPhoto('other')} />
      </div>

      {docs.length > 0 ? (
        <ul className="space-y-1.5 mb-3">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                {d.kind === 'rate_con' ? 'RATE' : d.kind === 'pod' ? 'POD' : 'OTHER'}
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
