import { describe, expect, it } from 'vitest'
import {
  applyZoom,
  type Rect,
  zoomTransform,
} from '@/features/plans/lib/scheduleZoom'

const frame: Rect = { x: 0, y: 100, width: 400, height: 700 }
const month: Rect = { x: 8, y: 180, width: 384, height: 300 }
const tile: Rect = { x: 140, y: 420, width: 96, height: 80 }

const corner = (rect: Rect) => ({ x: rect.x, y: rect.y })
const center = (rect: Rect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
})

describe('zoomTransform', () => {
  it('is the identity at the start', () => {
    expect(zoomTransform(frame, month, tile, 0)).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
    })
  })

  it('lands the source rect on the target at the end', () => {
    const t = zoomTransform(frame, month, tile, 1)
    expect(t.scale).toBeCloseTo(tile.width / month.width)
    const landed = applyZoom(frame, t, corner(month))
    expect(landed.x).toBeCloseTo(tile.x)
    expect(landed.y).toBeCloseTo(
      tile.y + tile.height / 2 - (month.height * t.scale) / 2
    )
  })

  it('moves the source center in a straight line', () => {
    const t = zoomTransform(frame, month, tile, 0.5)
    const mid = applyZoom(frame, t, center(month))
    expect(mid.x).toBeCloseTo((center(month).x + center(tile).x) / 2)
    expect(mid.y).toBeCloseTo((center(month).y + center(tile).y) / 2)
  })

  it('keeps two layers zooming through the same rects in register', () => {
    // The Year layer runs the same pair backwards; at any step, the tile's
    // position in the Year layer matches the month's in the Month layer.
    const yearFrame: Rect = { x: 0, y: 0, width: 400, height: 800 }
    for (const p of [0.2, 0.5, 0.8]) {
      const monthT = zoomTransform(frame, month, tile, p)
      const yearT = zoomTransform(yearFrame, tile, month, 1 - p)
      const monthCenter = applyZoom(frame, monthT, center(month))
      const tileCenter = applyZoom(yearFrame, yearT, center(tile))
      expect(tileCenter.x).toBeCloseTo(monthCenter.x)
      expect(tileCenter.y).toBeCloseTo(monthCenter.y)
      expect(yearT.scale * tile.width).toBeCloseTo(monthT.scale * month.width)
    }
  })

  it('falls back to the identity without measured rects', () => {
    const empty: Rect = { x: 0, y: 0, width: 0, height: 0 }
    expect(zoomTransform(frame, empty, tile, 1).scale).toBe(1)
  })
})
