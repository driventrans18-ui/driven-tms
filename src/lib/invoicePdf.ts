// Invoice PDF generator. Renders an invoice as a US-Letter PDF using jsPDF.
//
// Current limitations (tracked in SCHEMA-NOTES.md):
// - Invoices are a single flat amount; there is no invoice_line_items table
//   yet. The PDF therefore renders one line synthesized from the linked load
//   (load #, origin → destination, miles, rate). When line items land, we
//   swap the single row for the real list.
// - company_settings is missing MC#, DOT#, EIN, address, phone. Only the
//   fields that exist (company_name, factoring_email, logo_path) are used.
//   Placeholder strings make it obvious what to add in Settings.

import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

interface InvoiceRow {
  id: string
  invoice_number: string | null
  amount: number | null
  issued_date: string | null
  due_date:    string | null
  paid_date:   string | null
  status: string
  notes: string | null
  load_id:     string | null
  broker_id:   string | null
  customer_id: string | null
  loads: {
    id: string
    load_number: string | null
    origin_city: string | null; origin_state: string | null
    dest_city:   string | null; dest_state:   string | null
    miles: number | null
    rate:  number | null
    pickup_at:  string | null
    deliver_by: string | null
  } | null
  brokers: {
    id: string; name: string; mc_number: string | null
    phone: string | null; email: string | null
  } | null
  customers: {
    id: string; name: string
    contact_name: string | null
    phone: string | null; email: string | null
    address: string | null
  } | null
}

interface CompanyRow {
  company_name: string | null
  logo_path: string | null
  factoring_email: string | null
}

// Entry point. Fetches everything needed and returns a Blob ready to
// download or hand to a mailto. Throws on any Supabase error.
export async function generateInvoicePdf(invoiceId: string): Promise<Blob> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, amount, issued_date, due_date, paid_date, status, notes,
      load_id, broker_id, customer_id,
      loads(id, load_number, origin_city, origin_state, dest_city, dest_state, miles, rate, pickup_at, deliver_by),
      brokers(id, name, mc_number, phone, email),
      customers(id, name, contact_name, phone, email, address)
    `)
    .eq('id', invoiceId)
    .single()
  if (error) throw error
  const invoice = data as unknown as InvoiceRow

  const { data: company } = await supabase
    .from('company_settings')
    .select('company_name, logo_path, factoring_email')
    .limit(1)
    .maybeSingle()

  const logoDataUrl = await loadLogoDataUrl((company as CompanyRow | null)?.logo_path ?? null)

  return render(invoice, company as CompanyRow | null, logoDataUrl)
}

// Same but triggers a browser download.
export async function downloadInvoicePdf(invoiceId: string, filename?: string): Promise<void> {
  const blob = await generateInvoicePdf(invoiceId)
  const name = filename ?? `invoice-${invoiceId.slice(0, 8)}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Rendering ────────────────────────────────────────────────────────────────

const PAGE_W = 612  // 8.5 × 72
const MARGIN = 48

function render(invoice: InvoiceRow, company: CompanyRow | null, logoDataUrl: string | null): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  doc.setFont('helvetica')

  const companyName = company?.company_name ?? 'Driven Transportation Inc.'
  const invoiceLabel = invoice.invoice_number || `#${invoice.id.slice(0, 8)}`

  // ── Header ───────────────────────────────────────────────────────────────
  let cursorY = MARGIN

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, cursorY, 64, 64, undefined, 'FAST')
    } catch { /* ignore bad image data */ }
  }

  // Right-aligned INVOICE block
  doc.setFontSize(26).setFont('helvetica', 'bold')
  doc.text('INVOICE', PAGE_W - MARGIN, cursorY + 22, { align: 'right' })
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110)
  doc.text(invoiceLabel, PAGE_W - MARGIN, cursorY + 40, { align: 'right' })
  if (invoice.issued_date) {
    doc.text(`Issued: ${fmtDate(invoice.issued_date)}`, PAGE_W - MARGIN, cursorY + 54, { align: 'right' })
  }
  if (invoice.due_date) {
    doc.text(`Due: ${fmtDate(invoice.due_date)}`, PAGE_W - MARGIN, cursorY + 68, { align: 'right' })
  }

  // Company block (left, below logo)
  cursorY += logoDataUrl ? 76 : 28
  doc.setTextColor(0).setFontSize(14).setFont('helvetica', 'bold')
  doc.text(companyName, MARGIN, cursorY)
  cursorY += 14
  doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(110)
  // TODO: replace with real address/MC/DOT once company_settings is expanded.
  const companyLines = [
    'MC# — · DOT# —',
    'Address on file with broker',
  ]
  companyLines.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 12 })

  // ── Bill to ──────────────────────────────────────────────────────────────
  cursorY += 18
  doc.setTextColor(110).setFontSize(8).setFont('helvetica', 'bold')
  doc.text('BILL TO', MARGIN, cursorY)
  cursorY += 14
  doc.setTextColor(0).setFontSize(11).setFont('helvetica', 'bold')
  const billToName = invoice.customers?.name ?? invoice.brokers?.name ?? 'Unspecified recipient'
  doc.text(billToName, MARGIN, cursorY)
  cursorY += 14
  doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(90)

  const billToLines = invoice.customers
    ? [
        invoice.customers.contact_name,
        invoice.customers.address,
        invoice.customers.phone,
        invoice.customers.email,
      ]
    : invoice.brokers
      ? [
          invoice.brokers.mc_number ? `MC# ${invoice.brokers.mc_number}` : null,
          invoice.brokers.phone,
          invoice.brokers.email,
        ]
      : []
  billToLines.filter(Boolean).forEach(line => {
    doc.text(String(line), MARGIN, cursorY); cursorY += 12
  })

  // ── Line items table ─────────────────────────────────────────────────────
  cursorY += 22
  drawLine(doc, MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
  cursorY += 12
  doc.setTextColor(110).setFontSize(8).setFont('helvetica', 'bold')
  doc.text('DESCRIPTION', MARGIN, cursorY)
  doc.text('MILES',  PAGE_W - MARGIN - 180, cursorY, { align: 'right' })
  doc.text('RATE',   PAGE_W - MARGIN - 100, cursorY, { align: 'right' })
  doc.text('AMOUNT', PAGE_W - MARGIN,       cursorY, { align: 'right' })
  cursorY += 8
  drawLine(doc, MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
  cursorY += 16

  const load = invoice.loads
  const descLines: string[] = []
  if (load) {
    descLines.push(`Load ${load.load_number ?? `#${load.id.slice(0, 8)}`}`)
    const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ')
    const dest   = [load.dest_city,   load.dest_state].filter(Boolean).join(', ')
    if (origin || dest) descLines.push(`${origin || '—'}  →  ${dest || '—'}`)
    if (load.deliver_by) descLines.push(`Delivered ${fmtDate(load.deliver_by)}`)
  } else {
    descLines.push(invoice.notes?.split('\n')[0] ?? 'Transportation services')
  }

  doc.setTextColor(0).setFontSize(10).setFont('helvetica', 'normal')
  descLines.forEach((line, i) => {
    if (i === 0) doc.setFont('helvetica', 'bold')
    else        doc.setFont('helvetica', 'normal')
    doc.text(line, MARGIN, cursorY + i * 12)
  })
  const miles = load?.miles
  const rate  = load?.rate
  const amount = invoice.amount ?? rate ?? 0
  doc.setFont('helvetica', 'normal').setTextColor(0)
  doc.text(miles != null ? miles.toLocaleString() : '—',
           PAGE_W - MARGIN - 180, cursorY, { align: 'right' })
  doc.text(rate  != null ? fmtMoney(rate) : '—',
           PAGE_W - MARGIN - 100, cursorY, { align: 'right' })
  doc.text(fmtMoney(amount), PAGE_W - MARGIN, cursorY, { align: 'right' })

  cursorY += descLines.length * 12 + 8
  drawLine(doc, MARGIN, cursorY, PAGE_W - MARGIN, cursorY)

  // ── Totals ───────────────────────────────────────────────────────────────
  cursorY += 22
  doc.setFontSize(10).setTextColor(110).setFont('helvetica', 'normal')
  doc.text('Subtotal', PAGE_W - MARGIN - 120, cursorY, { align: 'right' })
  doc.setTextColor(0)
  doc.text(fmtMoney(amount), PAGE_W - MARGIN, cursorY, { align: 'right' })
  cursorY += 22
  doc.setFontSize(13).setFont('helvetica', 'bold')
  doc.text('TOTAL DUE', PAGE_W - MARGIN - 120, cursorY, { align: 'right' })
  doc.text(fmtMoney(amount), PAGE_W - MARGIN, cursorY, { align: 'right' })

  // Paid overlay
  if (invoice.status === 'Paid' && invoice.paid_date) {
    doc.setTextColor(21, 128, 61) // success green
    doc.setFontSize(11)
    doc.text(`PAID ${fmtDate(invoice.paid_date)}`, PAGE_W - MARGIN, cursorY + 18, { align: 'right' })
    doc.setTextColor(0)
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    cursorY += 44
    doc.setFontSize(8).setTextColor(110).setFont('helvetica', 'bold')
    doc.text('NOTES', MARGIN, cursorY)
    cursorY += 14
    doc.setFontSize(10).setTextColor(60).setFont('helvetica', 'normal')
    const wrapped = doc.splitTextToSize(invoice.notes, PAGE_W - MARGIN * 2)
    doc.text(wrapped, MARGIN, cursorY)
    cursorY += (Array.isArray(wrapped) ? wrapped.length : 1) * 12
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = 792 - MARGIN
  doc.setFontSize(8).setTextColor(130).setFont('helvetica', 'normal')
  const footer = [
    `Thank you for your business — ${companyName}`,
    company?.factoring_email ? `Remit inquiries: ${company.factoring_email}` : null,
  ].filter(Boolean).join('   ·   ')
  doc.text(footer, PAGE_W / 2, footerY, { align: 'center' })

  return doc.output('blob')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function drawLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  doc.setDrawColor(220).setLineWidth(0.5).line(x1, y1, x2, y2).setDrawColor(0)
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadLogoDataUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null
  const { data } = await supabase.storage.from('branding').createSignedUrl(logoPath, 300)
  if (!data?.signedUrl) return null
  try {
    const res = await fetch(data.signedUrl)
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('content-type') ?? 'image/png'
    return `data:${mime};base64,${arrayBufferToBase64(buf)}`
  } catch {
    return null
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
