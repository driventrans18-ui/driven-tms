import type { ReactNode } from 'react'

export type TabKey = 'home' | 'loads' | 'expenses' | 'invoices' | 'profile'

export const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'home',     label: 'Home',     icon: <HomeIcon /> },
  { key: 'loads',    label: 'Loads',    icon: <BoxIcon /> },
  { key: 'expenses', label: 'Expenses', icon: <FuelIcon /> },
  { key: 'invoices', label: 'Invoices', icon: <DocIcon /> },
  { key: 'profile',  label: 'Profile',  icon: <UserIcon /> },
]

export function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    // Rendered as a flex child of the viewport-fixed shell in App.tsx so iOS
    // WKWebView overscroll can't rubber-band the bar off-screen.
    <nav
      className="shrink-0 bg-white/90 backdrop-blur border-t border-gray-200"
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
function FuelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 22V4a1 1 0 011-1h8a1 1 0 011 1v18" />
      <path d="M3 10h10" />
      <path d="M13 7l4 2v9a2 2 0 01-2 2h0a2 2 0 01-2-2v-3" />
      <path d="M15 5v3" />
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
