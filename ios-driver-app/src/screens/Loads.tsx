import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  brokers: { id: string; name: string; phone: string | null } | null
}

const TABS: Array<LoadDetail['status'] | 'All'> = ['All', 'Assigned', 'In Transit', 'Delivered']

const DOC_BUCKET = 'load-documents'

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Loads({ driver }: { driver: Driver }) {
  const [tab, setTab] = useState<typeof TABS[number]>('All')
  const [open, setOpen] = useState<LoadDetail | null>(null)

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['my-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, rate, miles, status, eta, load_type, created_at, brokers(id, name, phone)')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as LoadDetail[]
    },
  })

  const filtered = tab === 'All' ? loads : loads.filter(l => l.status === tab)

  return (
    <div>
      <div className="flex gap-1 bg-white rounded-xl p-1 mb-4">
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
    </div>
  )
}

function LoadSheet({ load, onClose }: { load: LoadDetail; onClose: () => void }) {
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
          <Row k="Origin" v={[load.origin_city, load.origin_state].filter(Boolean).join(', ') || '—'} />
          <Row k="Destination" v={[load.dest_city, load.dest_state].filter(Boolean).join(', ') || '—'} />
          <Row k="Broker" v={load.brokers?.name ?? '—'} />
          <Row k="Type" v={load.load_type ?? '—'} />
          <Row k="Miles" v={load.miles != null ? load.miles.toLocaleString() : '—'} />
          <Row k="Rate" v={load.rate != null ? '$' + load.rate.toLocaleString() : '—'} />
          <Row k="ETA" v={fmtDate(load.eta)} />
        </dl>

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
        source: CameraSource.Prompt, // lets user pick camera OR photo library
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
      // 7-day signed links so the factoring company has time to download.
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
