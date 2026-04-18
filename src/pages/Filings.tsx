import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'
import { KIND_LABEL, daysUntil, severity, severityClasses, type TaxDeadline, type FilingKind } from '../lib/filings'

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
}

function DeadlineModal({ onClose, editing }: { onClose: () => void; editing: TaxDeadline | null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    kind:     (editing?.kind     ?? 'ifta') as FilingKind,
    period:   editing?.period   ?? '',
    due_date: editing?.due_date ?? '',
    filed_on: editing?.filed_on ?? '',
    notes:    editing?.notes    ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        kind: form.kind,
        period: form.period,
        due_date: form.due_date,
        filed_on: form.filed_on || null,
        notes: form.notes || null,
      }
      const { error } = editing
        ? await supabase.from('tax_deadlines').update(payload).eq('id', editing.id)
        : await supabase.from('tax_deadlines').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tax-deadlines'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Deadline' : 'New Deadline'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as FilingKind }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50">
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Period</label>
              <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="Q1 2026"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Filed on (optional)</label>
            <input type="date" value={form.filed_on} onChange={e => setForm(f => ({ ...f, filed_on: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !form.period || !form.due_date}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: 'var(--color-brand-500)' }}>
            {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Deadline'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Filings() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing: TaxDeadline | null }>({ open: false, editing: null })

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['tax-deadlines'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_deadlines').select('*').order('due_date')
      if (error) throw error
      return (data ?? []) as TaxDeadline[]
    },
  })

  const markFiled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tax_deadlines')
        .update({ filed_on: new Date().toISOString().slice(0, 10) })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-deadlines'] }),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tax_deadlines').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-deadlines'] }),
  })

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tax &amp; regulatory filings</h1>
          <p className="text-sm text-gray-400 mt-0.5">IFTA, Form 2290, UCR, and custom deadlines</p>
        </div>
        <button onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: 'var(--color-brand-500)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Deadline
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No deadlines yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(it => {
            const s = severity(it.filed_on, it.due_date)
            const cls = severityClasses(s)
            const days = daysUntil(it.due_date)
            return (
              <li key={it.id} className={`p-4 rounded-xl border ${cls}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{KIND_LABEL[it.kind]}</span>
                      <span className="text-xs text-gray-500">· {it.period}</span>
                    </div>
                    <p className="text-xs mt-1">
                      Due {fmtDate(it.due_date)}
                      {s === 'overdue' && <span className="ml-2 font-semibold">({-days} days overdue)</span>}
                      {s === 'due-soon' && <span className="ml-2 font-semibold">(in {days} days)</span>}
                      {s === 'filed' && <span className="ml-2 text-green-700">· Filed {fmtDate(it.filed_on)}</span>}
                    </p>
                    {it.notes && <p className="text-xs text-gray-500 mt-1">{it.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {s !== 'filed' && (
                      <button onClick={() => markFiled.mutate(it.id)}
                        className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--color-brand-500)' }}>
                        Mark filed
                      </button>
                    )}
                    <button onClick={() => setModal({ open: true, editing: it })}
                      className="text-xs text-gray-500 cursor-pointer">Edit</button>
                    <button onClick={() => { if (confirm(`Delete ${KIND_LABEL[it.kind]} ${it.period}?`)) del.mutate(it.id) }}
                      className="text-xs text-red-600 cursor-pointer">Delete</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {modal.open && <DeadlineModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </AppShell>
  )
}
