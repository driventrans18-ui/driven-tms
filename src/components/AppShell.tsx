import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const navItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Loads', path: '/loads' },
  { label: 'Invoices', path: '/invoices' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Trucks', path: '/trucks' },
  { label: 'Drivers', path: '/drivers' },
  { label: 'Brokers', path: '/brokers' },
  { label: 'Maintenance', path: '/maintenance' },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()

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
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: '#c8410a' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" />
                  <path d="M16 8h4l3 4v4h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900 text-sm">Driven TMS</span>
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

          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
