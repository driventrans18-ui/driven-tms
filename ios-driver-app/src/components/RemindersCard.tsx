import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { SwipeRow } from './SwipeRow'

// Compliance reminders: CDL / medical card / IFTA / UCR / inspections / etc.
// Driver-specific items and any company-wide items both show here. Each row
// can be tapped to edit the due date and notes, or to mark it paid with an
// optional amount. Past-due items float to the top with a red badge.

type Kind =
  | 'cdl'
  | 'medical_card'
  | 'hazmat_endorsement'
  | 'twic'
  | 'tsa_precheck'
  | 'annual_dot_inspection'
  | 'registration'
  | 'irp_apportioned_plate'
  | 'liability_insurance'
  | 'cargo_insurance'
  | 'ucr'
  | 'ifta_decal'
  | 'drug_alcohol_consortium'

type EntityType = 'driver' | 'truck' | 'company'

export interface ComplianceItem {
  id: string
  kind: Kind
  entity_type: EntityType
  entity_id: string | null
  issued_at: string | null
  expires_at: string
  notes: string | null
  paid_date:   string | null
  paid_amount: number | null
}

const KIND_LABEL: Record<Kind, string> = {
  cdl: 'CDL',
  medical_card: 'Medical Card',
  hazmat_endorsement: 'HazMat Endorsement',
  twic: 'TWIC',
  tsa_precheck: 'TSA PreCheck',
  annual_dot_inspection: 'Annual DOT Inspection',
  registration: 'Registration',
  irp_apportioned_plate: 'IRP Plate',
  liability_insurance: 'Liability Insurance',
  cargo_insurance: 'Cargo Insurance',
  ucr: 'UCR',
  ifta_decal: 'IFTA Decal',
  drug_alcohol_consortium: 'D&A Consortium',
}

const KIND_OPTIONS = Object.entries(KIND_LABEL) as Array<[Kind, string]>

function daysLeft(isoDate: string): number {
  const today = new Date()
  const exp = new Date(isoDate + 'T00:00:00')
  const ms = Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate())
         - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round(ms / 86_400_000)
}

function tint(d: number, paid: boolean): string {
  if (paid) return 'bg-green-100 text-green-700'
  if (d < 0) return 'bg-red-100 text-red-700'
  if (d <= 30) return 'bg-orange-100 text-orange-700'
  if (d <= 90) return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-600'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtMoney(n: number | null): string {
  if (n == null) return ''
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RemindersCard({ driverId }: { driverId: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ editing: ComplianceItem | null } | null>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['my-compliance', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('id, kind, entity_type, entity_id, issued_at, expires_at, notes, paid_date, paid_amount')
        .or(`and(entity_type.eq.driver,entity_id.eq.${driverId}),entity_type.eq.company`)
        .order('expires_at')
      if (error) throw error
      return (data ?? []) as ComplianceItem[]
    },
  })

  const quickDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-compliance', driverId] }),
    onError: (e: Error) => alert(e.message),
  })

  // Items with a paid_date sink to the bottom; the rest sort by due date
  // ascending so overdue → soon appears first.
  const sorted = [...items].sort((a, b) => {
    const ap = !!a.paid_date, bp = !!b.paid_date
    if (ap !== bp) return ap ? 1 : -1
    return a.expires_at.localeCompare(b.expires_at)
  })

  const attention = items.filter(i => !i.paid_date && daysLeft(i.expires_at) <= 90).length

  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming reminders</h2>
        {attention > 0 && <span className="text-xs text-gray-400">{attention} need attention</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No reminders yet. Add one to track renewals, IFTA, inspections, etc.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map(item => {
            const paid = !!item.paid_date
            const d = daysLeft(item.expires_at)
            const badge = paid
              ? 'Paid'
              : d < 0 ? `${Math.abs(d)}d overdue`
              : d === 0 ? 'today'
              : `${d}d left`
            return (
              <li key={item.id}>
                <SwipeRow
                  onEdit={() => setForm({ editing: item })}
                  onDelete={() => {
                    if (confirm(`Delete ${KIND_LABEL[item.kind]} reminder?`)) {
                      quickDelete.mutate(item.id)
                    }
                  }}
                >
                  <button
                    onClick={() => setForm({ editing: item })}
                    className="w-full text-left bg-white rounded-2xl px-1 py-1 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {KIND_LABEL[item.kind]}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Due {fmtDate(item.expires_at)}
                          {paid && item.paid_amount != null && ` · Paid ${fmtMoney(item.paid_amount)}`}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ml-2 shrink-0 ${tint(d, paid)}`}>
                        {badge}
                      </span>
                    </div>
                  </button>
                </SwipeRow>
              </li>
            )
          })}
        </ul>
      )}

      <button
        onClick={() => setForm({ editing: null })}
        className="w-full mt-3 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer"
        style={{ background: '#c8410a' }}
      >
        + Add reminder
      </button>

      {form && (
        <ReminderFormSheet
          driverId={driverId}
          editing={form.editing}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

// ── Create / edit / mark paid sheet ───────────────────────────────────────────

function ReminderFormSheet({ driverId, editing, onClose }: {
  driverId: string
  editing: ComplianceItem | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!editing
  const [form, setForm] = useState({
    kind:        editing?.kind      ?? ('ifta_decal' as Kind),
    entity_type: editing?.entity_type ?? ('driver' as EntityType),
    issued_at:   editing?.issued_at ?? '',
    expires_at:  editing?.expires_at ?? new Date().toISOString().slice(0, 10),
    notes:       editing?.notes ?? '',
    paid:        !!editing?.paid_date,
    paid_date:   editing?.paid_date ?? '',
    paid_amount: editing?.paid_amount != null ? String(editing.paid_amount) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      if (!form.expires_at) throw new Error('Enter a due date.')
      const payload = {
        kind:        form.kind,
        entity_type: form.entity_type,
        entity_id:   form.entity_type === 'driver' ? driverId : null,
        issued_at:   form.issued_at || null,
        expires_at:  form.expires_at,
        notes:       form.notes || null,
        paid_date:   form.paid ? (form.paid_date || new Date().toISOString().slice(0, 10)) : null,
        paid_amount: form.paid && form.paid_amount ? Number(form.paid_amount) : null,
      }
      const { error } = isEdit && editing
        ? await supabase.from('compliance_items').update(payload).eq('id', editing.id)
        : await supabase.from('compliance_items').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-compliance', driverId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  // Convenience: advance the due date by one year when marking paid so the
  // next reminder cycle is already scheduled (typical for annual renewals).
  const rollForwardYear = () => {
    if (!form.expires_at) return
    const d = new Date(form.expires_at + 'T00:00:00')
    d.setFullYear(d.getFullYear() + 1)
    set('expires_at', d.toISOString().slice(0, 10))
  }

  const quickMarkPaid = () => {
    set('paid', true)
    if (!form.paid_date) set('paid_date', new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Reminder' : 'New Reminder'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.kind} onChange={e => set('kind', e.target.value as Kind)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base">
              {KIND_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Applies to</label>
            <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
              {(['driver', 'company'] as EntityType[]).map(t => {
                const on = form.entity_type === t
                return (
                  <button key={t} onClick={() => set('entity_type', t)}
                    className="py-2 rounded-lg text-xs font-medium cursor-pointer"
                    style={on ? { background: '#c8410a', color: 'white' } : { color: '#6b7280' }}>
                    {t === 'driver' ? 'My driver record' : 'Company-wide'}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued</label>
              <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due</label>
              <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Policy #, filing reference, vendor, etc."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base" />
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Mark as paid</p>
              <button
                onClick={() => form.paid ? set('paid', false) : quickMarkPaid()}
                className="text-xs px-3 py-1 rounded-full font-semibold cursor-pointer"
                style={form.paid
                  ? { background: '#dcfce7', color: '#15803d' }
                  : { background: '#e5e7eb', color: '#374151' }}
              >
                {form.paid ? 'Paid' : 'Not paid'}
              </button>
            </div>

            {form.paid && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid on</label>
                  <input type="date" value={form.paid_date} onChange={e => set('paid_date', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-base" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
                  <input type="number" inputMode="decimal" value={form.paid_amount}
                    onChange={e => set('paid_amount', e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-base" />
                </div>
              </div>
            )}

            {form.paid && (
              <button
                type="button"
                onClick={rollForwardYear}
                className="mt-3 text-xs font-semibold text-[#c8410a] cursor-pointer"
              >
                Roll due date +1 year
              </button>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full mt-5 py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
          style={{ background: '#c8410a' }}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Reminder'}
        </button>
      </div>
    </div>
  )
}
