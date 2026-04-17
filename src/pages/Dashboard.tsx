import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

// ── Stat queries ──────────────────────────────────────────────────────────────

function useStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [activeLoads, openInvoices, trucks, drivers] = await Promise.all([
        supabase
          .from('loads')
          .select('id', { count: 'exact', head: true })
          .in('status', ['Assigned', 'In Transit']),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .in('status', ['Sent', 'Overdue']),
        supabase
          .from('trucks')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('drivers')
          .select('id', { count: 'exact', head: true }),
      ])
      return {
        activeLoads: activeLoads.count ?? 0,
        openInvoices: openInvoices.count ?? 0,
        trucks: trucks.count ?? 0,
        drivers: drivers.count ?? 0,
      }
    },
  })
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, onClick, loading,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  onClick?: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 p-5 text-left w-full hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="text-[#c8410a] mb-3 opacity-80">{icon}</div>
      <div className="text-2xl font-semibold text-gray-900">
        {loading ? <span className="text-gray-200 animate-pulse">—</span> : value}
      </div>
      <div className="text-xs text-gray-400 mt-1 group-hover:text-gray-600 transition-colors">{label}</div>
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const TruckIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <rect x="1" y="3" width="15" height="13" rx="1" />
    <path d="M16 8h4l3 4v4h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

const PackageIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
  </svg>
)

const InvoiceIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const DriverIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const navModules = [
  { label: 'Loads', path: '/loads', desc: 'Track & manage loads' },
  { label: 'Invoices', path: '/invoices', desc: 'Billing & payments' },
  { label: 'Expenses', path: '/expenses', desc: 'Costs & fuel' },
  { label: 'Trucks', path: '/trucks', desc: 'Fleet management' },
  { label: 'Drivers', path: '/drivers', desc: 'Driver records' },
  { label: 'Brokers', path: '/brokers', desc: 'Broker contacts' },
  { label: 'Maintenance', path: '/maintenance', desc: 'Service & repairs' },
]

// ── Dashboard page ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useStats()

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Driven Transportation Inc. — Webster, NY</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Loads"
          value={stats?.activeLoads ?? 0}
          icon={<PackageIcon />}
          loading={isLoading}
          onClick={() => navigate('/loads')}
        />
        <StatCard
          label="Open Invoices"
          value={stats?.openInvoices ?? 0}
          icon={<InvoiceIcon />}
          loading={isLoading}
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          label="Trucks"
          value={stats?.trucks ?? 0}
          icon={<TruckIcon />}
          loading={isLoading}
          onClick={() => navigate('/trucks')}
        />
        <StatCard
          label="Drivers"
          value={stats?.drivers ?? 0}
          icon={<DriverIcon />}
          loading={isLoading}
          onClick={() => navigate('/drivers')}
        />
      </div>

      {/* Module grid */}
      <div>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Modules</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {navModules.map(item => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:border-[#c8410a]/25 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="text-sm font-medium text-gray-700 group-hover:text-[#c8410a] transition-colors">
                {item.label}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
