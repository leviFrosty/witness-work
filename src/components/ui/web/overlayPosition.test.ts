import { describe, expect, it } from 'vitest'
import { placeOverlay } from '@/components/ui/web/overlayPosition'

const viewport = { width: 1000, height: 800 }
const size = { width: 200, height: 100 }

describe('placeOverlay', () => {
  it('opens below the anchor, lined up with its start edge', () => {
    const placed = placeOverlay({
      anchor: { x: 100, y: 50, width: 40, height: 40 },
      size,
      viewport,
    })
    expect(placed).toMatchObject({ left: 100, top: 96, side: 'bottom' })
  })

  it('flips above when there is no room below', () => {
    const placed = placeOverlay({
      anchor: { x: 100, y: 740, width: 40, height: 40 },
      size,
      viewport,
    })
    expect(placed.side).toBe('top')
    expect(placed.top).toBe(740 - 6 - 100)
  })

  it('stays below when neither side fits and below has more room', () => {
    const placed = placeOverlay({
      anchor: { x: 100, y: 100, width: 40, height: 40 },
      size: { width: 200, height: 2000 },
      viewport,
    })
    expect(placed.side).toBe('bottom')
    expect(placed.maxHeight).toBe(800 - 140 - 6 - 8)
  })

  it('keeps the overlay inside the viewport margin', () => {
    const placed = placeOverlay({
      anchor: { x: 960, y: 50, width: 30, height: 30 },
      size,
      viewport,
    })
    expect(placed.left).toBe(1000 - 200 - 8)
    expect(
      placeOverlay({
        anchor: { x: -20, y: 50, width: 30, height: 30 },
        size,
        viewport,
      }).left
    ).toBe(8)
  })

  it('aligns the end edge, and swaps the edges in right to left', () => {
    const anchor = { x: 500, y: 50, width: 40, height: 40 }
    expect(
      placeOverlay({ anchor, size, viewport, placement: { align: 'end' } }).left
    ).toBe(340)
    expect(
      placeOverlay({
        anchor,
        size,
        viewport,
        placement: { align: 'start', rtl: true },
      }).left
    ).toBe(340)
  })

  it('centers a tooltip on the side of its anchor', () => {
    const placed = placeOverlay({
      anchor: { x: 100, y: 300, width: 40, height: 40 },
      size: { width: 80, height: 30 },
      viewport,
      placement: { side: 'right', align: 'center', gap: 8 },
    })
    expect(placed).toMatchObject({ left: 148, top: 305, side: 'right' })
  })
})
