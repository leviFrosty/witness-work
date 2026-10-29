import { describe, expect, it } from 'vitest'
import {
  COIN_ICON_PX,
  coinIcon,
  cssColor,
  gamePalette,
  OWNED_STAMP_PX,
  ownedStamp,
} from '@/features/pet/art/gameUi'
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

describe('the owned stamp', () => {
  it.each([false, true])(
    'is a round seal in the accent with the check in its ink (dark: %s)',
    (dark) => {
      const palette = gamePalette(dark)
      const stamp = ownedStamp(palette)
      expect([stamp.width, stamp.height]).toEqual([
        OWNED_STAMP_PX,
        OWNED_STAMP_PX,
      ])
      const widths = rowWidths(stamp)
      expect(Math.max(...widths)).toBe(OWNED_STAMP_PX)
      expect(widths).toEqual([...widths].reverse())
      const at = (x: number, y: number) => {
        const i = (y * stamp.width + x) * 4
        return [...stamp.data.slice(i, i + 3)]
      }
      const rgb = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      // The middle of the check's long arm, and the seal's face beside it.
      expect(at(11, 12)).toEqual(rgb(palette.onAccent))
      expect(at(16, 12)).toEqual(rgb(cssColor(palette.accent)))
    }
  )
})
