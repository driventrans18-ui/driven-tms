import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface Item {
  id: string
  kind: string
  expires_at: string
}

const KIND_LABEL: Record<string, string> = {
  cdl: 'CDL',
  medical_card: 'Medical Card',
  hazmat_endorsement: 'HazMat',
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

function daysLeft(expires_at: string): number {
  const today = new Date()
  const exp = new Date(expires_at + 'T00:00:00')
  const ms = Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate())
         - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round(ms / 86_400_000)
}

function tint(d: number) {
  if (d < 0) return 'bg-red-100 text-red-700'
  if (d <= 30) return 'bg-orange-100 text-orange-700'
  if (d <= 90) return 'bg-yellow-100 text-yellow-800'
  return 'bg-green-100 text-green-700'
}

// Driver's own items + every company item that applies to them.
export function ExpirationsCard({ driverId }: { driverId: string }) {
  const { data: items = [] } = useQuery({
    queryKey: ['my-compliance', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('id, kind, expires_at, entity_type, entity_id')
        .or(`and(entity_type.eq.driver,entity_id.eq.${driverId}),entity_type.eq.company`)
        .order('expires_at')
      if (error) throw error
      return (data ?? []) as Item[]
    },
  })

  if (items.length === 0) return null

  const attention = items.filter(i => daysLeft(i.expires_at) <= 90).slice(0, 4)
  if (attention.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expirations</h2>
        <span className="text-xs text-gray-400">{attention.length} need attention</span>
      </div>
      <ul className="space-y-2">
        {attention.map(item => {
          const d = daysLeft(item.expires_at)
          const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `${d}d left`
          return (
            <li key={item.id} className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{KIND_LABEL[item.kind] ?? item.kind}</p>
                <p className="text-xs text-gray-400">Expires {item.expires_at}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tint(d)}`}>{label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
