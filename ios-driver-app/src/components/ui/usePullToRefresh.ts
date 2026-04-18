import { useEffect, useRef, useState } from 'react'
import { impactLight, notifySuccess } from './haptics'

interface UsePullToRefreshOptions {
  /** Called when the pull threshold is crossed. Awaited for spinner visibility. */
  onRefresh: () => Promise<void> | void
  /** Distance in pixels required to trigger the refresh. Default 60. */
  threshold?: number
  /** Optional disable flag, e.g. while another gesture is active. */
  disabled?: boolean
}

/**
 * Attach to a scroll container. Returns the ref plus render state for the
 * indicator. Uses Pointer Events; keeps the work per-frame trivial.
 */
export function usePullToRefresh<T extends HTMLElement>({
  onRefresh, threshold = 60, disabled = false,
}: UsePullToRefreshOptions) {
  const ref = useRef<T>(null)
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startRef = useRef<number | null>(null)
  const firedHaptic = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return

    function onPointerDown(e: PointerEvent) {
      if (el!.scrollTop > 0) return
      startRef.current = e.clientY
      firedHaptic.current = false
    }
    function onPointerMove(e: PointerEvent) {
      if (startRef.current == null) return
      const dy = e.clientY - startRef.current
      if (dy <= 0) { setPullY(0); return }
      const eased = Math.min(dy * 0.5, threshold * 1.5)
      setPullY(eased)
      if (eased >= threshold && !firedHaptic.current) {
        firedHaptic.current = true
        void impactLight()
      }
    }
    async function onPointerUp() {
      const finalY = pullY
      startRef.current = null
      if (finalY >= threshold && !refreshing) {
        setRefreshing(true)
        setPullY(threshold)
        try { await onRefresh(); void notifySuccess() } finally {
          setRefreshing(false)
          setPullY(0)
        }
      } else {
        setPullY(0)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup',   onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup',   onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
  }, [onRefresh, threshold, disabled, pullY, refreshing])

  return { ref, pullY, refreshing, threshold }
}
