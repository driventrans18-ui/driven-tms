import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ComplianceItem, type ComplianceEntity, type ComplianceKind,
  KIND_LABEL, DRIVER_KINDS, TRUCK_KINDS, COMPANY_KINDS,
  listItems, upsertItem, deleteItem, severity, daysLeft,
} from '../lib/compliance'

function kindsForEntity(entity: ComplianceEntity): ComplianceKind[] {
  if (entity === 'driver') return DRIVER_KINDS
  if (entity === 'truck') return TRUCK_KINDS
  return COMPANY_KINDS
}

function SeverityPill({ expiresAt }: { expiresAt: string }) {
  const sev = severity(expiresAt)
  const d = daysLeft(expiresAt)
  const label = sev === 'expired'
    ? `${Math.abs(d)}d overdue`
    : sev === 'ok' ? `${d}d left` : `${d}d left`
  const cls =
    sev === 'expired'  ? 'bg-red-100 text-red-700' :
    sev === 'critical' ? 'bg-orange-100 text-orange-700' :
    sev === 'warning'  ? 'bg-yellow-100 text-yellow-800' :
                         'bg-green-100 text-green-700'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function ItemForm({
  entityType, entityId, editing, onClose,
}: {
  entityType: ComplianceEntity
  entityId: string | null
  editing: ComplianceItem | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const allowed = kindsForEntity(entityType)
  const [form, setForm] = useState({
    kind: (editing?.kind ?? allowed[0]) as ComplianceKind,
    issued_at: editing?.issued_at ?? '',
    expires_at: editing?.expires_at ?? '',
    notes: editing?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.expires_at) throw new Error('Expiration date is required')
      await upsertItem({
        id: editing?.id,
        entity_type: entityType,
        entity_id: entityId,
        kind: form.kind,
        issued_at: form.issued_at,
        expires_at: form.expires_at,
        notes: form.notes,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-items'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Compliance Item' : 'New Compliance Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.kind} onChange={e => set('kind', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]">
              {allowed.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued</label>
              <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expires *</label>
              <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 focus:border-[var(--color-brand-500)]" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.expires_at}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer" style={{ background: 'var(--color-brand-500)' }}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ComplianceTab({
  entityType, entityId,
}: {
  entityType: ComplianceEntity
  entityId: string | null
}) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing: ComplianceItem | null }>({ open: false, editing: null })

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['compliance-items', entityType, entityId],
    queryFn: () => listItems({ entityType, entityId }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-items'] }),
    onError: (e: Error) => alert(e.message),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compliance</h3>
        <button onClick={() => setModal({ open: true, editing: null })}
          className="text-xs font-medium text-[var(--color-brand-500)] hover:underline cursor-pointer">+ Add</button>
      </div>
      {isLoading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">No items tracked.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {items.map(item => (
            <li key={item.id} className="px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{KIND_LABEL[item.kind]}</p>
                <p className="text-xs text-gray-400">Expires {item.expires_at}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <SeverityPill expiresAt={item.expires_at} />
                <button onClick={() => setModal({ open: true, editing: item })}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Edit</button>
                <button onClick={() => { if (confirm(`Delete ${KIND_LABEL[item.kind]}?`)) deleteMutation.mutate(item.id) }}
                  className="text-xs text-red-500 hover:text-red-700 cursor-pointer">×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {modal.open && (
        <ItemForm entityType={entityType} entityId={entityId}
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })} />
      )}
    </div>
  )
}

export { SeverityPill }
