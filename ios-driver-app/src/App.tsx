import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDriver } from './hooks/useDriver'
import { Login } from './screens/Login'
import { Home } from './screens/Home'
import { Loads } from './screens/Loads'
import { Brokers } from './screens/Brokers'
import { Expenses } from './screens/Expenses'
import { Invoices } from './screens/Invoices'
import { Profile } from './screens/Profile'
import { DriverMode } from './screens/DriverMode'
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
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400 bg-[#f2f2f7]">
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
  const [driverModeOpen, setDriverModeOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400 bg-[#f2f2f7]">
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
    // Fixed flex column owns the full viewport. The TabBar is a normal flex
    // child at the bottom rather than position:fixed — that prevents iOS
    // WKWebView from rubber-banding the tab bar along with the page on
    // overscroll. Only the <main> region scrolls internally. Each screen now
    // renders its own title + optional "+" action in its header row.
    <div
      className="fixed inset-0 flex flex-col bg-[#f2f2f7]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {tab === 'home'     && <Home driver={driver} onGoToLoads={() => setTab('loads')} onOpenDriverMode={() => setDriverModeOpen(true)} />}
        {tab === 'loads'    && <Loads driver={driver} />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'invoices' && <Invoices driver={driver} />}
        {tab === 'profile'  && <Profile driver={driver} email={email} onOpenBrokers={() => setBrokersOpen(true)} />}
      </main>
      <TabBar active={tab} onChange={setTab} />
      {brokersOpen && (
        <div className="fixed inset-0 z-50 bg-[#f2f2f7] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}>
          <header className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
            <h1 className="text-2xl font-bold text-gray-900">Brokers</h1>
            <button onClick={() => setBrokersOpen(false)} className="text-[#c8410a] text-base font-medium cursor-pointer">Done</button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <Brokers />
          </div>
        </div>
      )}
      {driverModeOpen && (
        <DriverMode driver={driver} onExit={() => setDriverModeOpen(false)} />
      )}
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f2f2f7] text-center">
      <p className="text-base text-gray-700 max-w-sm">{message}</p>
    </div>
  )
}
