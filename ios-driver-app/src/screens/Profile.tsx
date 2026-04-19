import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { ScreenHeader, IconButton } from '../components/ScreenHeader'
import type { Driver } from '../hooks/useDriver'

// Allowed CDL classes — matches the web admin driver form so values
// round-trip cleanly between portals.
const CDL_OPTIONS = ['Class A', 'Class B', 'Class C', 'Non-CDL'] as const

const PHOTO_BUCKET = 'driver-photos'

interface Truck {
  id: number | string
  unit_number: string | null
  make: string | null
  model: string | null
  year: number | null
}

export function Profile({ driver, email, onOpenBrokers, onOpenCustomers, onOpenSettings }: {
  driver: Driver
  email: string | undefined
  onOpenBrokers: () => void
  onOpenCustomers: () => void
  onOpenSettings: () => void
}) {
  const qc = useQueryClient()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const { data: truck } = useQuery({
    queryKey: ['my-truck', driver.id],
    queryFn: async (): Promise<Truck | null> => {
      const { data, error } = await supabase.from('loads')
        .select('trucks(id, unit_number, make, model, year)')
        .eq('driver_id', driver.id)
        .not('truck_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      const row = data as unknown as { trucks: Truck | null } | null
      return row?.trucks ?? null
    },
  })

  // Fetch a signed URL for the stored photo when the driver's photo_path
  // changes. Signed URLs are good for an hour — plenty for a single session.
  useEffect(() => {
    let cancelled = false
    if (!driver.photo_path) { setPhotoUrl(null); return }
    supabase.storage.from(PHOTO_BUCKET).createSignedUrl(driver.photo_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setPhotoUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [driver.photo_path])

  const uploadPhoto = useMutation({
    mutationFn: async (blob: Blob) => {
      // Always write to a stable path so we overwrite the previous avatar
      // instead of piling up old files. `upsert: true` handles replace.
      const path = `${driver.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('drivers').update({ photo_path: path }).eq('id', driver.id)
      if (dbErr) throw dbErr
      return path
    },
    onSuccess: async (path) => {
      setUploadErr(null)
      // Refetch the driver so the new photo_path propagates, and immediately
      // swap in a fresh signed URL (cache-busted so the new image shows).
      qc.invalidateQueries({ queryKey: ['me-driver'] })
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600)
      if (data?.signedUrl) setPhotoUrl(data.signedUrl + `&t=${Date.now()}`)
    },
    onError: (e: Error) => setUploadErr(e.message),
  })

  // Patch the driver row. Used by every editable field below — each one
  // passes a single-column object (e.g. { phone: '555-0100' }) so errors
  // are easy to surface per field.
  const updateDriver = useMutation({
    mutationFn: async (patch: Partial<Driver>) => {
      const { error } = await supabase.from('drivers').update(patch).eq('id', driver.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-driver'] })
    },
  })

  // Full name edits come in as a single string; split on the first space
  // so "Mary Jane Smith" becomes first="Mary", last="Jane Smith". Empty
  // strings get stored as null so the column stays consistent.
  function saveName(v: string) {
    const trimmed = v.trim()
    if (!trimmed) {
      return updateDriver.mutateAsync({ first_name: null, last_name: null })
    }
    const idx = trimmed.indexOf(' ')
    const first = idx === -1 ? trimmed : trimmed.slice(0, idx)
    const last  = idx === -1 ? null    : trimmed.slice(idx + 1).trim() || null
    return updateDriver.mutateAsync({ first_name: first, last_name: last })
  }

  const removePhoto = useMutation({
    mutationFn: async () => {
      if (!driver.photo_path) return
      await supabase.storage.from(PHOTO_BUCKET).remove([driver.photo_path])
      const { error } = await supabase.from('drivers').update({ photo_path: null }).eq('id', driver.id)
      if (error) throw error
    },
    onSuccess: () => {
      setPhotoUrl(null); setUploadErr(null)
      qc.invalidateQueries({ queryKey: ['me-driver'] })
    },
    onError: (e: Error) => setUploadErr(e.message),
  })

  // Native camera prompt (Take Photo / Choose from Library) on iOS, file
  // picker on web. Keeps the same UX path in both cases.
  async function pickPhoto() {
    setUploadErr(null)
    try {
      if (Capacitor.isNativePlatform()) {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt,
          quality: 80,
          allowEditing: true,
          width: 1024,
          height: 1024,
        })
        if (!photo.base64String) return
        const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
        const mime = `image/${photo.format ?? 'jpeg'}`
        uploadPhoto.mutate(new Blob([bytes], { type: mime }))
      } else {
        // Web fallback: hidden file input.
        webFilePicker.current?.click()
      }
    } catch (e) {
      const msg = (e as Error).message
      if (!/cancel/i.test(msg)) setUploadErr(msg)
    }
  }

  // Hidden <input type=file> used on the web (and safe to always render so we
  // don't conditionally keep the ref between platforms).
  const webFilePicker = useHiddenFileInput(f => uploadPhoto.mutate(f))

  const fullName = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || 'Driver'
  const initials = [driver.first_name?.[0], driver.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'D'

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="space-y-5 pb-10">
      <ScreenHeader
        title="Profile"
        action={
          <IconButton onClick={onOpenSettings} label="Settings">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </IconButton>
        }
      />

      <div className="flex flex-col items-center pt-2 pb-2">
        <button
          type="button"
          onClick={pickPhoto}
          disabled={uploadPhoto.isPending}
          aria-label="Change profile photo"
          className="relative w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-semibold overflow-hidden active:opacity-90 cursor-pointer disabled:opacity-60"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </button>

        {uploadPhoto.isPending && <p className="mt-2 text-xs text-gray-400">Uploading…</p>}
        {uploadErr && <p className="mt-2 text-xs text-red-600">{uploadErr}</p>}

        <p className="mt-3 text-lg font-bold text-gray-900">{fullName}</p>
        <p className="text-sm text-gray-500">Driven Transportation Inc.</p>

        {driver.photo_path && !uploadPhoto.isPending && (
          <button
            onClick={() => { if (confirm('Remove profile photo?')) removePhoto.mutate() }}
            className="mt-2 text-xs text-gray-400 cursor-pointer"
          >
            Remove photo
          </button>
        )}
      </div>

      <Section title="Personal Info">
        <EditableRow
          k="Name"
          v={fullName}
          placeholder="Full name"
          onSave={saveName}
        />
        <EditableRow
          k="Email"
          v={driver.email ?? email ?? ''}
          placeholder="name@example.com"
          type="email"
          onSave={v => updateDriver.mutateAsync({ email: v.trim() || null })}
        />
        <EditableRow
          k="Phone"
          v={driver.phone ?? ''}
          placeholder="(555) 555-5555"
          type="tel"
          onSave={v => updateDriver.mutateAsync({ phone: v.trim() || null })}
        />
      </Section>

      <Section title="License">
        <EditableSelectRow
          k="CDL"
          v={driver.cdl_class ?? ''}
          options={CDL_OPTIONS as unknown as string[]}
          onSave={v => updateDriver.mutateAsync({ cdl_class: v || null })}
        />
        {/* Status is dispatch-managed: edits happen in the web admin so
            drivers can't accidentally flip themselves to Inactive. */}
        <Row
          k="Status"
          v={driver.status ?? '—'}
          valueColor={driver.status === 'Active' ? '#15803d' : undefined}
          note="Managed by dispatch (web portal)"
        />
      </Section>

      <Section title="Assigned Truck">
        {truck ? (
          <Row
            k="Assigned Truck"
            v={[truck.unit_number, [truck.year, truck.make, truck.model].filter(Boolean).join(' ')]
                .filter(Boolean).join(' · ') || '—'}
            chevron
          />
        ) : (
          <Row k="Assigned Truck" v="Not assigned" chevron />
        )}
      </Section>

      <Section title="Contacts">
        <button
          onClick={onOpenBrokers}
          className="w-full px-5 py-3.5 flex items-center justify-between text-base font-medium text-gray-900 active:bg-gray-50 cursor-pointer"
        >
          <span>Brokers</span>
          <span className="text-gray-300 text-lg">›</span>
        </button>
        <button
          onClick={onOpenCustomers}
          className="w-full px-5 py-3.5 flex items-center justify-between text-base font-medium text-gray-900 active:bg-gray-50 cursor-pointer"
        >
          <span>Customers</span>
          <span className="text-gray-300 text-lg">›</span>
        </button>
      </Section>

      <button
        onClick={signOut}
        className="w-full bg-white rounded-2xl py-3.5 text-red-600 text-base font-semibold active:bg-gray-50 cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  )
}

// Hidden <input type=file> for the web upload path. Returns a ref that opens
// the picker on click; the provided callback receives the chosen File.
function useHiddenFileInput(onPick: (f: File) => void) {
  const [inputEl] = useState<{ current: HTMLInputElement | null }>(() => ({ current: null }))
  useEffect(() => {
    if (inputEl.current) return
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = 'image/*'
    el.style.display = 'none'
    el.addEventListener('change', () => {
      const f = el.files?.[0]
      el.value = ''
      if (f) onPick(f)
    })
    document.body.appendChild(el)
    inputEl.current = el
    return () => { el.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return inputEl
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">{title}</h2>
      <div className="bg-white rounded-2xl divide-y divide-gray-100">
        {children}
      </div>
    </div>
  )
}

function Row({ k, v, valueColor, chevron, note }: {
  k: string; v: string; valueColor?: string; chevron?: boolean; note?: string
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 shrink-0">{k}</span>
        <span className="text-base font-medium text-right truncate" style={{ color: valueColor ?? 'var(--color-text-primary)' }}>
          {v}
        </span>
        {chevron && <span className="text-gray-300 text-lg shrink-0">›</span>}
      </div>
      {note && <p className="text-[11px] text-gray-400 mt-1 text-right">{note}</p>}
    </div>
  )
}

// Inline-editable row. Display mode looks identical to Row; tapping
// anywhere on the row swaps in a text input, focuses it, and commits on
// blur or Enter. Escape aborts without saving. Errors bubble up as a
// small red line below the row so one bad save doesn't lock the driver
// out of the rest of the form.
function EditableRow({ k, v, placeholder, type = 'text', onSave }: {
  k: string
  v: string
  placeholder?: string
  type?: 'text' | 'email' | 'tel'
  onSave: (next: string) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(v)
  const [busy, setBusy]  = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (!editing) setDraft(v) }, [v, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    if (!editing) return
    if (draft === v) { setEditing(false); return }
    setBusy(true); setError(null)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setDraft(v); setError(null); setEditing(false)
  }

  return (
    <div className="px-5 py-3 min-h-[52px] active:bg-gray-50 cursor-text"
      onClick={() => { if (!editing) setEditing(true) }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 shrink-0">{k}</span>
        {editing ? (
          <input
            ref={inputRef}
            type={type}
            value={draft}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); (e.target as HTMLInputElement).blur() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
            disabled={busy}
            autoCapitalize={type === 'email' ? 'none' : 'words'}
            autoCorrect={type === 'email' ? 'off' : 'on'}
            className="flex-1 min-w-0 text-base font-medium text-right bg-transparent outline-none disabled:opacity-60"
            style={{ color: 'var(--color-text-primary)' }}
          />
        ) : (
          <span className="text-base font-medium text-right truncate flex-1"
            style={{ color: v ? 'var(--color-text-primary)' : '#9ca3af' }}>
            {v || placeholder || '—'}
          </span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1 text-right">{error}</p>}
    </div>
  )
}

// Same pattern as EditableRow but for a fixed set of options. The native
// <select> element gives us the iOS wheel picker for free.
function EditableSelectRow({ k, v, options, onSave }: {
  k: string
  v: string
  options: string[]
  onSave: (next: string) => Promise<unknown>
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit(next: string) {
    if (next === v) return
    setBusy(true); setError(null)
    try {
      await onSave(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 py-3 min-h-[52px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 shrink-0">{k}</span>
        <select
          value={v}
          disabled={busy}
          onChange={e => commit(e.target.value)}
          className="text-base font-medium text-right bg-transparent outline-none appearance-none disabled:opacity-60 cursor-pointer"
          style={{ color: v ? 'var(--color-text-primary)' : '#9ca3af' }}
        >
          {!v && <option value="">—</option>}
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1 text-right">{error}</p>}
    </div>
  )
}
