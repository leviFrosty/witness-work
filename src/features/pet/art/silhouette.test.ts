import { describe, expect, it } from 'vitest'
import {
  createBuffer,
  fillRect,
  pixelAt,
  rgb,
  type PixelBuffer,
} from '@/lib/pixelArt'

import { silhouetteOf } from './silhouette'

const RED = rgb('#d04030')
const BLUE = rgb('#3050d0')
const WALL = rgb('#dcbc91')
const OTHER_WALL = rgb('#2f3a6e')
const TABLE = rgb('#8a5a34')

const room = (w: number, h: number, wall = WALL): PixelBuffer => {
  const buf = createBuffer(w, h)
  fillRect(buf, 0, 0, w, h, wall)
  return buf
}

const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]

function shape(out: PixelBuffer, ink: number): string[] {
  const rows: string[] = []
  for (let y = 0; y < out.height; y++) {
    let row = ''
    for (let x = 0; x < out.width; x++)
      row += pixelAt(out, x, y) === ink ? '#' : '.'
    rows.push(row)
  }
  return rows
}

describe('silhouetteOf', () => {
  it('shades an object’s own pixels, not the bare room the others cover', () => {
    const shown = room(7, 1)
    fillRect(shown, 1, 0, 4, 1, RED)
    const backdrop = room(7, 1, OTHER_WALL)
    fillRect(backdrop, 1, 0, 4, 1, RED)
    const others = [BLUE, TABLE, rgb('#40a040')].map((c) => {
      const buf = room(7, 1)
      fillRect(buf, 1, 0, 6, 1, c)
      return buf
    })
    const out = silhouetteOf(shown, [backdrop, ...others], 'object')
    expect(shape(out, pixelAt(out, 1, 0)!)).toEqual(['.###...'])

    for (const x of [0, 1, 4]) {
      const [r, , b] = channels(pixelAt(out, x, 0)!)
      expect(Math.abs(r - b)).toBeLessThan(24)
    }
  })

  it('keeps out what every option has, even lit by another lamp', () => {
    const shown = room(8, 1)
    fillRect(shown, 1, 0, 4, 1, RED)
    fillRect(shown, 5, 0, 8, 1, TABLE)
    const backdrop = room(8, 1, OTHER_WALL)
    fillRect(backdrop, 1, 0, 4, 1, RED)
    fillRect(backdrop, 5, 0, 8, 1, TABLE)
    const others = [BLUE, rgb('#40a040'), rgb('#f0e0a0')].map((c) => {
      const buf = room(8, 1)
      fillRect(buf, 0, 0, 1, 1, c)
      fillRect(buf, 5, 0, 8, 1, TABLE)
      for (let i = 0; i < buf.data.length; i += 4) {
        buf.data[i] = Math.round(buf.data[i] * 1.06 + 8)
        buf.data[i + 1] = Math.round(buf.data[i + 1] * 1.06 + 5)
        buf.data[i + 2] = Math.round(buf.data[i + 2] * 1.06)
      }
      return buf
    })
    const out = silhouetteOf(shown, [backdrop, ...others], 'object')
    expect(shape(out, pixelAt(out, 1, 0)!)).toEqual(['.###....'])
  })

  it('fills glass and flames, keeps gaps the room shows through', () => {
    const frame = (wall: number, middle: number) => {
      const buf = room(9, 5, wall)
      fillRect(buf, 1, 1, 8, 4, RED)
      fillRect(buf, 2, 2, 7, 3, middle)
      return buf
    }
    const ring = (
      shown: PixelBuffer,
      backdrop: PixelBuffer,
      others: PixelBuffer[] = [BLUE, TABLE, rgb('#40a040')].map((c) => {
        const buf = room(9, 5)
        fillRect(buf, 0, 0, 1, 1, c)
        return buf
      })
    ) => {
      const out = silhouetteOf(shown, [backdrop, ...others], 'object')
      return shape(out, pixelAt(out, 1, 1)!)
    }

    expect(ring(frame(WALL, WALL), frame(OTHER_WALL, OTHER_WALL))).toEqual([
      '.........',
      '.#######.',
      '.#.....#.',
      '.#######.',
      '.........',
    ])
    const solid = [
      '.........',
      '.#######.',
      '.#######.',
      '.#######.',
      '.........',
    ]

    const glass = frame(WALL, rgb('#a0d0e0'))
    expect(ring(glass, frame(OTHER_WALL, rgb('#5070a0')))).toEqual(solid)

    const flame = rgb('#ffd040')
    const others = [0, 1, 2].map((k) => {
      const buf = room(9, 5)
      if (!k) fillRect(buf, 2, 2, 7, 3, flame)
      return buf
    })
    expect(ring(frame(WALL, flame), frame(OTHER_WALL, flame), others)).toEqual(
      solid
    )
  })

  it('drops loose specks', () => {
    const shown = room(8, 3)
    fillRect(shown, 1, 0, 4, 3, RED)
    fillRect(shown, 6, 1, 7, 2, BLUE)
    const backdrop = room(8, 3, OTHER_WALL)
    fillRect(backdrop, 1, 0, 4, 3, RED)
    fillRect(backdrop, 6, 1, 7, 2, BLUE)
    const out = silhouetteOf(shown, [backdrop, room(8, 3)], 'object')
    expect(shape(out, pixelAt(out, 1, 1)!)).toEqual([
      '.###....',
      '.###....',
      '.###....',
    ])
  })

  it('shows a wall pattern as two shadow tones', () => {
    const shown = room(4, 2)
    fillRect(shown, 1, 0, 2, 2, rgb('#f0e0c0'))
    const plain = room(4, 2)
    const other = room(4, 2, OTHER_WALL)
    fillRect(other, 1, 0, 2, 2, rgb('#5060a0'))
    const out = silhouetteOf(shown, [plain, other], 'surface')
    const base = pixelAt(out, 0, 0)
    const stripe = pixelAt(out, 1, 0)
    expect(stripe).not.toBe(base)
    expect([0, 2, 3].map((x) => pixelAt(out, x, 1))).toEqual([base, base, base])
    expect(pixelAt(out, 1, 1)).toBe(stripe)
  })

  it('shows a floor’s lines as two tones, not its sunbeam', () => {
    const shown = room(12, 1, rgb('#a07040'))
    for (const x of [3, 7, 11]) fillRect(shown, x, 0, x + 1, 1, rgb('#503018'))
    for (let x = 6; x < 12; x++) {
      const i = x * 4
      shown.data[i] += 25
      shown.data[i + 1] += 23
      shown.data[i + 2] += 17
    }
    const others = [rgb('#808080'), rgb('#c0b090')].map((c) => room(12, 1, c))
    const out = silhouetteOf(shown, others, 'surface')
    const seam = pixelAt(out, 3, 0)
    const board = pixelAt(out, 1, 0)
    expect(seam).not.toBe(board)
    expect(pixelAt(out, 7, 0)).toBe(seam)
    expect(pixelAt(out, 9, 0)).toBe(board)
  })
})
