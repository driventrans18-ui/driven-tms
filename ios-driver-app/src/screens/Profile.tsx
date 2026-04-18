import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ScreenHeader } from '../components/ScreenHeader'
import type { Driver } from '../hooks/useDriver'

interface Truck {
  id: number | string
  unit_number: string | null
  make: string | null
  model: string | null
  year: number | null
}

export function Profile({ driver, email, onOpenBrokers }: {
  driver: Driver; email: string | undefined; onOpenBrokers: () => void
}) {
  const { data: truck } = useQuery({
    queryKey: ['my-truck', driver.id],
    queryFn: async (): Promise<Truck | null> => {
      const { data, error } = await supabase.from('loads')
        .select('trucks(id, unit_number, make, model, year)')
        .eq('driver_id', driver.id)
        .not('truck_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      const row = data as unknown as { trucks: Truck | null } | null
      return row?.trucks ?? null
    },
  })

  const fullName = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || 'Driver'
  const initials = [driver.first_name?.[0], driver.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'D'

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="space-y-5 pb-6">
      <ScreenHeader title="Profile" />

      {/* Large avatar + name + company centered at top. */}
      <div className="flex flex-col items-center pt-2 pb-2">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-semibold"
          style={{ background: '#c8410a' }}
          aria-hidden
        >
          {initials}
        </div>
        <p className="mt-3 text-lg font-bold text-gray-900">{fullName}</p>
        <p className="text-sm text-gray-500">Driven Transportation Inc.</p>
      </div>

      <Section title="Personal Info">
        <Row k="Email" v={email ?? driver.email ?? '—'} />
        <Row k="Phone" v={driver.phone ?? '—'} />
      </Section>

      <Section title="License">
        <Row k="CDL"    v={driver.cdl_class ?? '—'} />
        <Row k="Status" v={driver.status    ?? '—'} valueColor={driver.status === 'Active' ? '#15803d' : undefined} />
      </Section>

      <Section title="Assigned Truck">
        {truck ? (
          <Row
            k="Assigned Truck"
            v={[truck.unit_number, [truck.year, truck.make, truck.model].filter(Boolean).join(' ')]
                .filter(Boolean).join(' · ') || '—'}
            chevron
          />
        ) : (
          <Row k="Assigned Truck" v="Not assigned" chevron />
        )}
      </Section>

      <button
        onClick={onOpenBrokers}
        className="w-full bg-white rounded-2xl px-5 py-3.5 flex items-center justify-between text-base font-semibold text-gray-900 active:bg-gray-50 cursor-pointer"
      >
        <span>Brokers</span>
        <span className="text-gray-300 text-lg">›</span>
      </button>

      <button
        onClick={signOut}
        className="w-full bg-white rounded-2xl py-3.5 text-red-600 text-base font-semibold active:bg-gray-50 cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">{title}</h2>
      <div className="bg-white rounded-2xl divide-y divide-gray-100">
        {children}
      </div>
    </div>
  )
}

function Row({ k, v, valueColor, chevron }: {
  k: string; v: string; valueColor?: string; chevron?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 gap-3">
      <span className="text-sm text-gray-500 shrink-0">{k}</span>
      <span className="text-base font-medium text-right truncate" style={{ color: valueColor ?? '#111827' }}>
        {v}
      </span>
      {chevron && <span className="text-gray-300 text-lg shrink-0">›</span>}
    </div>
  )
}
