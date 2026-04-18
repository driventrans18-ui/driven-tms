import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'
import { listItems, severity, KIND_LABEL, daysLeft } from '../lib/compliance'
import { Skeleton } from '../components/ui'

function useStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [activeLoads, openInvoices, trucks, drivers] = await Promise.all([
        supabase.from('loads').select('id', { count: 'exact', head: true })
          .in('status', ['Assigned', 'In Transit']),
        supabase.from('invoices').select('id', { count: 'exact', head: true })
          .in('status', ['Sent', 'Overdue']),
        supabase.from('trucks').select('id', { count: 'exact', head: true }),
        supabase.from('drivers').select('id', { count: 'exact', head: true }),
      ])
      return {
        activeLoads:  activeLoads.count  ?? 0,
        openInvoices: openInvoices.count ?? 0,
        trucks:       trucks.count       ?? 0,
        drivers:      drivers.count      ?? 0,
      }
    },
  })
}

function startOfWeek(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(d.getDate() + diff)
  return monday
}

function useWeekSummary() {
  return useQuery({
    queryKey: ['dashboard-week-summary'],
    queryFn: async () => {
      const since = startOfWeek().toISOString()
      const { data, error } = await supabase
        .from('loads')
        .select('rate, miles, status')
        .gte('created_at', since)
      if (error) throw error
      const rows = (data ?? []) as Array<{ rate: number | null; miles: number | null; status: string | null }>
      const delivered = rows.filter(r => r.status === 'Delivered')
      const revenue = delivered.reduce((s, r) => s + (r.rate ?? 0), 0)
      const miles   = delivered.reduce((s, r) => s + (r.miles ?? 0), 0)
      const rpm = miles > 0 ? revenue / miles : 0
      return { revenue, miles, rpm, loads: delivered.length }
    },
  })
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function ExpiringSoonBanner() {
  const navigate = useNavigate()
  const { data: items = [] } = useQuery({
    queryKey: ['compliance-items', 'all'],
    queryFn: () => listItems(),
  })
  const attention = items.filter(i => ['expired', 'critical'].includes(severity(i.expires_at)))
  if (attention.length === 0) return null
  const expiredCount = attention.filter(i => severity(i.expires_at) === 'expired').length
  const preview = attention.slice(0, 3)
  const hasExpired = expiredCount > 0
  const surfaceClass = hasExpired
    ? 'bg-danger-100 border-danger-500/30 hover:bg-danger-100/80'
    : 'bg-warning-100 border-warning-500/30 hover:bg-warning-100/80'
  return (
    <button
      onClick={() => navigate('/compliance')}
      className={`w-full text-left mb-4 p-4 rounded-lg border cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surfaceClass}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {attention.length} compliance item{attention.length === 1 ? '' : 's'} need attention
            {hasExpired && <span className="text-danger-500"> · {expiredCount} expired</span>}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {preview.map(i => `${KIND_LABEL[i.kind]} (${daysLeft(i.expires_at)}d)`).join(' · ')}
            {attention.length > 3 && ` · +${attention.length - 3} more`}
          </p>
        </div>
        <span className="text-xs font-medium text-text-tertiary shrink-0">View →</span>
      </div>
    </button>
  )
}

function WeeklyMetric({ label, value, loading, emphasis }: {
  label: string; value: string; loading: boolean; emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 tabular ${emphasis ? 'text-brand-500' : 'text-text-primary'}`}>
        {loading ? <Skeleton width={72} height={24} /> : value}
      </p>
    </div>
  )
}

function WeeklySummary() {
  const { data, isLoading } = useWeekSummary()
  const r = data ?? { revenue: 0, miles: 0, rpm: 0, loads: 0 }
  return (
    <section className="bg-surface-card rounded-lg border border-border-subtle p-5 mb-6 shadow-1">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">This week</h2>
        <span className="text-xs text-text-tertiary tabular">{r.loads} delivered</span>
      </header>
      <div className="grid grid-cols-3 gap-4">
        <WeeklyMetric label="Revenue" value={fmtMoney(r.revenue)} loading={isLoading} />
        <WeeklyMetric label="Miles"   value={r.miles.toLocaleString()} loading={isLoading} />
        <WeeklyMetric label="$/mile"  value={r.miles > 0 ? '$' + r.rpm.toFixed(2) : '—'} loading={isLoading} emphasis />
      </div>
    </section>
  )
}

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
      className="bg-surface-card rounded-lg border border-border-subtle p-5 text-left w-full hover:border-border-strong hover:shadow-1 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="text-brand-500 mb-3 opacity-80">{icon}</div>
      <div className="text-2xl font-semibold text-text-primary tabular">
        {loading ? <Skeleton width={40} height={26} /> : value}
      </div>
      <div className="text-xs text-text-tertiary mt-1 group-hover:text-text-secondary transition-colors">
        {label}
      </div>
    </button>
  )
}

const TruckIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="1" y="3" width="15" height="13" rx="1" />
    <path d="M16 8h4l3 4v4h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)
const PackageIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
  </svg>
)
const InvoiceIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)
const DriverIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const navModules = [
  { label: 'Loads',       path: '/loads',       desc: 'Track & manage loads' },
  { label: 'Invoices',    path: '/invoices',    desc: 'Billing & payments' },
  { label: 'Expenses',    path: '/expenses',    desc: 'Costs & fuel' },
  { label: 'Trucks',      path: '/trucks',      desc: 'Fleet management' },
  { label: 'Drivers',     path: '/drivers',     desc: 'Driver records' },
  { label: 'Brokers',     path: '/brokers',     desc: 'Broker contacts' },
  { label: 'Maintenance', path: '/maintenance', desc: 'Service & repairs' },
]

export function Dashboard() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useStats()

  return (
    <AppShell>
      <header className="mb-7">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Driven Transportation Inc. — Webster, NY</p>
      </header>

      <ExpiringSoonBanner />

      <WeeklySummary />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" aria-label="Key metrics">
        <StatCard label="Active Loads"  value={stats?.activeLoads  ?? 0} icon={<PackageIcon />} loading={isLoading} onClick={() => navigate('/loads')} />
        <StatCard label="Open Invoices" value={stats?.openInvoices ?? 0} icon={<InvoiceIcon />} loading={isLoading} onClick={() => navigate('/invoices')} />
        <StatCard label="Trucks"        value={stats?.trucks       ?? 0} icon={<TruckIcon />}   loading={isLoading} onClick={() => navigate('/trucks')} />
        <StatCard label="Drivers"       value={stats?.drivers      ?? 0} icon={<DriverIcon />}  loading={isLoading} onClick={() => navigate('/drivers')} />
      </section>

      <section>
        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Modules</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {navModules.map(item => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="bg-surface-card rounded-lg border border-border-subtle p-4 text-left hover:border-brand-500/30 hover:shadow-1 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="text-sm font-medium text-text-secondary group-hover:text-brand-500 transition-colors">
                {item.label}
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
