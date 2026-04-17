import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
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
      // Most recently assigned load's truck is treated as the current assignment.
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

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
            style={{ background: '#c8410a' }}>
            {(driver.first_name?.[0] ?? 'D').toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{fullName}</p>
            <p className="text-sm text-gray-500">Driven Transportation Inc.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl divide-y divide-gray-100">
        <Row k="Email" v={email ?? driver.email ?? '—'} />
        <Row k="Phone" v={driver.phone ?? '—'} />
        <Row k="CDL" v={driver.cdl_class ?? '—'} />
        <Row k="Status" v={driver.status ?? '—'} />
      </div>

      <div className="bg-white rounded-2xl p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Assigned truck</p>
        {truck ? (
          <>
            <p className="text-lg font-bold text-gray-900">{truck.unit_number ?? '—'}</p>
            <p className="text-sm text-gray-500">
              {[truck.year, truck.make, truck.model].filter(Boolean).join(' ') || '—'}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">No truck on recent loads.</p>
        )}
      </div>

      <button onClick={onOpenBrokers}
        className="w-full py-3.5 rounded-xl bg-white text-gray-900 text-base font-semibold active:bg-gray-50 cursor-pointer flex items-center justify-between px-5">
        <span>Brokers</span>
        <span className="text-gray-300">›</span>
      </button>

      <button onClick={signOut}
        className="w-full py-3.5 rounded-xl bg-white text-red-600 text-base font-semibold active:bg-gray-50 cursor-pointer">
        Sign out
      </button>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-gray-500">{k}</span>
      <span className="text-base text-gray-900 font-medium">{v}</span>
    </div>
  )
}
