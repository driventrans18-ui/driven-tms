import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
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
  company_name: string | null
  logo_path: string | null
  factoring_email: string | null
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

  // All invoices connected to this driver's delivered loads.
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['my-invoices', driver.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices')
        .select('*, loads!inner(id, load_number, origin_city, origin_state, dest_city, dest_state, miles, driver_id), brokers(id, name, email, phone), customers(id, name, email, phone)')
        .eq('loads.driver_id', driver.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Invoice[]
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

  const totals = useMemo(() => {
    let paid = 0, outstanding = 0
    for (const inv of invoices) {
      const amt = inv.amount ?? 0
      if (inv.status === 'Paid') paid += amt
      else outstanding += amt
    }
    return { paid, outstanding }
  }, [invoices])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totals.outstanding)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmtMoney(totals.paid)}</p>
        </div>
      </div>

      {uninvoicedLoads.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Ready to invoice</p>
          <ul className="space-y-2">
            {uninvoicedLoads.map(l => (
              <li key={l.id} className="bg-white rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">{l.load_number || `#${l.id.slice(0, 8)}`}</p>
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {[l.origin_city, l.dest_city].filter(Boolean).join(' → ') || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{l.brokers?.name ?? 'No broker'} · {fmtMoney(l.rate)}</p>
                </div>
                <button
                  onClick={() => createInvoice.mutate(l)}
                  disabled={createInvoice.isPending}
                  className="py-2 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer flex-shrink-0"
                  style={{ background: '#c8410a' }}
                >
                  Create
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Invoices</p>
        {isLoading ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">No invoices yet.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map(inv => {
              const who = inv.customers?.name ?? inv.brokers?.name ?? '—'
              const cls = STATUS_BADGE[inv.status] ?? STATUS_BADGE.Draft
              return (
                <li key={inv.id}>
                  <button onClick={() => setOpenInvoice(inv)}
                    className="w-full text-left bg-white rounded-2xl p-4 active:bg-gray-50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">{inv.invoice_number || `#${inv.id.slice(0, 8)}`}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{inv.status}</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900 mt-1">{fmtMoney(inv.amount)}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{who} · Due {fmtDate(inv.due_date)}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {openInvoice && (
        <InvoiceSheet invoice={openInvoice} driverId={driver.id} onClose={() => setOpenInvoice(null)} />
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
  const [busy, setBusy] = useState<'send' | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings')
        .select('company_name, logo_path, factoring_email').limit(1).maybeSingle()
      if (error) throw error
      return data as CompanySettings | null
    },
  })

  useMemo(() => {
    if (!settings?.logo_path) { setLogoUrl(null); return }
    supabase.storage.from('branding').createSignedUrl(settings.logo_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setLogoUrl(data.signedUrl)
    })
  }, [settings?.logo_path])

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

  async function buildBody() {
    const companyName = settings?.company_name ?? 'Driven Transportation'
    const invoiceLabel = invoice.invoice_number || `#${invoice.id.slice(0, 8)}`
    const lines: (string | null)[] = [
      `Invoice ${invoiceLabel} from ${companyName}`,
      ``,
      `Bill to: ${billTo?.name ?? '—'}`,
      `Load: ${loadLabel}`,
    ]
    if (origin || dest) lines.push(`Route: ${origin || '—'} → ${dest || '—'}`)
    if (invoice.loads?.miles != null) lines.push(`Miles: ${invoice.loads.miles.toLocaleString()}`)
    lines.push(`Amount: ${fmtMoney(invoice.amount)}`)
    if (invoice.issued_date) lines.push(`Issued: ${fmtDate(invoice.issued_date)}`)
    if (invoice.due_date)    lines.push(`Due: ${fmtDate(invoice.due_date)}`)

    // Attach signed links to rate_con / pod documents so the recipient can
    // verify the billing with the source documents. 7-day validity.
    if (invoice.load_id) {
      const { data: docs } = await supabase.from('load_documents')
        .select('kind, file_name, storage_path')
        .eq('load_id', invoice.load_id)
        .in('kind', ['rate_con', 'pod'])
      if (docs && docs.length > 0) {
        lines.push('')
        lines.push('Supporting documents (valid 7 days):')
        for (const d of docs) {
          const { data } = await supabase.storage.from('load-documents')
            .createSignedUrl(d.storage_path, 60 * 60 * 24 * 7)
          lines.push(`- ${String(d.kind).toUpperCase()} (${d.file_name}): ${data?.signedUrl ?? '(link unavailable)'}`)
        }
      }
    }

    if (invoice.notes) {
      lines.push('')
      lines.push('Notes:')
      lines.push(invoice.notes)
    }

    lines.push('')
    lines.push(`— ${companyName}`)
    return { body: lines.filter(l => l != null).join('\n'), subject: `Invoice ${invoiceLabel} — ${companyName}` }
  }

  async function sendEmail() {
    setBusy('send'); setError(null)
    try {
      const { body, subject } = await buildBody()
      const to = billTo?.email ?? ''
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function sendText() {
    setBusy('send'); setError(null)
    try {
      const { body } = await buildBody()
      const to = billTo?.phone ?? ''
      // iOS allows sms:NUMBER&body=... with the ampersand
      window.location.href = `sms:${to}${to ? '&' : '?'}body=${encodeURIComponent(body)}`
    } catch (e) {
      setError((e as Error).message)
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
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-bold" style={{ background: '#c8410a' }}>D</div>
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
            onClick={sendEmail}
            disabled={busy !== null}
            className="py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: '#c8410a' }}
          >
            {billTo?.email ? 'Email' : 'Email…'}
          </button>
          <button
            onClick={sendText}
            disabled={busy !== null}
            className="py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: '#0a7fc8' }}
          >
            {billTo?.phone ? 'Text' : 'Text…'}
          </button>
        </div>

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
