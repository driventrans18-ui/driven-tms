import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'
import { ComplianceTab, SeverityPill } from '../components/ComplianceTab'
import {
  type ComplianceItem, type ComplianceEntity,
  KIND_LABEL, listItems, deleteItem, severity, daysLeft,
} from '../lib/compliance'

function useEntityNames() {
  const drivers = useQuery({
    queryKey: ['drivers-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('id, first_name, last_name')
      if (error) throw error
      return data as Array<{ id: string; first_name: string | null; last_name: string | null }>
    },
  })
  const trucks = useQuery({
    queryKey: ['trucks-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number')
      if (error) throw error
      return data as Array<{ id: string | number; unit_number: string | null }>
    },
  })
  return useMemo(() => {
    const d = new Map<string, string>()
    for (const row of drivers.data ?? []) {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || '—'
      d.set(String(row.id), name)
    }
    const t = new Map<string, string>()
    for (const row of trucks.data ?? []) t.set(String(row.id), row.unit_number ?? '—')
    return { drivers: d, trucks: t }
  }, [drivers.data, trucks.data])
}

function entityLabel(
  item: ComplianceItem,
  names: { drivers: Map<string, string>; trucks: Map<string, string> },
): string {
  if (item.entity_type === 'company') return 'Company'
  if (!item.entity_id) return '—'
  if (item.entity_type === 'driver') return names.drivers.get(item.entity_id) ?? 'Driver'
  if (item.entity_type === 'truck') return `Truck ${names.trucks.get(item.entity_id) ?? ''}`.trim()
  return '—'
}

function Section({
  title, tint, items, names, onEdit, onDelete,
}: {
  title: string
  tint: string
  items: ComplianceItem[]
  names: { drivers: Map<string, string>; trucks: Map<string, string> }
  onEdit: (item: ComplianceItem) => void
  onDelete: (item: ComplianceItem) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-5 rounded-sm ${tint}`} />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">· {items.length}</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Item', 'Assigned to', 'Expires', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{KIND_LABEL[item.kind]}</td>
                <td className="px-4 py-3 text-gray-600">{entityLabel(item, names)}</td>
                <td className="px-4 py-3 text-gray-600 tabular-nums">{item.expires_at}</td>
                <td className="px-4 py-3"><SeverityPill expiresAt={item.expires_at} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(item)} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer mr-3">Edit</button>
                  <button onClick={() => onDelete(item)} className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type AddTarget = { entity_type: ComplianceEntity; entity_id: string | null } | null

function AddPicker({ onClose, onPick }: {
  onClose: () => void
  onPick: (t: NonNullable<AddTarget>) => void
}) {
  const drivers = useQuery({
    queryKey: ['drivers-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('id, first_name, last_name').order('last_name')
      if (error) throw error
      return data as Array<{ id: string; first_name: string | null; last_name: string | null }>
    },
  })
  const trucks = useQuery({
    queryKey: ['trucks-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number').order('unit_number')
      if (error) throw error
      return data as Array<{ id: string | number; unit_number: string | null }>
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Track compliance for…</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Company</p>
            <button onClick={() => onPick({ entity_type: 'company', entity_id: null })}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-[#c8410a] hover:bg-[#c8410a]/5 text-sm cursor-pointer">
              Company-level item (insurance, UCR, IFTA decal…)
            </button>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Drivers</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(drivers.data ?? []).map(d => (
                <button key={d.id} onClick={() => onPick({ entity_type: 'driver', entity_id: String(d.id) })}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-[#c8410a] hover:bg-[#c8410a]/5 text-sm cursor-pointer">
                  {[d.first_name, d.last_name].filter(Boolean).join(' ') || '—'}
                </button>
              ))}
              {drivers.data?.length === 0 && <p className="text-xs text-gray-400">No drivers</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Trucks</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(trucks.data ?? []).map(t => (
                <button key={String(t.id)} onClick={() => onPick({ entity_type: 'truck', entity_id: String(t.id) })}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-[#c8410a] hover:bg-[#c8410a]/5 text-sm cursor-pointer">
                  {t.unit_number ?? '—'}
                </button>
              ))}
              {trucks.data?.length === 0 && <p className="text-xs text-gray-400">No trucks</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EntityPanel({ target, onClose }: { target: NonNullable<AddTarget>; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-14 bottom-0 z-40 w-full max-w-sm bg-white border-l border-gray-100 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{target.entity_type}</p>
            <h2 className="text-base font-semibold text-gray-900">Compliance</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <ComplianceTab entityType={target.entity_type} entityId={target.entity_id} />
        </div>
      </aside>
    </>
  )
}

export function Compliance() {
  const qc = useQueryClient()
  const [picker, setPicker] = useState(false)
  const [panel, setPanel] = useState<AddTarget>(null)
  const names = useEntityNames()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['compliance-items', 'all'],
    queryFn: () => listItems(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-items'] }),
    onError: (e: Error) => alert(e.message),
  })

  const grouped = useMemo(() => {
    const expired: ComplianceItem[] = []
    const critical: ComplianceItem[] = []
    const warning: ComplianceItem[] = []
    const ok: ComplianceItem[] = []
    for (const item of items) {
      const sev = severity(item.expires_at)
      if (sev === 'expired') expired.push(item)
      else if (sev === 'critical') critical.push(item)
      else if (sev === 'warning') warning.push(item)
      else ok.push(item)
    }
    const byDate = (a: ComplianceItem, b: ComplianceItem) => daysLeft(a.expires_at) - daysLeft(b.expires_at)
    return {
      expired: expired.sort(byDate),
      critical: critical.sort(byDate),
      warning: warning.sort(byDate),
      ok: ok.sort(byDate),
    }
  }, [items])

  const handleEdit = (item: ComplianceItem) =>
    setPanel({ entity_type: item.entity_type, entity_id: item.entity_id })

  const handleDelete = (item: ComplianceItem) => {
    if (confirm(`Delete ${KIND_LABEL[item.kind]}?`)) deleteMutation.mutate(item.id)
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Compliance</h1>
          <p className="text-sm text-gray-400 mt-0.5">{items.length} tracked</p>
        </div>
        <button onClick={() => setPicker(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg cursor-pointer" style={{ background: '#c8410a' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Item
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          Nothing tracked yet. Click <span className="font-medium text-gray-600">Add Item</span> to start.
        </div>
      ) : (
        <>
          <Section title="Expired"    tint="bg-red-500"    items={grouped.expired}  names={names} onEdit={handleEdit} onDelete={handleDelete} />
          <Section title="Next 30 days"  tint="bg-orange-500" items={grouped.critical} names={names} onEdit={handleEdit} onDelete={handleDelete} />
          <Section title="Next 90 days"  tint="bg-yellow-500" items={grouped.warning}  names={names} onEdit={handleEdit} onDelete={handleDelete} />
          <Section title="Good standing" tint="bg-green-500"  items={grouped.ok}       names={names} onEdit={handleEdit} onDelete={handleDelete} />
        </>
      )}

      {picker && (
        <AddPicker
          onClose={() => setPicker(false)}
          onPick={t => { setPicker(false); setPanel(t) }}
        />
      )}
      {panel && <EntityPanel target={panel} onClose={() => setPanel(null)} />}
    </AppShell>
  )
}
