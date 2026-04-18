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
    <div className="flex items-center justify-between mb-4 pt-1">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
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
      style={{ background: '#c8410a', lineHeight: 1 }}
    >
      +
    </button>
  )
}
