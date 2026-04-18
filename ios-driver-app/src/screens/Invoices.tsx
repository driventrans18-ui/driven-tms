import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { InvoicePdfData } from '../lib/invoicePdf'
import { shareFile } from '../lib/share'
import { DocViewer } from '../components/DocViewer'
import { SwipeRow } from '../components/SwipeRow'
import { ScreenHeader, PlusButton } from '../components/ScreenHeader'
import type { Driver } from '../hooks/useDriver'

type InvoiceStatus = 'Draft' | 'Sent' | 'Overdue' | 'Paid'

interface DeliveredLoad {
  id: string
  load_number: string | null
  origin_city: string | null
  origin_state: string | null
  dest_city: string | null
  dest_state: string | null
  miles: number | null
  rate: number | null
  brokers: { id: string; name: string; email: string | null; phone: string | null } | null
}

interface Invoice {
  id: string
  invoice_number: string | null
  load_id: string | null
  broker_id: string | null
  customer_id: string | null
  amount: number | null
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  status: InvoiceStatus
  notes: string | null
  created_at: string
  loads: {
    id: string
    load_number: string | null
    origin_city: string | null
    origin_state: string | null
    dest_city: string | null
    dest_state: string | null
    miles: number | null
  } | null
  brokers: { id: string; name: string; email: string | null; phone: string | null } | null
  customers: { id: string; name: string; email: string | null; phone: string | null } | null
}

interface CompanySettings {
  company_name:   string | null
  logo_path:      string | null
  factoring_email:string | null
  address:        string | null
  city:           string | null
  state:          string | null
  zip:            string | null
  phone:          string | null
  email:          string | null
  mc_number:      string | null
  dot_number:     string | null
  ein:            string | null
}

function fmtMoney(n: number | null | undefined) {
  return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  Draft:   'bg-gray-200 text-gray-700',
  Sent:    'bg-blue-100 text-blue-700',
  Overdue: 'bg-red-100 text-red-700',
  Paid:    'bg-green-100 text-green-700',
}

export function Invoices({ driver }: { driver: Driver }) {
  const qc = useQueryClient()
  const [openInvoice, setOpenInvoice] = useState<Invoice | null>(null)
  const [form, setForm] = useState<{ editing: Invoice | null } | null>(null)
  const [tab, setTab] = useState<'outstanding' | 'paid'>('outstanding')

  // All invoices tied to this driver's loads, plus any manually-created
  // invoices that aren't attached to a load yet. The left join on loads lets
  // invoices with a null load_id through; we filter by driver_id on any
  // joined load server-side and ignore orphan rows that join to another
  // driver's load client-side.
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['my-invoices', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices')
        .select('*, loads(id, load_number, origin_city, origin_state, dest_city, dest_state, miles, driver_id), brokers(id, name, email, phone), customers(id, name, email, phone)')
        .or(`load_id.is.null,loads.driver_id.eq.${driver.id}`)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as (Invoice & { loads: (Invoice['loads'] & { driver_id?: string }) | null })[]
      return rows.filter(r => !r.loads || r.loads.driver_id === driver.id) as Invoice[]
    },
  })

  // Delivered loads of this driver that don't yet have an invoice row.
  const { data: uninvoicedLoads = [] } = useQuery({
    queryKey: ['my-uninvoiced-loads', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, origin_state, dest_city, dest_state, miles, rate, brokers(id, name, email, phone), invoices(id)')
        .eq('driver_id', driver.id)
        .eq('status', 'Delivered')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as (DeliveredLoad & { invoices: { id: string }[] })[]
      return rows.filter(l => l.invoices.length === 0)
    },
  })

  const createInvoice = useMutation({
    mutationFn: async (load: DeliveredLoad) => {
      const { error } = await supabase.from('invoices').insert({
        load_id: load.id,
        broker_id: load.brokers?.id ?? null,
        amount: load.rate,
        status: 'Draft' as InvoiceStatus,
        issued_date: new Date().toISOString().slice(0, 10),
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invoices', driver.id] })
      qc.invalidateQueries({ queryKey: ['my-uninvoiced-loads', driver.id] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const quickDeleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invoices', driver.id] })
      qc.invalidateQueries({ queryKey: ['my-uninvoiced-loads', driver.id] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const totals = useMemo(() => {
    let paid = 0, outstanding = 0
    for (const inv of invoices) {
      const amt = inv.amount ?? 0
      if (inv.status === 'Paid') paid += amt
      else outstanding += amt
    }
    return { paid, outstanding }
  }, [invoices])

  const visibleInvoices = invoices.filter(inv =>
    tab === 'paid' ? inv.status === 'Paid' : inv.status !== 'Paid'
  )

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Invoices"
        action={<PlusButton onClick={() => setForm({ editing: null })} label="New invoice" />}
      />

      {/* Segmented Outstanding / Paid with dollar totals underneath. */}
      <div className="bg-white rounded-2xl p-3">
        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
          {(['outstanding', 'paid'] as const).map(k => {
            const on = tab === k
            return (
              <button key={k} onClick={() => setTab(k)}
                className="py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                style={on ? { background: 'white', color: '#111827' } : { color: '#6b7280' }}>
                {k === 'outstanding' ? 'Outstanding' : 'Paid'}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 mt-3 px-2">
          <p className="text-xl font-bold text-center" style={{ color: tab === 'outstanding' ? '#111827' : '#9ca3af' }}>
            {fmtMoney(totals.outstanding)}
          </p>
          <p className="text-xl font-bold text-center" style={{ color: tab === 'paid' ? '#15803d' : '#9ca3af' }}>
            {fmtMoney(totals.paid)}
          </p>
        </div>
      </div>

      {tab === 'outstanding' && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-2 px-1">Ready to Invoice</h2>
          {uninvoicedLoads.length > 0 ? (
            <ul className="space-y-2">
              {uninvoicedLoads.map(l => (
                <li key={l.id} className="bg-white rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900 truncate">
                      {[l.origin_city, l.dest_city].filter(Boolean).join(' → ') || l.load_number || '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {l.brokers?.name ?? 'No broker'} · Load visits {fmtMoney(l.rate)}
                    </p>
                  </div>
                  <button
                    onClick={() => createInvoice.mutate(l)}
                    disabled={createInvoice.isPending}
                    className="py-2 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer flex-shrink-0"
                    style={{ background: 'var(--color-brand-500)' }}
                  >
                    Create
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyInvoicesCard message="No loads ready to invoice." />
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-2 px-1">
          {tab === 'paid' ? 'Paid Invoices' : 'Past Invoices'}
        </h2>
        {isLoading ? (
          <EmptyInvoicesCard message="Loading…" />
        ) : visibleInvoices.length === 0 ? (
          <EmptyInvoicesCard message={tab === 'paid' ? 'No paid invoices yet.' : 'No invoices yet.'} />
        ) : (
          <ul className="space-y-2">
            {visibleInvoices.map(inv => {
              const who = inv.customers?.name ?? inv.brokers?.name ?? '—'
              const cls = STATUS_BADGE[inv.status] ?? STATUS_BADGE.Draft
              const label = inv.invoice_number || `#${inv.id.slice(0, 8)}`
              return (
                <li key={inv.id}>
                  <SwipeRow
                    onEdit={() => setForm({ editing: inv })}
                    onDelete={() => {
                      if (confirm(`Delete invoice ${label}? This cannot be undone.`)) {
                        quickDeleteInvoice.mutate(inv.id)
                      }
                    }}
                  >
                    <button onClick={() => setOpenInvoice(inv)}
                      className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">{label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{inv.status}</span>
                      </div>
                      <p className="text-base font-semibold text-gray-900 mt-1">{fmtMoney(inv.amount)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{who} · Due {fmtDate(inv.due_date)}</p>
                    </button>
                  </SwipeRow>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {openInvoice && (
        <InvoiceSheet invoice={openInvoice} driverId={driver.id} onClose={() => setOpenInvoice(null)} />
      )}
      {form && (
        <InvoiceFormSheet driverId={driver.id} editing={form.editing} onClose={() => setForm(null)} />
      )}
    </div>
  )
}

// ── Invoice detail sheet with Email/Text/Mark Paid/Delete ────────────────────

function InvoiceSheet({ invoice, driverId, onClose }: {
  invoice: Invoice; driverId: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'share' | 'preview' | null>(null)
  const [preview, setPreview] = useState<{ url: string; fileName: string } | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings')
        .select('company_name, logo_path, factoring_email, address, city, state, zip, phone, email, mc_number, dot_number, ein').limit(1).maybeSingle()
      if (error) throw error
      return data as CompanySettings | null
    },
  })

  useEffect(() => {
    if (!settings?.logo_path) { setLogoUrl(null); return }
    supabase.storage.from('branding').createSignedUrl(settings.logo_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setLogoUrl(data.signedUrl)
    })
  }, [settings?.logo_path])

  // Revoke the object URL when the preview sheet closes.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url) }
  }, [preview])

  const markPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invoices').update({
        status: 'Paid',
        paid_date: new Date().toISOString().slice(0, 10),
      }).eq('id', invoice.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invoices', driverId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteInvoice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invoices', driverId] })
      qc.invalidateQueries({ queryKey: ['my-uninvoiced-loads', driverId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const billTo = invoice.customers ?? invoice.brokers
  const loadLabel = invoice.loads?.load_number || (invoice.load_id ? `#${invoice.load_id.slice(0, 8)}` : '—')
  const origin = invoice.loads ? [invoice.loads.origin_city, invoice.loads.origin_state].filter(Boolean).join(', ') : ''
  const dest   = invoice.loads ? [invoice.loads.dest_city,   invoice.loads.dest_state].filter(Boolean).join(', ') : ''

  // Shared builder: gather everything the PDF generator needs so Preview and
  // Share render identical output.
  async function buildPdfData(): Promise<{ data: InvoicePdfData; fileName: string }> {
    // Lazy-load the PDF generator — jspdf + html2canvas are heavy and only
    // matter once the user actually wants a PDF.
    const { logoToDataUrl } = await import('../lib/invoicePdf')
    const companyName = settings?.company_name ?? 'Driven Transportation'
    const invoiceLabel = invoice.invoice_number || `${invoice.id.slice(0, 8)}`
    const routeDesc = origin && dest ? `${loadLabel} · ${origin} → ${dest}` : `Load ${loadLabel}`
    const logoDataUrl = logoUrl ? await logoToDataUrl(logoUrl) : null
    const data: InvoicePdfData = {
      invoice: {
        number:     invoiceLabel,
        issuedDate: invoice.issued_date,
        dueDate:    invoice.due_date,
        status:     invoice.status,
        notes:      invoice.notes,
      },
      company: {
        name: companyName,
        logoDataUrl,
        address:    settings?.address    ?? null,
        city:       settings?.city       ?? null,
        state:      settings?.state      ?? null,
        zip:        settings?.zip        ?? null,
        phone:      settings?.phone      ?? null,
        email:      settings?.email      ?? null,
        mc_number:  settings?.mc_number  ?? null,
        dot_number: settings?.dot_number ?? null,
        ein:        settings?.ein        ?? null,
      },
      billTo: billTo ? {
        name:  billTo.name,
        email: billTo.email,
        phone: billTo.phone,
      } : null,
      lineItems: [{
        description: routeDesc,
        miles:       invoice.loads?.miles ?? null,
        amount:      invoice.amount ?? 0,
      }],
      totalAmount: invoice.amount ?? 0,
    }
    const safeName = invoiceLabel.replace(/[^A-Za-z0-9._-]/g, '_')
    return { data, fileName: `Invoice-${safeName}.pdf` }
  }

  async function openPreview() {
    setBusy('preview'); setError(null)
    try {
      const { generateInvoicePdf } = await import('../lib/invoicePdf')
      const { data, fileName } = await buildPdfData()
      const blob = generateInvoicePdf(data)
      const url = URL.createObjectURL(blob)
      setPreview({ url, fileName })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Archive the generated PDF + flip Draft→Sent so the driver has a history
  // they can re-share. Upload failure is non-fatal — we still want the share
  // sheet to open.
  async function archiveAndFlip(blob: Blob, fileName: string) {
    try {
      const path = `${invoice.id}/${Date.now()}-${fileName}`
      const { error: upErr } = await supabase.storage.from('invoice-pdfs').upload(path, blob, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (upErr) console.warn('Invoice archive failed:', upErr.message)
    } catch (e) {
      console.warn('Invoice archive threw:', (e as Error).message)
    }
    if (invoice.status === 'Draft') {
      await supabase.from('invoices').update({ status: 'Sent' }).eq('id', invoice.id)
      qc.invalidateQueries({ queryKey: ['my-invoices', driverId] })
    }
  }

  async function shareInvoice() {
    setBusy('share'); setError(null)
    try {
      const { generateInvoicePdf } = await import('../lib/invoicePdf')
      const { data, fileName } = await buildPdfData()
      const blob = generateInvoicePdf(data)
      const invoiceLabel = invoice.invoice_number || `#${invoice.id.slice(0, 8)}`
      const companyName = settings?.company_name ?? 'Driven Transportation'
      await shareFile({
        blob, filename: fileName, mimeType: 'application/pdf',
        title: `Invoice ${invoiceLabel}`,
        text: `Invoice ${invoiceLabel} from ${companyName} — ${fmtMoney(invoice.amount)}`,
      })
      await archiveAndFlip(blob, fileName)
    } catch (e) {
      const msg = (e as Error).message
      if (!/abort|cancel/i.test(msg)) setError(msg)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Invoice {invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-10 w-auto object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-bold" style={{ background: 'var(--color-brand-500)' }}>D</div>
              )}
              <p className="text-sm font-semibold text-gray-900">{settings?.company_name ?? 'Driven Transportation'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[invoice.status]}`}>{invoice.status}</span>
          </div>

          <div className="space-y-2 text-sm">
            <Row k="Bill to" v={billTo?.name ?? '—'} />
            <Row k="Load" v={loadLabel} />
            {(origin || dest) && <Row k="Route" v={`${origin || '—'} → ${dest || '—'}`} />}
            {invoice.loads?.miles != null && <Row k="Miles" v={invoice.loads.miles.toLocaleString()} />}
            <Row k="Issued" v={fmtDate(invoice.issued_date)} />
            <Row k="Due" v={fmtDate(invoice.due_date)} />
            {invoice.paid_date && <Row k="Paid" v={fmtDate(invoice.paid_date)} />}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 flex items-baseline justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-2xl font-bold text-gray-900">{fmtMoney(invoice.amount)}</span>
          </div>

          {invoice.notes && (
            <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
              {invoice.notes}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={openPreview}
            disabled={busy !== null}
            className="py-3 rounded-xl border border-gray-200 text-gray-900 text-base font-semibold disabled:opacity-50 cursor-pointer bg-white active:bg-gray-50"
          >
            {busy === 'preview' ? 'Rendering…' : 'Preview PDF'}
          </button>
          <button
            onClick={shareInvoice}
            disabled={busy !== null}
            className="py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--color-brand-500)' }}
          >
            {busy === 'share' ? 'Preparing…' : 'Share invoice'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500 text-center">
          Share opens iOS's share sheet — pick Mail, Messages, AirDrop, Save to Files, or Print.
        </p>

        {invoice.status !== 'Paid' && (
          <button
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
            className="w-full mt-2 py-3 rounded-xl bg-green-600 text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          >
            {markPaid.isPending ? 'Saving…' : 'Mark as Paid'}
          </button>
        )}

        <button
          onClick={() => {
            if (confirm(`Delete invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}? This cannot be undone.`)) {
              deleteInvoice.mutate()
            }
          }}
          disabled={deleteInvoice.isPending}
          className="w-full mt-2 py-3 rounded-xl text-red-600 text-base font-semibold active:bg-red-50 disabled:opacity-50 cursor-pointer"
        >
          {deleteInvoice.isPending ? 'Deleting…' : 'Delete invoice'}
        </button>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
      {preview && (
        <DocViewer
          url={preview.url}
          mimeType="application/pdf"
          fileName={preview.fileName}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

// ── Invoice create / edit form ───────────────────────────────────────────────

function addDays(iso: string | null, days: number): string {
  const d = iso ? new Date(iso + 'T00:00:00') : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceFormSheet({ driverId, editing, onClose }: {
  driverId: string
  editing?: Invoice | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!editing
  const [form, setForm] = useState({
    invoice_number: editing?.invoice_number ?? '',
    amount:         editing?.amount != null ? String(editing.amount) : '',
    issued_date:    editing?.issued_date ?? new Date().toISOString().slice(0, 10),
    due_date:       editing?.due_date    ?? addDays(null, 30),
    paid_date:      editing?.paid_date   ?? '',
    status:         editing?.status      ?? ('Draft' as InvoiceStatus),
    notes:          editing?.notes       ?? '',
    load_id:        editing?.load_id     ?? '',
    broker_id:      editing?.broker_id   ?? '',
    customer_id:    editing?.customer_id ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Inline "add new" state — opened when the bill-to picker's "+ New" option
  // is chosen. Creates the broker / customer and auto-selects it.
  const [quickAdd, setQuickAdd] = useState<'broker' | 'customer' | null>(null)
  const [qa, setQa] = useState({ name: '', email: '', phone: '', mc: '', address: '' })
  const [qaError, setQaError] = useState<string | null>(null)
  const setQa_ = (k: keyof typeof qa, v: string) => setQa(f => ({ ...f, [k]: v }))

  // Bill-to picker options: brokers + customers. Selecting one clears the other
  // so we never write both.
  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brokers').select('id, name').order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })
  const { data: driverLoads = [] } = useQuery({
    queryKey: ['driver-loads-for-invoice', driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loads')
        .select('id, load_number, origin_city, dest_city, rate, status')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Array<{
        id: string; load_number: string | null
        origin_city: string | null; dest_city: string | null
        rate: number | null; status: string
      }>
    },
  })

  const createBroker = useMutation({
    mutationFn: async () => {
      const name = qa.name.trim()
      if (!name) throw new Error('Enter a broker name.')
      const { data, error } = await supabase.from('brokers').insert({
        name, email: qa.email || null, phone: qa.phone || null, mc_number: qa.mc || null,
      }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['brokers-simple'] })
      set('broker_id', id); set('customer_id', '')
      setQuickAdd(null); setQa({ name: '', email: '', phone: '', mc: '', address: '' }); setQaError(null)
    },
    onError: (e: Error) => setQaError(e.message),
  })

  const createCustomer = useMutation({
    mutationFn: async () => {
      const name = qa.name.trim()
      if (!name) throw new Error('Enter a customer name.')
      const { data, error } = await supabase.from('customers').insert({
        name, email: qa.email || null, phone: qa.phone || null, address: qa.address || null,
      }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['customers-simple'] })
      set('customer_id', id); set('broker_id', '')
      setQuickAdd(null); setQa({ name: '', email: '', phone: '', mc: '', address: '' }); setQaError(null)
    },
    onError: (e: Error) => setQaError(e.message),
  })

  const save = useMutation({
    mutationFn: async () => {
      const amount = form.amount ? Number(form.amount) : null
      if (amount == null || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('Enter an amount greater than zero.')
      }
      const payload = {
        invoice_number: form.invoice_number || null,
        amount,
        issued_date:    form.issued_date || null,
        due_date:       form.due_date    || null,
        paid_date:      form.status === 'Paid' ? (form.paid_date || new Date().toISOString().slice(0, 10)) : null,
        status:         form.status,
        notes:          form.notes || null,
        load_id:        form.load_id     || null,
        broker_id:      form.broker_id   || null,
        customer_id:    form.customer_id || null,
      }
      const { error } = isEdit && editing
        ? await supabase.from('invoices').update(payload).eq('id', editing.id)
        : await supabase.from('invoices').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invoices', driverId] })
      qc.invalidateQueries({ queryKey: ['my-uninvoiced-loads', driverId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  // When a load is picked, prefill amount from the load's rate if the user
  // hasn't already entered one.
  function pickLoad(loadId: string) {
    set('load_id', loadId)
    const l = driverLoads.find(x => x.id === loadId)
    if (l && !form.amount && l.rate != null) set('amount', String(l.rate))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Invoice #</label>
            <input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-1042"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Status</label>
            <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1">
              {(['Draft', 'Sent', 'Overdue', 'Paid'] as InvoiceStatus[]).map(s => {
                const on = form.status === s
                return (
                  <button key={s} onClick={() => set('status', s)}
                    className="py-2 rounded-lg text-xs font-medium cursor-pointer"
                    style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bill to</label>
            <select
              value={form.customer_id || (form.broker_id ? `b:${form.broker_id}` : '')}
              onChange={e => {
                const v = e.target.value
                if (v === '__new_customer') { setQuickAdd('customer'); setQaError(null); return }
                if (v === '__new_broker')   { setQuickAdd('broker');   setQaError(null); return }
                if (!v) { set('customer_id', ''); set('broker_id', ''); return }
                if (v.startsWith('b:')) { set('broker_id', v.slice(2)); set('customer_id', '') }
                else                    { set('customer_id', v);       set('broker_id', '') }
              }}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
              <option value="">— None —</option>
              {customers.length > 0 && <optgroup label="Customers">
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>}
              <option value="__new_customer">+ New customer…</option>
              {brokers.length > 0 && <optgroup label="Brokers">
                {brokers.map(b => <option key={b.id} value={`b:${b.id}`}>{b.name}</option>)}
              </optgroup>}
              <option value="__new_broker">+ New broker…</option>
            </select>

            {quickAdd && (
              <div className="mt-2 p-3 rounded-xl bg-white border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">
                    {quickAdd === 'broker' ? 'New broker' : 'New customer'}
                  </p>
                  <button type="button" onClick={() => { setQuickAdd(null); setQaError(null) }}
                    className="text-xs text-gray-400 cursor-pointer">Cancel</button>
                </div>
                <input value={qa.name} onChange={e => setQa_('name', e.target.value)}
                  placeholder={quickAdd === 'broker' ? 'Acme Freight Brokers' : 'Walmart DC #4321'}
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-base" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={qa.email} onChange={e => setQa_('email', e.target.value)} placeholder="Email" type="email"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-base" />
                  <input value={qa.phone} onChange={e => setQa_('phone', e.target.value)} placeholder="Phone" type="tel"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-base" />
                </div>
                {quickAdd === 'broker' ? (
                  <input value={qa.mc} onChange={e => setQa_('mc', e.target.value)} placeholder="MC# (optional)"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-base" />
                ) : (
                  <input value={qa.address} onChange={e => setQa_('address', e.target.value)} placeholder="Address (optional)"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-base" />
                )}
                {qaError && <p className="text-xs text-red-600">{qaError}</p>}
                <button type="button"
                  onClick={() => (quickAdd === 'broker' ? createBroker : createCustomer).mutate()}
                  disabled={(quickAdd === 'broker' ? createBroker : createCustomer).isPending || !qa.name.trim()}
                  className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
                  style={{ background: 'var(--color-brand-500)' }}>
                  {(quickAdd === 'broker' ? createBroker : createCustomer).isPending
                    ? 'Saving…'
                    : quickAdd === 'broker' ? 'Add broker' : 'Add customer'}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Attached load (optional)</label>
            <select value={form.load_id} onChange={e => pickLoad(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
              <option value="">— None —</option>
              {driverLoads.map(l => (
                <option key={l.id} value={l.id}>
                  {(l.load_number || l.id.slice(0, 8)) + ' · ' + [l.origin_city, l.dest_city].filter(Boolean).join(' → ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
            <input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued</label>
              <input type="date" value={form.issued_date} onChange={e => set('issued_date', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
          </div>

          {form.status === 'Paid' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paid on</label>
              <input type="date" value={form.paid_date} onChange={e => set('paid_date', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Payment terms, PO #, etc."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
        </button>
      </div>
    </div>
  )
}

function EmptyInvoicesCard({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center" aria-hidden>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-gray-900 font-medium text-right ml-3 truncate">{v}</dd>
    </div>
  )
}
