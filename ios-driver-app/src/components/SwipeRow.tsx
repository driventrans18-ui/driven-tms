import { useEffect, useRef, useState, type ReactNode } from 'react'

// iOS-style left-swipe reveal. Drag left on the row to expose a red Delete
// action; release past the threshold and the action fires. Releasing below
// the threshold snaps shut. Tapping anywhere outside (or on any other row)
// also snaps shut so only one row is ever open at a time.

const REVEAL_WIDTH = 84    // width of the red Delete panel
const OPEN_THRESHOLD = 48  // snap-open boundary (px of drag)
const FIRE_THRESHOLD = 180 // past this, release triggers the action

export function SwipeRow({ children, onDelete, label = 'Delete', disabled }: {
  children: ReactNode
  onDelete: () => void
  label?: string
  disabled?: boolean
}) {
  const [dx, setDx]   = useState(0)    // current translation (negative = left)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const startDx = useRef(0)
  const axisLocked = useRef<'x' | 'y' | null>(null)

  // Close when any other row opens — we listen for a custom event on window.
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== rootRef.current) {
        setOpen(false); setDx(0)
      }
    }
    window.addEventListener('swipe-row-open', onOtherOpen as EventListener)
    return () => window.removeEventListener('swipe-row-open', onOtherOpen as EventListener)
  }, [])

  // Close on outside tap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return
      const target = e.target as Node
      if (!rootRef.current.contains(target)) {
        setOpen(false); setDx(0)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
    startDx.current = open ? -REVEAL_WIDTH : 0
    axisLocked.current = null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (disabled || startX.current == null || startY.current == null) return
    const t = e.touches[0]
    const dX = t.clientX - startX.current
    const dY = t.clientY - startY.current
    // Lock to an axis on first meaningful movement so vertical scrolling still
    // works and horizontal drags aren't fighting the list scroller.
    if (axisLocked.current == null) {
      if (Math.abs(dX) < 6 && Math.abs(dY) < 6) return
      axisLocked.current = Math.abs(dX) > Math.abs(dY) ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return
    // Only track leftward drags (dx ≤ 0). Allow a tiny overshoot past
    // -REVEAL_WIDTH for rubber-banding feel.
    const next = Math.min(0, startDx.current + dX)
    setDx(Math.max(next, -FIRE_THRESHOLD - 40))
  }

  function onTouchEnd() {
    if (disabled) { return }
    const d = dx
    startX.current = null
    startY.current = null
    // Releasing way past the reveal fires the action directly (iOS "quick
    // swipe" semantics) so the driver doesn't have to tap Delete twice.
    if (-d > FIRE_THRESHOLD) {
      setOpen(false); setDx(0)
      onDelete()
      return
    }
    if (-d > OPEN_THRESHOLD) {
      setOpen(true); setDx(-REVEAL_WIDTH)
      window.dispatchEvent(new CustomEvent('swipe-row-open', { detail: rootRef.current }))
    } else {
      setOpen(false); setDx(0)
    }
  }

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-2xl">
      {/* Red action panel behind the row. */}
      <button
        type="button"
        onClick={() => {
          setOpen(false); setDx(0)
          onDelete()
        }}
        aria-label={label}
        className="absolute inset-y-0 right-0 flex items-center justify-center text-white text-sm font-semibold cursor-pointer"
        style={{ width: REVEAL_WIDTH, background: '#dc2626' }}
      >
        {label}
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: startX.current == null ? 'transform 180ms ease-out' : 'none',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
