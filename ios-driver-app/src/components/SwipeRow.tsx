import { useEffect, useRef, useState, type ReactNode } from 'react'

// iOS-style left-swipe reveal. Drag left on the row to expose action panels
// (Edit, then Delete on the far right). Release past the threshold to snap
// open; quick-swipe all the way to fire the primary (Delete) action. Tapping
// outside — or opening another row — snaps shut.

const PANEL_WIDTH = 84
const OPEN_THRESHOLD = 48
const FIRE_THRESHOLD_FACTOR = 2.2 // fire on release past revealWidth * this

export function SwipeRow({ children, onDelete, onEdit, deleteLabel = 'Delete', editLabel = 'Edit', disabled }: {
  children: ReactNode
  onDelete: () => void
  onEdit?: () => void
  deleteLabel?: string
  editLabel?: string
  disabled?: boolean
}) {
  const revealWidth = (onEdit ? PANEL_WIDTH : 0) + PANEL_WIDTH
  const fireThreshold = revealWidth * FIRE_THRESHOLD_FACTOR

  const [dx, setDx] = useState(0)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const startDx = useRef(0)
  const axisLocked = useRef<'x' | 'y' | null>(null)

  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== rootRef.current) {
        setOpen(false); setDx(0)
      }
    }
    window.addEventListener('swipe-row-open', onOtherOpen as EventListener)
    return () => window.removeEventListener('swipe-row-open', onOtherOpen as EventListener)
  }, [])

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
    startDx.current = open ? -revealWidth : 0
    axisLocked.current = null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (disabled || startX.current == null || startY.current == null) return
    const t = e.touches[0]
    const dX = t.clientX - startX.current
    const dY = t.clientY - startY.current
    if (axisLocked.current == null) {
      if (Math.abs(dX) < 6 && Math.abs(dY) < 6) return
      axisLocked.current = Math.abs(dX) > Math.abs(dY) ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return
    const next = Math.min(0, startDx.current + dX)
    setDx(Math.max(next, -fireThreshold - 40))
  }

  function onTouchEnd() {
    if (disabled) return
    const d = dx
    startX.current = null
    startY.current = null
    // Quick swipe past the fire threshold fires the primary (Delete) action.
    if (-d > fireThreshold) {
      setOpen(false); setDx(0)
      onDelete()
      return
    }
    if (-d > OPEN_THRESHOLD) {
      setOpen(true); setDx(-revealWidth)
      window.dispatchEvent(new CustomEvent('swipe-row-open', { detail: rootRef.current }))
    } else {
      setOpen(false); setDx(0)
    }
  }

  const close = () => { setOpen(false); setDx(0) }

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-2xl">
      {/* Action panels behind the row. Rendered right-to-left: Delete sits
          flush to the right edge, Edit (if any) sits just left of Delete. */}
      <button
        type="button"
        onClick={() => { close(); onDelete() }}
        aria-label={deleteLabel}
        className="absolute inset-y-0 right-0 flex items-center justify-center text-white text-sm font-semibold cursor-pointer"
        style={{ width: PANEL_WIDTH, background: '#dc2626' }}
      >
        {deleteLabel}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={() => { close(); onEdit() }}
          aria-label={editLabel}
          className="absolute inset-y-0 flex items-center justify-center text-white text-sm font-semibold cursor-pointer"
          style={{ width: PANEL_WIDTH, right: PANEL_WIDTH, background: '#0a7fc8' }}
        >
          {editLabel}
        </button>
      )}
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
