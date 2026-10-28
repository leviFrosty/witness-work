import { describe, expect, it } from 'vitest'
import { COIN_ICON_PX, coinIcon } from '@/features/pet/art/gameUi'
import type { PixelBuffer } from '@/lib/pixelArt'

/** How many pixels wide each row of `b` is drawn. */
const rowWidths = (b: PixelBuffer): number[] =>
  Array.from({ length: b.height }, (_, y) => {
    let width = 0
    for (let x = 0; x < b.width; x++)
      if (b.data[(y * b.width + x) * 4 + 3] > 0) width++
    return width
  })

describe('the coin', () => {
  it.each(['small', 'large'] as const)(
    'draws the %s coin round: as tall as it is wide, widest in the middle',
    (size) => {
      const icon = coinIcon(size)
      const px = COIN_ICON_PX[size]
      expect([icon.width, icon.height]).toEqual([px, px])
      const widths = rowWidths(icon)
      expect(widths.filter((w) => w > 0)).toHaveLength(px)
      expect(Math.max(...widths)).toBe(px)
      expect(widths).toEqual([...widths].reverse())
      expect(widths[0]).toBeLessThan(px / 2)
    }
  )
})
