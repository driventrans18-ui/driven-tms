// Thin wrapper around the native iOS share sheet. On native we write the
// blob to the Cache directory and hand the file URI to @capacitor/share, so
// Mail/Messages/AirDrop/Save-to-Files/Print all attach the file natively.
// On web we fall back to the Web Share API (level 2 with files when
// available) or a plain download link.

import { Capacitor } from '@capacitor/core'

export interface ShareFileInput {
  blob: Blob
  filename: string
  mimeType: string
  title?: string
  text?: string
}

export async function shareFile({ blob, filename, mimeType, title, text }: ShareFileInput): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([
      import('@capacitor/share'),
      import('@capacitor/filesystem'),
    ])
    const base64 = await blobToBase64(blob)
    // Cache directory: iOS cleans these up automatically so we don't leak PDFs.
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })
    await Share.share({
      title,
      text,
      url: written.uri,
      dialogTitle: title,
    })
    return
  }

  // Web: use the Web Share API when the browser supports file sharing
  // (Safari 16.4+ on iOS desktop-class Safari, Android Chrome). Otherwise
  // just trigger a download — better than silently failing.
  const navAny = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }
  const file = new File([blob], filename, { type: mimeType })
  if (navAny.canShare?.({ files: [file] }) && navAny.share) {
    try {
      await navAny.share({ files: [file], title, text })
      return
    } catch (e) {
      // User cancel — swallow; anything else falls through to download.
      const msg = (e as Error).message ?? ''
      if (/abort|cancel/i.test(msg)) return
    }
  }

  // Download fallback.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.substring(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
