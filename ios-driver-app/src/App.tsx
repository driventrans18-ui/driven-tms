import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDriver } from './hooks/useDriver'
import { Login } from './screens/Login'
import { Home } from './screens/Home'
import { Loads } from './screens/Loads'
import { Brokers } from './screens/Brokers'
import { Customers } from './screens/Customers'
import { Expenses } from './screens/Expenses'
import { Invoices } from './screens/Invoices'
import { Profile } from './screens/Profile'
import { DriverMode } from './screens/DriverMode'
import { Settings } from './screens/Settings'
import { TabBar, type TabKey } from './components/TabBar'
import { registerPushForUser } from './lib/push'

export function App() {
  const { session, loading } = useAuth()
  const [tab, setTab] = useState<TabKey>('home')

  useEffect(() => {
    // Ask for notification permission once a session is active.
    if (!session) return
    let cancelled = false
    ;(async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const status = await LocalNotifications.checkPermissions()
        if (!cancelled && status.display !== 'granted') {
          await LocalNotifications.requestPermissions()
        }
      } catch { /* web or plugin unavailable */ }
      // Register for APNs so compliance reminders can reach this device.
      if (!cancelled) registerPushForUser(session.user.id)
    })()
    return () => { cancelled = true }
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400 ">
        Loading…
      </div>
    )
  }
  if (!session) return <Login />

  return <Shell tab={tab} setTab={setTab} userId={session.user.id} email={session.user.email ?? undefined} />
}

function Shell({ tab, setTab, userId, email }: {
  tab: TabKey; setTab: (k: TabKey) => void; userId: string; email: string | undefined
}) {
  const { data: driver, isLoading, error } = useDriver(userId, email)
  const [brokersOpen, setBrokersOpen] = useState(false)
  const [customersOpen, setCustomersOpen] = useState(false)
  const [driverModeOpen, setDriverModeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400 ">
        Loading profile…
      </div>
    )
  }
  if (error) {
    return <ErrorScreen message={error.message} />
  }
  if (!driver) {
    return <ErrorScreen message={`No driver record linked to ${email}. Ask dispatch to add you in the web TMS (Drivers → Add Driver) with this email.`} />
  }

  return (
    // Fixed flex column owns the full viewport. Content extends to the
    // absolute top/bottom edges — the status-bar and home-indicator areas
    // get the app background underneath, not a solid colour strip. The
    // inner scroll region pushes its own padding equal to the safe-area
    // insets so the first/last row clear the dynamic island and home bar.
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: 'var(--color-surface-bg)' }}
    >
      <main
        className="flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: '12px',
        }}
      >
        {tab === 'home'     && <Home driver={driver} onGoToLoads={() => setTab('loads')} onOpenDriverMode={() => setDriverModeOpen(true)} />}
        {tab === 'loads'    && <Loads driver={driver} />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'invoices' && <Invoices driver={driver} />}
        {tab === 'profile'  && <Profile driver={driver} email={email} onOpenBrokers={() => setBrokersOpen(true)} onOpenCustomers={() => setCustomersOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />}
      </main>
      <TabBar active={tab} onChange={setTab} />
      {brokersOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-surface-bg)' }}>
          <header
            className="px-4 pb-3 flex items-center justify-between shrink-0"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <h1 className="text-2xl font-bold text-gray-900">Brokers</h1>
            <button onClick={() => setBrokersOpen(false)} className="text-[var(--color-brand-500)] text-base font-medium cursor-pointer">Done</button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <Brokers />
          </div>
        </div>
      )}
      {customersOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-surface-bg)' }}>
          <header
            className="px-4 pb-3 flex items-center justify-between shrink-0"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
            <button onClick={() => setCustomersOpen(false)} className="text-[var(--color-brand-500)] text-base font-medium cursor-pointer">Done</button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <Customers />
          </div>
        </div>
      )}
      {driverModeOpen && (
        <DriverMode driver={driver} onExit={() => setDriverModeOpen(false)} />
      )}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6  text-center">
      <p className="text-base text-gray-700 max-w-sm">{message}</p>
    </div>
  )
}
