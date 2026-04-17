import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const navItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Loads', path: '/loads' },
  { label: 'Invoices', path: '/invoices' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Trucks', path: '/trucks' },
  { label: 'Drivers', path: '/drivers' },
  { label: 'Brokers', path: '/brokers' },
  { label: 'Customers', path: '/customers' },
  { label: 'Maintenance', path: '/maintenance' },
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

  return (
    <div className="min-h-screen" style={{ background: '#f8f7f4' }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 cursor-pointer">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
              ) : (
                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: '#c8410a' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <path d="M16 8h4l3 4v4h-7V8z" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
              )}
              <span className="font-semibold text-gray-900 text-sm">{settings?.company_name ?? 'Driven TMS'}</span>
            </button>

            <nav className="hidden md:flex items-center gap-0.5">
              {navItems.map(item => {
                const active = location.pathname === item.path
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      active
                        ? 'text-[#c8410a] bg-[#c8410a]/8 font-medium'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              className={`text-sm transition-colors cursor-pointer ${
                location.pathname === '/settings' ? 'text-[#c8410a] font-medium' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Settings
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Sign out
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
