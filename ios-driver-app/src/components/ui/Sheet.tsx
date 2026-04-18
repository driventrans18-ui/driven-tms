import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  /** Max height fraction of the viewport (0.5 / 0.75 / 0.9). Default 0.9. */
  height?: 'half' | 'tall' | 'full'
}

const HEIGHT_STYLES = {
  half: 'max-h-[55vh]',
  tall: 'max-h-[80vh]',
  full: 'max-h-[94vh]',
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open, onClose, title, children, footer, height = 'full',
}: SheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    document.documentElement.style.overflow = 'hidden'

    const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.documentElement.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'sheet-title' : undefined}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={containerRef}
        className={`relative w-full bg-surface-card rounded-t-xl shadow-3 flex flex-col ${HEIGHT_STYLES[height]}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle affordance */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-strong" />
        </div>
        {title && (
          <header className="flex items-center justify-between gap-4 px-5 pt-1 pb-3 border-b border-border-subtle">
            <h2 id="sheet-title" className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="w-11 h-11 -mr-2 rounded-md flex items-center justify-center text-text-tertiary active:bg-surface-muted"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </header>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
