import { createElement, useEffect, useRef } from 'react'
import type { HorizontalDragScrollProps } from '@/components/ui/HorizontalDragScroll'

const DRAG_THRESHOLD_PX = 6

const sidewaysScroller = (node: Element | null, within: Element) => {
  for (let el = node; el && within.contains(el); el = el.parentElement) {
    const { overflowX } = getComputedStyle(el)
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth
    )
      return el as HTMLElement
  }
  return null
}

const snapCss = (padding: number) =>
  `[data-ww-hdrag="snap-${padding}"]>div{scroll-snap-type:x mandatory;scroll-padding-inline-start:${padding}px}[data-ww-hdrag="snap-${padding}"]>div>div>*{scroll-snap-align:start}`

export default function HorizontalDragScroll({
  children,
  enabled = true,
  snapPadding,
  onDragStart,
  onDragEnd,
  onWheelScroll,
}: HorizontalDragScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const callbacksRef = useRef({ onDragStart, onDragEnd, onWheelScroll })
  useEffect(() => {
    callbacksRef.current = { onDragStart, onDragEnd, onWheelScroll }
  })

  useEffect(() => {
    const box = ref.current
    if (!box || !enabled) return

    let activeCleanup: (() => void) | null = null
    let suppressClickCleanup: (() => void) | null = null
    let restoreSnapCleanup: (() => void) | null = null

    const clearSuppressClick = () => {
      suppressClickCleanup?.()
      suppressClickCleanup = null
    }

    const clearRestoreSnap = () => {
      restoreSnapCleanup?.()
      restoreSnapCleanup = null
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > 0 || event.shiftKey) {
        clearRestoreSnap()
        callbacksRef.current.onWheelScroll?.()
      }
    }

    const onDragStartNative = (event: DragEvent) => {
      if (sidewaysScroller(event.target as Element | null, box)) {
        event.preventDefault()
      }
    }

    const onPointerDown = (down: PointerEvent) => {
      if (down.pointerType !== 'mouse' || down.button !== 0) return
      const scroller = sidewaysScroller(down.target as Element | null, box)
      if (!scroller) return

      activeCleanup?.()
      clearRestoreSnap()

      const startX = down.clientX
      const startY = down.clientY
      const startScrollLeft = scroller.scrollLeft
      let dragging = false
      let lastDeltaX = 0

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerEnd)
        window.removeEventListener('pointercancel', onPointerEnd)
        activeCleanup = null
      }

      const onPointerMove = (move: PointerEvent) => {
        if (move.pointerId !== down.pointerId) return
        const dx = move.clientX - startX
        const dy = move.clientY - startY

        if (!dragging) {
          if (
            Math.abs(dy) >= DRAG_THRESHOLD_PX &&
            Math.abs(dy) > Math.abs(dx)
          ) {
            cleanup()
            return
          }
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
          dragging = true
          window.getSelection()?.removeAllRanges()
          scroller.style.scrollSnapType = 'none'
          scroller.style.cursor = 'grabbing'
          scroller.style.userSelect = 'none'
          callbacksRef.current.onDragStart?.()
        }

        lastDeltaX = dx
        move.preventDefault()
        scroller.scrollLeft = startScrollLeft - dx
      }

      const onPointerEnd = (end: PointerEvent) => {
        if (end.pointerId !== down.pointerId) return
        cleanup()
        if (!dragging) return

        scroller.style.cursor = ''
        scroller.style.userSelect = ''

        clearSuppressClick()
        const suppressClick = (click: MouseEvent) => {
          click.preventDefault()
          click.stopPropagation()
          clearSuppressClick()
        }
        const timer = setTimeout(clearSuppressClick, 0)
        box.addEventListener('click', suppressClick, { capture: true })
        suppressClickCleanup = () => {
          clearTimeout(timer)
          box.removeEventListener('click', suppressClick, { capture: true })
        }

        const maxScroll = Math.max(
          0,
          scroller.scrollWidth - scroller.clientWidth
        )
        const scrollLeft = scroller.scrollLeft

        if (callbacksRef.current.onDragEnd) {
          callbacksRef.current.onDragEnd({
            deltaX: lastDeltaX,
            scrollLeft,
            maxScroll,
          })
          const restore = () => {
            scroller.style.scrollSnapType = ''
            clearRestoreSnap()
          }
          const snapTimer = setTimeout(restore, 600)
          scroller.addEventListener('scrollend', restore, { once: true })
          restoreSnapCleanup = () => {
            clearTimeout(snapTimer)
            scroller.removeEventListener('scrollend', restore)
            scroller.style.scrollSnapType = ''
          }
        } else {
          scroller.style.scrollSnapType = ''
        }
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
      activeCleanup = cleanup
    }

    box.addEventListener('pointerdown', onPointerDown)
    box.addEventListener('wheel', onWheel, { passive: true })
    box.addEventListener('dragstart', onDragStartNative)
    return () => {
      activeCleanup?.()
      clearSuppressClick()
      clearRestoreSnap()
      box.removeEventListener('pointerdown', onPointerDown)
      box.removeEventListener('wheel', onWheel)
      box.removeEventListener('dragstart', onDragStartNative)
    }
  }, [enabled])

  if (!enabled) return children

  const snapTag = snapPadding !== undefined ? `snap-${snapPadding}` : undefined

  return createElement(
    'div',
    {
      ref,
      'data-ww-hdrag': snapTag ?? '',
      style: { display: 'contents' },
    },
    snapPadding !== undefined && (
      <style href={`ww-hdrag-${snapTag}`} precedence='ww'>
        {snapCss(snapPadding)}
      </style>
    ),
    children
  )
}
