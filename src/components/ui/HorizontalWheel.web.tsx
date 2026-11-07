import { type ReactNode, createElement, useEffect, useRef } from 'react'

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

    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  return createElement('div', { ref, style: { display: 'contents' } }, children)
}
