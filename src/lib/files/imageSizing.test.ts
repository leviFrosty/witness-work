import { describe, expect, it } from 'vitest'
import {
  clampRect,
  exceedsPixelLimit,
  fitWithin,
  MAX_IMAGE_PIXELS,
} from '@/lib/files/imageSizing'

describe('fitWithin', () => {
  it('scales the longer side down to the limit, keeping the ratio', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 })
  })

  it('never scales up', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('keeps a very thin image at least a pixel wide', () => {
    expect(fitWithin(100_000, 10, 1000)).toEqual({ width: 1000, height: 1 })
  })
})

describe('clampRect', () => {
  const source = { width: 1000, height: 800 }

  it('leaves a rect inside the image alone', () => {
    const rect = { originX: 100, originY: 50, width: 400, height: 400 }
    expect(clampRect(rect, source)).toEqual(rect)
  })

  it('pulls a rect that hangs over the edge back inside', () => {
    expect(
      clampRect(
        { originX: -50, originY: 700, width: 2000, height: 500 },
        source
      )
    ).toEqual({ originX: 0, originY: 700, width: 1000, height: 100 })
  })

  it('keeps at least one pixel when the origin is outside', () => {
    expect(
      clampRect({ originX: 5000, originY: 5000, width: 10, height: 10 }, source)
    ).toEqual({ originX: 999, originY: 799, width: 1, height: 1 })
  })

  it('rounds fractional crops', () => {
    expect(
      clampRect(
        { originX: 10.6, originY: 0.4, width: 99.5, height: 50.2 },
        source
      )
    ).toEqual({ originX: 11, originY: 0, width: 100, height: 50 })
  })
})

describe('pixel limit', () => {
  it('refuses a photo with more pixels than a tab can open', () => {
    expect(exceedsPixelLimit(4000, 3000)).toBe(false)
    expect(exceedsPixelLimit(20_000, 20_000)).toBe(true)
    expect(exceedsPixelLimit(MAX_IMAGE_PIXELS, 1)).toBe(false)
  })
})
