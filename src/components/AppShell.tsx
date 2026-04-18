import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const navItems = [
  { label: 'Dashboard',   path: '/dashboard' },
  { label: 'Loads',       path: '/loads' },
  { label: 'Invoices',    path: '/invoices' },
  { label: 'Expenses',    path: '/expenses' },
  { label: 'Trucks',      path: '/trucks' },
  { label: 'Trailers',    path: '/trailers' },
  { label: 'Drivers',     path: '/drivers' },
  { label: 'Brokers',     path: '/brokers' },
  { label: 'Customers',   path: '/customers' },
  { label: 'Maintenance', path: '/maintenance' },
  { label: 'Compliance',  path: '/compliance' },
  { label: 'Filings',     path: '/filings' },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

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

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const settingsActive = location.pathname === '/settings'

  return (
    <div className="min-h-screen bg-surface-bg">
      <header className="sticky top-0 z-30 bg-surface-card/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
          {/* Brand */}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="Go to Dashboard"
            className="flex items-center gap-2 rounded-md px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-7 w-auto object-contain" />
            ) : (
              <span className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center text-text-on-brand" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" />
                  <path d="M16 8h4l3 4v4h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </span>
            )}
            <span className="font-semibold text-text-primary text-sm truncate">
              {settings?.company_name ?? 'Driven TMS'}
            </span>
          </button>

          {/* Primary nav */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
            {navItems.map(item => {
              const active = location.pathname === item.path
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'h-9 px-3 text-sm rounded-md whitespace-nowrap transition-colors cursor-pointer',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    active
                      ? 'text-brand-500 bg-brand-100 font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* Trailing actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-current={settingsActive ? 'page' : undefined}
              aria-label="Settings"
              className={[
                'h-9 w-9 inline-flex items-center justify-center rounded-md cursor-pointer transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                settingsActive
                  ? 'text-brand-500 bg-brand-100'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-muted',
              ].join(' ')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-muted cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
