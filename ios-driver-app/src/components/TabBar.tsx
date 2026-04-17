import type { ReactNode } from 'react'

export type TabKey = 'home' | 'loads' | 'brokers' | 'invoices' | 'profile'

export const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'home',     label: 'Home',     icon: <HomeIcon /> },
  { key: 'loads',    label: 'Loads',    icon: <BoxIcon /> },
  { key: 'brokers',  label: 'Brokers',  icon: <PhoneIcon /> },
  { key: 'invoices', label: 'Invoices', icon: <DocIcon /> },
  { key: 'profile',  label: 'Profile',  icon: <UserIcon /> },
]

export function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-40 bg-white/90 backdrop-blur border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <ul className="grid grid-cols-5">
        {TABS.map(t => {
          const on = t.key === active
          return (
            <li key={t.key}>
              <button
                onClick={() => onChange(t.key)}
                className="w-full flex flex-col items-center justify-center py-2 gap-1 cursor-pointer"
                style={{ color: on ? '#c8410a' : '#8e8e93' }}
              >
                <span className="w-6 h-6 flex items-center justify-center">{t.icon}</span>
                <span className="text-[11px] font-medium">{t.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
    </svg>
  )
}
function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  )
}
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  )
}
