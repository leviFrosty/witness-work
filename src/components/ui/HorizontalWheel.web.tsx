import { type ReactNode, createElement, useEffect, useRef } from 'react'

/** The nearest ancestor of `node` that scrolls sideways, if any. */
const sidewaysScroller = (node: Element | null, within: Element) => {
  for (let el = node; el && within.contains(el); el = el.parentElement) {
    const { overflowX } = getComputedStyle(el)
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth
    )
      return el
  }
  return null
}

/**
 * Lets a mouse wheel scroll the sideways-scrolling row inside it. A wheel only
 * turns up and down, and a browser scrolls a row sideways only for a trackpad
 * or Shift, so without this a mouse can't reach the end of a row that
 * overflows. A row already at the end lets the page have the wheel.
 */
export default function HorizontalWheel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = ref.current
    if (!box) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return
      const row = sidewaysScroller(event.target as Element | null, box)
      if (!row) return
      const max = row.scrollWidth - row.clientWidth
      const next = Math.max(0, Math.min(max, row.scrollLeft + event.deltaY))
      if (next === row.scrollLeft) return
      event.preventDefault()
      row.scrollLeft = next
    }
    // A passive listener can't cancel the page's own scroll.
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  // No box of its own; the wheel of everything inside reaches it.
  return createElement('div', { ref, style: { display: 'contents' } }, children)
}
