// Client-side invoice PDF generator. Mirrors the Invoice Simple layout:
// logo + company info top-left, invoice meta top-right, bill-to block,
// line-items table, totals, notes footer. Returns a Blob the caller can
// hand to the native share sheet or upload to Storage.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface InvoiceLineItem {
  description: string
  miles?: number | null
  amount: number
}

export interface InvoicePdfData {
  invoice: {
    number: string
    issuedDate: string | null   // YYYY-MM-DD
    dueDate: string | null      // YYYY-MM-DD
    status: string
    notes: string | null
  }
  company: {
    name: string
    logoDataUrl?: string | null // base64 data URL when available
    /** Natural dimensions of the logo so render() can letterbox without squashing. */
    logoWidth?:  number | null
    logoHeight?: number | null
    address?:    string | null
    city?:       string | null
    state?:      string | null
    zip?:        string | null
    phone?:      string | null
    email?:      string | null
    mc_number?:  string | null
    dot_number?: string | null
    ein?:        string | null
  }
  billTo: {
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
  } | null
  lineItems: InvoiceLineItem[]
  totalAmount: number
}

// jsPDF can't resolve CSS variables — these are baked for the PDF output.
const BRAND = '#00A8E8'
const MUTED = '#6b7280'
const DARK  = '#111827'

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function generateInvoicePdf(data: InvoicePdfData): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 48
  let cursorY = margin

  // ── Header: logo + company name (left) · INVOICE #/dates (right) ──────────
  // Letterbox the logo into a fixed box instead of forcing it to a square so
  // tall-narrow marks (arch-over-wordmark, stacked logo, etc.) aren't
  // visually squashed.
  const LOGO_BOX_W = 84, LOGO_BOX_H = 72
  if (data.company.logoDataUrl) {
    try {
      const natW = data.company.logoWidth  && data.company.logoWidth  > 0 ? data.company.logoWidth  : LOGO_BOX_W
      const natH = data.company.logoHeight && data.company.logoHeight > 0 ? data.company.logoHeight : LOGO_BOX_H
      const scale = Math.min(LOGO_BOX_W / natW, LOGO_BOX_H / natH)
      const drawW = Math.max(1, natW * scale)
      const drawH = Math.max(1, natH * scale)
      doc.addImage(data.company.logoDataUrl, 'PNG', margin, cursorY, drawW, drawH, undefined, 'FAST')
    } catch { /* silently skip a broken logo */ }
  } else {
    // Brand-colored square with the first letter — matches the app's fallback.
    doc.setFillColor(BRAND)
    doc.roundedRect(margin, cursorY, 48, 48, 6, 6, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.text((data.company.name[0] ?? 'D').toUpperCase(), margin + 24, cursorY + 33, { align: 'center' })
  }

  doc.setTextColor(DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(data.company.name, margin + 80, cursorY + 28)

  // Right side — INVOICE label and meta.
  doc.setFontSize(28)
  doc.setTextColor(BRAND)
  doc.text('INVOICE', pageW - margin, cursorY + 20, { align: 'right' })

  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text(`# ${data.invoice.number}`, pageW - margin, cursorY + 38, { align: 'right' })

  const metaRows: Array<[string, string]> = [
    ['Issued', fmtDate(data.invoice.issuedDate)],
    ['Due',    fmtDate(data.invoice.dueDate)],
    ['Status', data.invoice.status],
  ]
  let metaY = cursorY + 56
  metaRows.forEach(([k, v]) => {
    doc.setTextColor(MUTED)
    doc.text(k, pageW - margin - 90, metaY)
    doc.setTextColor(DARK)
    doc.text(v, pageW - margin, metaY, { align: 'right' })
    metaY += 14
  })

  cursorY += 96

  // ── Company "From" block (address / MC / DOT / contact) ──────────────────
  const cityStateZip = [data.company.city, [data.company.state, data.company.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
  const idBadges = [
    data.company.mc_number  ? `MC# ${data.company.mc_number}`   : null,
    data.company.dot_number ? `DOT# ${data.company.dot_number}` : null,
    data.company.ein        ? `EIN ${data.company.ein}`         : null,
  ].filter(Boolean).join(' · ')
  const fromLines = [
    data.company.address ?? null,
    cityStateZip || null,
    [data.company.phone, data.company.email].filter(Boolean).join('  ·  ') || null,
    idBadges || null,
  ].filter(Boolean) as string[]

  if (fromLines.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(MUTED)
    fromLines.forEach(line => {
      doc.text(line, margin, cursorY)
      cursorY += 13
    })
    cursorY += 8
  }

  // ── Bill to block ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(MUTED)
  doc.text('BILL TO', margin, cursorY)
  cursorY += 16
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(DARK)
  doc.setFontSize(12)
  const billToLines: string[] = []
  if (data.billTo) {
    billToLines.push(data.billTo.name)
    if (data.billTo.address) billToLines.push(...data.billTo.address.split(/\r?\n/))
    if (data.billTo.email)   billToLines.push(data.billTo.email)
    if (data.billTo.phone)   billToLines.push(data.billTo.phone)
  } else {
    billToLines.push('—')
  }
  billToLines.forEach(line => {
    doc.text(line, margin, cursorY)
    cursorY += 14
  })

  cursorY += 12

  // ── Line items table ──────────────────────────────────────────────────────
  const body = data.lineItems.map(li => [
    li.description,
    li.miles != null ? li.miles.toLocaleString() : '',
    fmtMoney(li.amount),
  ])
  autoTable(doc, {
    startY: cursorY,
    head: [['Description', 'Miles', 'Amount']],
    body,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 8, textColor: DARK },
    headStyles: {
      fillColor: [249, 250, 251], // gray-50
      textColor: [107, 114, 128], // gray-500
      fontStyle: 'bold',
      halign: 'left',
      lineWidth: { bottom: 1 },
      lineColor: [229, 231, 235], // gray-200
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 70, halign: 'right' },
      2: { cellWidth: 90, halign: 'right' },
    },
    bodyStyles: {
      lineWidth: { bottom: 0.5 },
      lineColor: [243, 244, 246], // gray-100
    },
    margin: { left: margin, right: margin },
  })

  // Use lastAutoTable.finalY (added by the plugin) to position the totals row.
  const withPlugin = doc as unknown as { lastAutoTable?: { finalY: number } }
  cursorY = (withPlugin.lastAutoTable?.finalY ?? cursorY) + 16

  // ── Totals ────────────────────────────────────────────────────────────────
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(1)
  doc.line(pageW - margin - 200, cursorY, pageW - margin, cursorY)
  cursorY += 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(MUTED)
  doc.text('Total', pageW - margin - 200, cursorY)
  doc.setTextColor(DARK)
  doc.setFontSize(18)
  doc.text(fmtMoney(data.totalAmount), pageW - margin, cursorY + 2, { align: 'right' })
  cursorY += 32

  // ── Notes footer ──────────────────────────────────────────────────────────
  if (data.invoice.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(MUTED)
    doc.text('NOTES', margin, cursorY)
    cursorY += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(DARK)
    const wrapped = doc.splitTextToSize(data.invoice.notes, pageW - margin * 2) as string[]
    wrapped.forEach(line => {
      doc.text(line, margin, cursorY)
      cursorY += 14
    })
  }

  // ── Footer thank-you — bottom of page ─────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.text(`Thank you for your business — ${data.company.name}`, pageW / 2, pageH - 32, { align: 'center' })

  return doc.output('blob')
}

// Fetch a logo from its signed URL and encode as a data URL jsPDF can embed.
// Returns null on failure so the caller falls back to the letter mark.
export async function logoToDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Measure a data URL. Done async via <img> because jsPDF's addImage is sync
// and needs the natural dimensions ahead of time to avoid squashing.
export function measureDataUrl(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
