import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'
import { downloadInvoicePdf } from '../lib/invoicePdf'

type InvoiceStatus = 'Draft' | 'Sent' | 'Overdue' | 'Paid'

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
  loads: { id: string; load_number: string | null; origin_city: string | null; dest_city: string | null } | null
  brokers: { id: string; name: string } | null
  customers: { id: string; name: string } | null
}

const STATUS_CONFIG: Record<InvoiceStatus, string> = {
  Draft:   'bg-gray-100 text-gray-600',
  Sent:    'bg-blue-100 text-blue-700',
  Overdue: 'bg-red-100 text-red-700',
  Paid:    'bg-green-100 text-green-700',
}

const TABS: Array<InvoiceStatus | 'All'> = ['All', 'Draft', 'Sent', 'Overdue', 'Paid']

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CONFIG[status as InvoiceStatus] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

function fmt(n: number | null) { return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

function InvoiceModal({ onClose, editing }: { onClose: () => void; editing: Invoice | null }) {
  const qc = useQueryClient()
  const [billTo, setBillTo] = useState<'broker' | 'customer'>(
    editing?.customer_id ? 'customer' : 'broker'
  )
  const [form, setForm] = useState({
    invoice_number: editing?.invoice_number ?? '',
    load_id:        editing?.load_id        ?? '',
    broker_id:      editing?.broker_id      ?? '',
    customer_id:    editing?.customer_id    ?? '',
    amount:         editing?.amount != null ? String(editing.amount) : '',
    issued_date:    editing?.issued_date    ?? '',
    due_date:       editing?.due_date       ?? '',
    status:         (editing?.status ?? 'Draft') as InvoiceStatus,
    notes:          editing?.notes          ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: loads = [] } = useQuery({ queryKey: ['loads-simple'], queryFn: async () => {
    const { data } = await supabase.from('loads').select('id, load_number, origin_city, dest_city').order('created_at', { ascending: false })
    return (data ?? []) as Array<{ id: string; load_number: string | null; origin_city: string | null; dest_city: string | null }>
  }})
  const { data: brokers = [] } = useQuery({ queryKey: ['brokers-simple'], queryFn: async () => {
    const { data } = await supabase.from('brokers').select('id, name').order('name')
    return (data ?? []) as Array<{ id: string; name: string }>
  }})
  const { data: customers = [] } = useQuery({ queryKey: ['customers-simple'], queryFn: async () => {
    const { data } = await supabase.from('customers').select('id, name').order('name')
    return (data ?? []) as Array<{ id: string; name: string }>
  }})

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_number: form.invoice_number || null,
        load_id: form.load_id || null,
        broker_id: billTo === 'broker' ? (form.broker_id || null) : null,
        customer_id: billTo === 'customer' ? (form.customer_id || null) : null,
        amount: form.amount ? Number(form.amount) : null,
        issued_date: form.issued_date || null,
        due_date: form.due_date || null,
        status: form.status,
        notes: form.notes || null,
      }
      const { error } = editing
        ? await supabase.from('invoices').update(payload).eq('id', editing.id)
        : await supabase.from('invoices').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['dashboard-stats'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice #</label>
              <input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-001"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                {(['Draft', 'Sent', 'Overdue', 'Paid'] as InvoiceStatus[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Load</label>
            <select value={form.load_id} onChange={e => set('load_id', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
              <option value="">— Select load —</option>
              {loads.map(l => (
                <option key={l.id} value={l.id}>{l.load_number || `#${l.id.slice(0,8)}`} — {l.origin_city} → {l.dest_city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bill to</label>
            <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1 mb-2">
              {(['broker', 'customer'] as const).map(k => {
                const on = billTo === k
                return (
                  <button key={k} type="button" onClick={() => setBillTo(k)}
                    className="py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                    style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
                    {k === 'broker' ? 'Broker' : 'Customer'}
                  </button>
                )
              })}
            </div>
            {billTo === 'broker' ? (
              <select value={form.broker_id} onChange={e => set('broker_id', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                <option value="">— Select broker —</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]">
                <option value="">— Select customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
            <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued Date</label>
              <input type="date" value={form.issued_date} onChange={e => set('issued_date', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Any notes…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a] resize-none" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: '#c8410a' }}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ invoice, onClose, onEdit, onDelete, deleting }: {
  invoice: Invoice; onClose: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  async function handleDownload() {
    setPdfBusy(true); setPdfError(null)
    try {
      const name = invoice.invoice_number
        ? `invoice-${invoice.invoice_number}.pdf`
        : `invoice-${invoice.id.slice(0, 8)}.pdf`
      await downloadInvoicePdf(invoice.id, name)
    } catch (e) {
      setPdfError((e as Error).message)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Invoice</p>
            <h2 className="text-base font-semibold text-gray-900">{invoice.invoice_number || `#${invoice.id.slice(0,8)}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <StatusBadge status={invoice.status} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Amount" value={fmt(invoice.amount)} />
            <Detail label="Bill to" value={invoice.customers?.name ?? invoice.brokers?.name} />
            <Detail label="Issued" value={fmtDate(invoice.issued_date)} />
            <Detail label="Due" value={fmtDate(invoice.due_date)} />
            <Detail label="Paid" value={fmtDate(invoice.paid_date)} />
            <Detail label="Load" value={invoice.loads?.load_number ?? (invoice.load_id ? `#${invoice.load_id.slice(0,8)}` : undefined)} />
          </dl>
          {invoice.notes && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-700">{invoice.notes}</p>
            </div>
          )}
          <button
            onClick={handleDownload}
            disabled={pdfBusy}
            className="w-full px-3 py-2.5 text-sm font-medium rounded-lg border border-border-subtle bg-surface-card hover:bg-surface-muted text-text-primary disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <path d="M14 2v6h6" />
              <path d="M12 12v6" />
              <path d="M9 15l3 3 3-3" />
            </svg>
            {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
          </button>
          {pdfError && (
            <p role="alert" className="text-xs text-danger-500 bg-danger-100/50 rounded-md px-3 py-2">
              {pdfError}
            </p>
          )}
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onEdit} className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="flex-1 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 cursor-pointer">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </aside>
    </>
  )
}

export function Invoices() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<InvoiceStatus | 'All'>('All')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [modalState, setModalState] = useState<{ open: boolean; editing: Invoice | null }>({ open: false, editing: null })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*, loads(id, load_number, origin_city, dest_city), brokers(id, name), customers(id, name)').order('created_at', { ascending: false })
      if (error) throw error
      return data as Invoice[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setSelected(null)
    },
    onError: (e: Error) => alert(e.message),
  })

  const handleDelete = (invoice: Invoice) => {
    const label = invoice.invoice_number || `#${invoice.id.slice(0, 8)}`
    if (confirm(`Delete invoice ${label}? This cannot be undone.`)) {
      deleteMutation.mutate(invoice.id)
    }
  }

  const filtered = tab === 'All' ? invoices : invoices.filter(i => i.status === tab)
  const counts = TABS.reduce((acc, t) => { acc[t] = t === 'All' ? invoices.length : invoices.filter(i => i.status === t).length; return acc }, {} as Record<string, number>)
  const totalFiltered = filtered.reduce((sum, i) => sum + (i.amount ?? 0), 0)

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-400 mt-0.5">{invoices.length} total · {fmt(totalFiltered)} showing</p>
        </div>
        <button onClick={() => setModalState({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Invoice
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-100 p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${tab === t ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-800'}`}>
            {t}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No invoices found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Invoice #', 'Load', 'Bill to', 'Amount', 'Issued', 'Due', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(inv => (
                  <tr key={inv.id} onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
                    className={`cursor-pointer transition-colors ${selected?.id === inv.id ? 'bg-[#c8410a]/5' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.invoice_number || `#${inv.id.slice(0,8)}`}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.loads?.load_number ?? (inv.load_id ? `#${inv.load_id.slice(0,8)}` : '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.customers?.name ?? inv.brokers?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(inv.issued_date)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          invoice={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setModalState({ open: true, editing: selected })}
          onDelete={() => handleDelete(selected)}
          deleting={deleteMutation.isPending}
        />
      )}
      {modalState.open && (
        <InvoiceModal
          editing={modalState.editing}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}
    </AppShell>
  )
}
