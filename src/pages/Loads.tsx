import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'
import { CityAutocomplete } from '../components/CityAutocomplete'

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = 'Pending' | 'Assigned' | 'In Transit' | 'Delivered'

interface Load {
  id: string
  load_number: string | null
  origin_city: string | null
  origin_state: string | null
  dest_city: string | null
  dest_state: string | null
  load_type: string | null
  miles: number | null
  rate: number | null
  status: LoadStatus
  eta: string | null
  pickup_at: string | null
  deliver_by: string | null
  deadhead_miles: number | null
  pickup_rating: number | null
  pickup_notes: string | null
  delivery_rating: number | null
  delivery_notes: string | null
  shipper_name: string | null
  receiver_name: string | null
  broker_id: string | null
  driver_id: string | null
  truck_id: string | null
  trailer_id: string | null
  created_at: string
  brokers: { id: string; name: string } | null
  drivers: { id: string; first_name: string | null; last_name: string | null } | null
  trucks: { id: string; unit_number: string | null; make: string | null } | null
  trailers: { id: string; trailer_number: string | null; license_plate: string | null } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function driverName(d: Load['drivers']) {
  if (!d) return '—'
  return [d.first_name, d.last_name].filter(Boolean).join(' ') || '—'
}

function routeStr(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(', ') || '—'
}

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—'
  return prefix + n.toLocaleString()
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAppt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<LoadStatus, string> = {
  Pending:      'bg-gray-100 text-gray-600',
  Assigned:     'bg-orange-100 text-orange-700',
  'In Transit': 'bg-blue-100 text-blue-700',
  Delivered:    'bg-green-100 text-green-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CFG[status as LoadStatus] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

const TABS: Array<LoadStatus | 'All'> = ['All', 'Pending', 'Assigned', 'In Transit', 'Delivered']
const selectCls = "w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]"

// ── Shared field ──────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder = '', type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] transition-colors" />
    </div>
  )
}

// 5-star rating picker. Tapping the same star twice clears the rating.
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
          className="text-xl leading-none cursor-pointer select-none"
          style={{ color: n <= value ? '#f59e0b' : '#d1d5db' }}>
          ★
        </button>
      ))}
    </div>
  )
}

// ── Load Modal ────────────────────────────────────────────────────────────────

function LoadModal({ onClose, editing }: { onClose: () => void; editing: Load | null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    load_number:  editing?.load_number  ?? '',
    origin_city:  editing?.origin_city  ?? '',
    origin_state: editing?.origin_state ?? '',
    dest_city:    editing?.dest_city    ?? '',
    dest_state:   editing?.dest_state   ?? '',
    load_type:    editing?.load_type    ?? 'Dry Van',
    miles:        editing?.miles != null ? String(editing.miles) : '',
    rate:         editing?.rate  != null ? String(editing.rate)  : '',
    status:       (editing?.status ?? 'Pending') as LoadStatus,
    eta:          editing?.eta          ?? '',
    pickup_at:    editing?.pickup_at    ? editing.pickup_at.slice(0, 16)   : '',
    deliver_by:   editing?.deliver_by   ? editing.deliver_by.slice(0, 16)  : '',
    deadhead_miles:   editing?.deadhead_miles != null ? String(editing.deadhead_miles) : '',
    pickup_rating:    editing?.pickup_rating != null ? String(editing.pickup_rating) : '0',
    pickup_notes:     editing?.pickup_notes     ?? '',
    delivery_rating:  editing?.delivery_rating != null ? String(editing.delivery_rating) : '0',
    delivery_notes:   editing?.delivery_notes   ?? '',
    broker_id:    editing?.broker_id    ?? '',
    driver_id:    editing?.driver_id    ?? '',
    truck_id:     editing?.truck_id     ?? '',
    trailer_id:   editing?.trailer_id   ?? '',
    shipper_name: editing?.shipper_name ?? '',
    receiver_name: editing?.receiver_name ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('brokers').select('id, name').order('name')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, first_name, last_name').order('last_name')
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>
    },
  })
  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('trucks').select('id, unit_number, make').order('unit_number')
      return (data ?? []) as Array<{ id: string; unit_number: string | null; make: string | null }>
    },
  })
  const { data: trailers = [] } = useQuery({
    queryKey: ['trailers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('trailers').select('id, trailer_number, license_plate').order('trailer_number')
      return (data ?? []) as Array<{ id: string; trailer_number: string | null; license_plate: string | null }>
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        load_number:  form.load_number  || null,
        origin_city:  form.origin_city  || null,
        origin_state: form.origin_state || null,
        dest_city:    form.dest_city    || null,
        dest_state:   form.dest_state   || null,
        load_type:    form.load_type,
        miles:        form.miles ? Number(form.miles) : null,
        rate:         form.rate  ? Number(form.rate)  : null,
        status:       form.status,
        eta:          form.eta   || null,
        pickup_at:    form.pickup_at  ? new Date(form.pickup_at).toISOString()  : null,
        deliver_by:   form.deliver_by ? new Date(form.deliver_by).toISOString() : null,
        deadhead_miles:  form.deadhead_miles ? Number(form.deadhead_miles) : null,
        pickup_rating:   Number(form.pickup_rating)   > 0 ? Number(form.pickup_rating)   : null,
        pickup_notes:    form.pickup_notes    || null,
        delivery_rating: Number(form.delivery_rating) > 0 ? Number(form.delivery_rating) : null,
        delivery_notes:  form.delivery_notes  || null,
        broker_id:    form.broker_id || null,
        driver_id:    form.driver_id || null,
        truck_id:     form.truck_id  || null,
        trailer_id:   form.trailer_id || null,
        shipper_name: form.shipper_name || null,
        receiver_name: form.receiver_name || null,
      }
      const { error } = editing
        ? await supabase.from('loads').update(payload).eq('id', editing.id)
        : await supabase.from('loads').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loads'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSubmit = !mutation.isPending && (form.origin_city || form.dest_city)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Load' : 'New Load'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Load #" value={form.load_number} onChange={v => set('load_number', v)} placeholder="LD-1042" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                {(['Pending', 'Assigned', 'In Transit', 'Delivered'] as LoadStatus[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Origin</p>
            <CityAutocomplete
              cityValue={form.origin_city}
              stateValue={form.origin_state}
              onTypeCity={v => set('origin_city', v)}
              onTypeState={v => set('origin_state', v)}
              onPick={(c, s) => { set('origin_city', c); set('origin_state', s) }}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Destination</p>
            <CityAutocomplete
              cityValue={form.dest_city}
              stateValue={form.dest_state}
              onTypeCity={v => set('dest_city', v)}
              onTypeState={v => set('dest_state', v)}
              onPick={(c, s) => { set('dest_city', c); set('dest_state', s) }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Broker</label>
              <select value={form.broker_id} onChange={e => set('broker_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Driver</label>
              <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {[d.first_name, d.last_name].filter(Boolean).join(' ') || d.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Truck</label>
              <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)} className={selectCls}>
                <option value="">— None —</option>
                {trucks.map(t => (
                  <option key={t.id} value={t.id}>
                    {[t.unit_number, t.make].filter(Boolean).join(' — ') || t.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Load Type</label>
              <select value={form.load_type} onChange={e => set('load_type', e.target.value)} className={selectCls}>
                {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'LTL', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Miles" value={form.miles} onChange={v => set('miles', v)} placeholder="0" type="number" />
            <Field label="Rate ($)" value={form.rate} onChange={v => set('rate', v)} placeholder="0.00" type="number" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadhead miles" value={form.deadhead_miles} onChange={v => set('deadhead_miles', v)} placeholder="0" type="number" />
            <div />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pickup rating</label>
              <StarPicker value={Number(form.pickup_rating)} onChange={n => set('pickup_rating', String(n))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery rating</label>
              <StarPicker value={Number(form.delivery_rating)} onChange={n => set('delivery_rating', String(n))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shipper name" value={form.shipper_name} onChange={v => set('shipper_name', v)} placeholder="Walmart DC #4321" />
            <Field label="Receiver name" value={form.receiver_name} onChange={v => set('receiver_name', v)} placeholder="Target Regional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup notes" value={form.pickup_notes} onChange={v => set('pickup_notes', v)} placeholder="Shipper notes" />
            <Field label="Delivery notes" value={form.delivery_notes} onChange={v => set('delivery_notes', v)} placeholder="Receiver notes" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Trailer</label>
            <select value={form.trailer_id} onChange={e => set('trailer_id', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
              <option value="">— None —</option>
              {trailers.map(t => (
                <option key={t.id} value={t.id}>
                  {[t.trailer_number, t.license_plate].filter(Boolean).join(' — ') || t.id}
                </option>
              ))}
            </select>
          </div>

          <Field label="ETA" value={form.eta} onChange={v => set('eta', v)} type="date" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup appointment"   value={form.pickup_at}  onChange={v => set('pickup_at', v)}  type="datetime-local" />
            <Field label="Delivery appointment" value={form.deliver_by} onChange={v => set('deliver_by', v)} type="datetime-local" />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canSubmit}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Load'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Documents ─────────────────────────────────────────────────────────────────

type DocKind = 'rate_con' | 'pod' | 'other'

interface LoadDocument {
  id: string
  load_id: string
  kind: DocKind
  storage_path: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  created_at: string
}

const KIND_LABEL: Record<DocKind, string> = {
  rate_con: 'Rate',
  pod:      'POD',
  other:    'Other',
}

const BUCKET = 'load-documents'

function LoadDocuments({ loadId }: { loadId: string }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null)

  const { data: docs = [] } = useQuery({
    queryKey: ['load-documents', loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_documents')
        .select('*')
        .eq('load_id', loadId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as LoadDocument[]
    },
  })

  const upload = async (file: File, kind: DocKind) => {
    setError(null)
    setUploadingKind(kind)
    try {
      const path = `${loadId}/${crypto.randomUUID()}-${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('load_documents').insert({
        load_id: loadId,
        kind,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
      })
      if (dbErr) throw dbErr
      qc.invalidateQueries({ queryKey: ['load-documents', loadId] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploadingKind(null)
    }
  }

  const openDoc = async (doc: LoadDocument) => {
    setError(null)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600)
    if (error) { setError(error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const deleteDoc = async (doc: LoadDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return
    setError(null)
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([doc.storage_path])
    if (stErr) { setError(stErr.message); return }
    const { error: dbErr } = await supabase.from('load_documents').delete().eq('id', doc.id)
    if (dbErr) { setError(dbErr.message); return }
    qc.invalidateQueries({ queryKey: ['load-documents', loadId] })
  }

  function UploadButton({ kind, label }: { kind: DocKind; label: string }) {
    const id = `load-doc-upload-${kind}-${loadId}`
    const active = uploadingKind === kind
    return (
      <>
        <input id={id} type="file" className="hidden" disabled={uploadingKind !== null}
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) upload(f, kind)
          }}
        />
        <label htmlFor={id}
          className={`flex-1 px-2 py-1.5 text-xs rounded-lg border text-center transition-colors ${
            uploadingKind !== null ? 'border-gray-100 text-gray-300 cursor-not-allowed' :
              'border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer'
          }`}>
          {active ? 'Uploading…' : label}
        </label>
      </>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Documents</p>
      <div className="flex gap-2 mb-3">
        <UploadButton kind="rate_con" label="+ Rate Con" />
        <UploadButton kind="pod"      label="+ POD" />
        <UploadButton kind="other"    label="+ Other" />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{error}</p>}
      {docs.length === 0 ? (
        <p className="text-xs text-gray-400">No documents yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(doc => (
            <li key={doc.id} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide flex-shrink-0">
                {KIND_LABEL[doc.kind]}
              </span>
              <button onClick={() => openDoc(doc)}
                className="flex-1 text-left text-gray-700 hover:text-[#c8410a] truncate cursor-pointer">
                {doc.file_name}
              </button>
              <button onClick={() => deleteDoc(doc)} aria-label="Delete document"
                className="text-gray-300 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ load, onClose, onEdit, onDelete, deleting }: {
  load: Load; onClose: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  const origin = routeStr(load.origin_city, load.origin_state)
  const dest   = routeStr(load.dest_city,   load.dest_state)

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Load</p>
            <h2 className="text-base font-semibold text-gray-900">{load.load_number || `#${load.id.slice(0,8)}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <StatusBadge status={load.status} />
            {load.load_type && <span className="text-xs text-gray-400">{load.load_type}</span>}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Route</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="text-gray-700">{origin}</span>
              </div>
              <div className="w-px h-3 bg-gray-200 ml-[5px]" />
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#c8410a' }} />
                <span className="text-gray-700">{dest}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Details</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Broker',   load.brokers?.name],
                ['Driver',   driverName(load.drivers)],
                ['Truck',    load.trucks?.unit_number],
                ['Trailer',  load.trailers?.trailer_number],
                ['Shipper',  load.shipper_name],
                ['Receiver', load.receiver_name],
                ['ETA',      fmtDate(load.eta)],
                ['Pickup',   fmtAppt(load.pickup_at)],
                ['Delivery', fmtAppt(load.deliver_by)],
                ['Miles',    fmt(load.miles)],
                ['Deadhead', fmt(load.deadhead_miles)],
                ['Total mi', fmt((load.miles ?? 0) + (load.deadhead_miles ?? 0))],
                ['Rate',     fmt(load.rate, '$')],
                ['Pickup ★', load.pickup_rating != null ? `${load.pickup_rating} / 5` : null],
                ['Delivery ★', load.delivery_rating != null ? `${load.delivery_rating} / 5` : null],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <LoadDocuments loadId={load.id} />
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onEdit} className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="flex-1 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 cursor-pointer">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Loads() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<LoadStatus | 'All'>('All')
  const [selected, setSelected] = useState<Load | null>(null)
  const [modalState, setModalState] = useState<{ open: boolean; editing: Load | null }>({ open: false, editing: null })

  const { data: loads = [], isLoading, isError } = useQuery({
    queryKey: ['loads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loads')
        .select('*, brokers(id, name), drivers(id, first_name, last_name), trucks(id, unit_number, make), trailers(id, trailer_number, license_plate)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Load[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loads'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setSelected(null)
    },
    onError: (e: Error) => alert(e.message),
  })

  const handleDelete = (load: Load) => {
    const label = load.load_number || `#${load.id.slice(0, 8)}`
    if (confirm(`Delete load ${label}? This cannot be undone.`)) {
      deleteMutation.mutate(load.id)
    }
  }

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)
  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'All' ? loads.length : loads.filter(l => l.status === t).length
    return acc
  }, {} as Record<string, number>)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Loads</h1>
          <p className="text-sm text-gray-400 mt-0.5">{loads.length} total loads</p>
        </div>
        <button onClick={() => setModalState({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Load
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              tab === t ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading loads…</div>
        ) : isError ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-500">Failed to load — check RLS policies.</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No loads found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Load #', 'Route', 'Broker', 'Driver', 'Type', 'Miles', 'Rate', 'Status', 'ETA'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(load => (
                  <tr key={load.id} onClick={() => setSelected(selected?.id === load.id ? null : load)}
                    className={`cursor-pointer transition-colors ${selected?.id === load.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {load.load_number || `#${load.id.slice(0, 8)}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                      <div className="truncate">
                        <span className="text-gray-900">{routeStr(load.origin_city, load.origin_state)}</span>
                        <span className="text-gray-300 mx-1">→</span>
                        <span>{routeStr(load.dest_city, load.dest_state)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{load.brokers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{driverName(load.drivers)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{load.load_type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(load.miles)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(load.rate, '$')}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={load.status} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(load.eta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          load={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setModalState({ open: true, editing: selected })}
          onDelete={() => handleDelete(selected)}
          deleting={deleteMutation.isPending}
        />
      )}
      {modalState.open && (
        <LoadModal
          editing={modalState.editing}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}
    </AppShell>
  )
}
