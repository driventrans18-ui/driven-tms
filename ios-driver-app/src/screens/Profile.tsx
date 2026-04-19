import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { ScreenHeader, IconButton } from '../components/ScreenHeader'
import type { Driver } from '../hooks/useDriver'

const PHOTO_BUCKET = 'driver-photos'

interface Truck {
  id: number | string
  unit_number: string | null
  make: string | null
  model: string | null
  year: number | null
}

export function Profile({ driver, email, onOpenBrokers, onOpenSettings }: {
  driver: Driver; email: string | undefined; onOpenBrokers: () => void; onOpenSettings: () => void
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
          {/* Small camera overlay in the bottom-right corner */}
          <span
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
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
        <Row k="Email" v={email ?? driver.email ?? '—'} />
        <Row k="Phone" v={driver.phone ?? '—'} />
      </Section>

      <Section title="License">
        <Row k="CDL"    v={driver.cdl_class ?? '—'} />
        <Row k="Status" v={driver.status    ?? '—'} valueColor={driver.status === 'Active' ? '#15803d' : undefined} />
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

      <button
        onClick={onOpenBrokers}
        className="w-full bg-white rounded-2xl px-5 py-3.5 flex items-center justify-between text-base font-semibold text-gray-900 active:bg-gray-50 cursor-pointer"
      >
        <span>Brokers</span>
        <span className="text-gray-300 text-lg">›</span>
      </button>

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

function Row({ k, v, valueColor, chevron }: {
  k: string; v: string; valueColor?: string; chevron?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 gap-3">
      <span className="text-sm text-gray-500 shrink-0">{k}</span>
      <span className="text-base font-medium text-right truncate" style={{ color: valueColor ?? '#111827' }}>
        {v}
      </span>
      {chevron && <span className="text-gray-300 text-lg shrink-0">›</span>}
    </div>
  )
}
