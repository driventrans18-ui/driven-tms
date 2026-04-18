// Shared BOL / POD / freight document handling for the iOS driver app.
// Every upload goes to Supabase Storage + inserts a `load_documents` row,
// and on a native platform also saves a local copy in the app's Documents
// folder so the driver can browse them in the iPhone Files app.
//
// The Documents folder shows up in Files under "On My iPhone → Driven Driver"
// once the Xcode Info.plist has:
//   - UIFileSharingEnabled = YES
//   - LSSupportsOpeningDocumentsInPlace = YES
// See ios-driver-app/README.md for the exact keys.

import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const BUCKET = 'load-documents'

export type BolKind = 'rate_con' | 'pod' | 'freight' | 'other'

interface CapturedBol {
  blob: Blob
  filename: string
  mimeType: string
  base64: string
}

// Prompt the camera. Returns normalized bytes + derived filename.
export async function captureBol(): Promise<CapturedBol> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    quality: 80,
  })
  if (!photo.base64String) throw new Error('No photo captured')
  const fmt = photo.format ?? 'jpg'
  const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
  const mimeType = `image/${fmt === 'jpg' ? 'jpeg' : fmt}`
  return {
    blob: new Blob([bytes], { type: mimeType }),
    filename: `bol-${Date.now()}.${fmt}`,
    mimeType,
    base64: photo.base64String,
  }
}

interface UploadBolArgs {
  loadId: string
  /** Human-friendly load reference used for the local file path (load number, falling back to id prefix). */
  loadRef: string
  blob: Blob
  filename: string
  mimeType: string
  kind?: BolKind
  /** Persist a copy in Files app. Default true — skip only when user didn't capture/pick a new file. */
  saveLocal?: boolean
}

// Upload to Supabase Storage + insert metadata row + (optionally) mirror to
// the device's Documents folder. Any step that fails throws; the caller can
// surface the error.
export async function uploadBol({
  loadId, loadRef, blob, filename, mimeType, kind = 'pod', saveLocal = true,
}: UploadBolArgs): Promise<void> {
  const path = `${loadId}/${crypto.randomUUID()}-${filename}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mimeType,
  })
  if (upErr) throw upErr

  const { error: dbErr } = await supabase.from('load_documents').insert({
    load_id: loadId,
    kind,
    storage_path: path,
    file_name: filename,
    mime_type: mimeType,
    file_size: blob.size,
  })
  if (dbErr) throw dbErr

  if (saveLocal) {
    // Non-fatal: a failed local save shouldn't undo a successful upload.
    try { await saveToDeviceFiles(blob, filename, loadRef) } catch (e) {
      console.warn('Local file save failed', e)
    }
  }
}

// Write the blob into Documents/BOLs/<loadRef>/<filename>. No-op on web.
export async function saveToDeviceFiles(blob: Blob, filename: string, loadRef: string) {
  if (!Capacitor.isNativePlatform()) return
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const base64 = await blobToBase64(blob)
  const safeRef = (loadRef || 'unassigned').replace(/[^A-Za-z0-9._-]/g, '_')
  await Filesystem.writeFile({
    path: `BOLs/${safeRef}/${filename}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // FileReader returns `data:<mime>;base64,<payload>` — strip the prefix.
      resolve(result.substring(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
