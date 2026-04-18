import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type IconName =
  | 'dashboard' | 'loads' | 'brokers' | 'customers'
  | 'truck' | 'trailer' | 'drivers' | 'wrench'
  | 'invoice' | 'expense'
  | 'shield' | 'file' | 'settings' | 'logout' | 'menu' | 'chevron'

interface NavItem {
  label: string
  path: string
  icon: IconName
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dispatch',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
      { label: 'Loads',     path: '/loads',     icon: 'loads' },
      { label: 'Brokers',   path: '/brokers',   icon: 'brokers' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Trucks',      path: '/trucks',      icon: 'truck' },
      { label: 'Trailers',    path: '/trailers',    icon: 'trailer' },
      { label: 'Drivers',     path: '/drivers',     icon: 'drivers' },
      { label: 'Maintenance', path: '/maintenance', icon: 'wrench' },
    ],
  },
  {
    label: 'Financials',
    items: [
      { label: 'Invoices', path: '/invoices', icon: 'invoice' },
      { label: 'Expenses', path: '/expenses', icon: 'expense' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Customers',  path: '/customers',  icon: 'customers' },
      { label: 'Compliance', path: '/compliance', icon: 'shield' },
      { label: 'Filings',    path: '/filings',    icon: 'file' },
    ],
  },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data as { logo_path: string | null; company_name: string | null } | null
    },
  })

  useEffect(() => {
    if (!settings?.logo_path) { setLogoUrl(null); return }
    let cancelled = false
    supabase.storage.from('branding').createSignedUrl(settings.logo_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setLogoUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [settings?.logo_path])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const email = session?.user?.email ?? ''
  const initials = (email ? email[0] : 'D').toUpperCase()
  const companyName = settings?.company_name ?? 'Driven TMS'
  const settingsActive = location.pathname === '/settings'

  const sidebar = (
    <aside
      className="flex flex-col h-full w-64 text-gray-200"
      style={{ background: 'linear-gradient(180deg, #141830 0%, #0a0d1c 100%)' }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2.5 px-5 h-16 border-b border-white/5 cursor-pointer"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
        ) : (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#c8410a' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4l3 4v4h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
        )}
        <span className="font-bold text-white text-sm tracking-wide truncate">{companyName}</span>
      </button>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV_GROUPS.map(group => {
          const isCollapsed = collapsed[group.label] === true
          return (
            <div key={group.label}>
              <button
                onClick={() => setCollapsed(c => ({ ...c, [group.label]: !isCollapsed }))}
                className="w-full flex items-center justify-between px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                <span>{group.label}</span>
                <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
              {!isCollapsed && (
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const active = location.pathname === item.path
                    return (
                      <li key={item.path}>
                        <button
                          onClick={() => navigate(item.path)}
                          className={`w-full flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                            active
                              ? 'text-white font-medium'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                          style={active ? { background: 'rgba(59, 130, 246, 0.15)', boxShadow: 'inset 2px 0 0 #3b82f6' } : undefined}
                        >
                          <Icon name={item.icon} className={`w-4 h-4 ${active ? 'text-blue-400' : ''}`} />
                          <span className="flex-1 text-left">{item.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        <div className="pt-3 mt-3 border-t border-white/5 space-y-0.5">
          <button
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              settingsActive ? 'text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            style={settingsActive ? { background: 'rgba(59, 130, 246, 0.15)', boxShadow: 'inset 2px 0 0 #3b82f6' } : undefined}
          >
            <Icon name="settings" className={`w-4 h-4 ${settingsActive ? 'text-blue-400' : ''}`} />
            <span className="flex-1 text-left">Settings</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Icon name="logout" className="w-4 h-4" />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </div>
      </nav>

      {/* User chip */}
      <div className="px-3 pb-4 pt-2 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: '#c8410a' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{companyName}</p>
            <p className="text-[11px] text-gray-400 truncate">{email || 'Admin'}</p>
          </div>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen flex" style={{ background: '#f8f7f4' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:block fixed inset-y-0 left-0 w-64 z-30">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            {sidebar}
          </div>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-20 h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 w-full">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1.5 cursor-pointer text-gray-700">
          <Icon name="menu" className="w-5 h-5" />
        </button>
        <span className="font-semibold text-gray-900 text-sm">{companyName}</span>
      </div>

      <main className="flex-1 md:ml-64">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'dashboard':
      return <svg viewBox="0 0 24 24" className={className} {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
    case 'loads':
      return <svg viewBox="0 0 24 24" className={className} {...p}><rect x="3" y="7" width="13" height="10" rx="1"/><path d="M16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
    case 'brokers':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
    case 'customers':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M17 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'truck':
      return <svg viewBox="0 0 24 24" className={className} {...p}><rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 9h4l3 4v4h-7V9z"/><circle cx="6" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/></svg>
    case 'trailer':
      return <svg viewBox="0 0 24 24" className={className} {...p}><rect x="2" y="6" width="18" height="11" rx="1"/><circle cx="8" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/><path d="M20 12h2"/></svg>
    case 'drivers':
      return <svg viewBox="0 0 24 24" className={className} {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
    case 'wrench':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8a2.8 2.8 0 0 1-4-4l8-8 1.7-1.7z"/><path d="M6 17l-3 3"/></svg>
    case 'invoice':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5"/><path d="M8 13h8M8 17h5"/></svg>
    case 'expense':
      return <svg viewBox="0 0 24 24" className={className} {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></svg>
    case 'shield':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
    case 'file':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>
    case 'settings':
      return <svg viewBox="0 0 24 24" className={className} {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
    case 'logout':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
    case 'menu':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    case 'chevron':
      return <svg viewBox="0 0 24 24" className={className} {...p}><path d="M6 9l6 6 6-6"/></svg>
  }
}
