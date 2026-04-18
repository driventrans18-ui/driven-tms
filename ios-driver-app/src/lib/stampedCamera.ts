import { Capacitor } from '@capacitor/core'

// Capture a photo via the system camera and burn a timestamp + GPS banner
// onto it. The result is a base64 JPEG ready for upload. Used for freight
// verification photos where the driver needs proof of the condition of the
// load at a specific time and place.
export interface StampedPhoto {
  base64: string    // raw base64 (no data: prefix)
  mimeType: string
  bytes: number
}

export async function captureStampedPhoto(): Promise<StampedPhoto | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')

  // Best-effort: grab a location to stamp on the image. Non-blocking so the
  // camera still works if the user denies location.
  let coords: { lat: number; lng: number } | null = null
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000,
      })
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch { /* location denied or unavailable; just stamp time */ }
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 85,
    // Don't let iOS auto-rotate — we want the raw captured orientation so the
    // stamp always lands at the bottom of the visible image.
    correctOrientation: true,
  })
  if (!photo.dataUrl) return null

  const stamped = await drawStamp(photo.dataUrl, coords)
  const base64 = stamped.split(',')[1] ?? ''
  // Blob size approximation from base64 length (every 4 chars = 3 bytes).
  const bytes = Math.floor(base64.length * 3 / 4)
  return { base64, mimeType: 'image/jpeg', bytes }
}

function formatStamp(now: Date, coords: { lat: number; lng: number } | null): string[] {
  const date = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
  const lines = [date]
  if (coords) {
    lines.push(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
  }
  return lines
}

async function drawStamp(dataUrl: string, coords: { lat: number; lng: number } | null): Promise<string> {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)

  const lines = formatStamp(new Date(), coords)
  // Scale font relative to image width so the overlay reads the same across
  // different phone resolutions.
  const fontPx = Math.max(20, Math.round(canvas.width / 40))
  const pad = Math.round(fontPx * 0.6)
  const lineH = Math.round(fontPx * 1.25)
  const boxH = lines.length * lineH + pad * 2
  const boxY = canvas.height - boxH

  // Translucent black background strip anchored to the bottom.
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, boxY, canvas.width, boxH)

  ctx.font = `600 ${fontPx}px -apple-system, system-ui, sans-serif`
  ctx.fillStyle = 'white'
  ctx.textBaseline = 'top'
  lines.forEach((text, i) => {
    ctx.fillText(text, pad, boxY + pad + i * lineH)
  })

  return canvas.toDataURL('image/jpeg', 0.88)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
