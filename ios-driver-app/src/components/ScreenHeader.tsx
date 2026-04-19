import type { ReactNode } from 'react'

// Large title + optional right-aligned action. Mirrors the Apple stock-app
// pattern: a single orange "+" circle, nothing else fancy in the header.
// Individual screens render this as their first child so the title scrolls
// with content — matching iOS large-title behaviour.

export function ScreenHeader({ title, action }: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-3 pt-3 pb-1">
      <h1 className="text-[34px] leading-none font-bold text-gray-900 tracking-tight">{title}</h1>
      {action ? <div className="flex items-center">{action}</div> : null}
    </div>
  )
}

export function PlusButton({ onClick, label = 'Add' }: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-8 h-8 rounded-full text-white flex items-center justify-center text-xl font-light active:opacity-90 cursor-pointer"
      style={{ background: 'var(--color-brand-500)', lineHeight: 1 }}
    >
      +
    </button>
  )
}

// Circular header icon used for the Settings gear on the Profile screen.
// Neutral fill so it doesn't compete with the brand "+" buttons on other
// screens — Apple uses icon-only controls for secondary navigation.
export function IconButton({ onClick, label, children }: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-80 cursor-pointer"
      style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)' }}
    >
      {children}
    </button>
  )
}
