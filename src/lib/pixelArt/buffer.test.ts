import { describe, expect, it } from 'vitest'

import {
  blit,
  cloneBuffer,
  createBuffer,
  crop,
  flipH,
  hashBuffer,
  isOpaque,
  lieDown,
  pixelAt,
  scaleNearest,
} from './buffer'
import { readRgb, setPixel } from './draw'

describe('buffer', () => {
  it('creates transparent buffers and clones independently', () => {
    const a = createBuffer(3, 2)
    expect(a.data.length).toBe(24)
    expect(pixelAt(a, 0, 0)).toBeNull()
    const b = cloneBuffer(a)
    setPixel(b, 1, 1, 0x123456)
    expect(pixelAt(b, 1, 1)).toBe(0x123456)
    expect(pixelAt(a, 1, 1)).toBeNull()
  })

  it('blits opaque pixels only, clipped, with an optional colour map', () => {
    const dst = createBuffer(4, 4)
    setPixel(dst, 0, 0, 0xaaaaaa)
    const src = createBuffer(2, 2)
    setPixel(src, 1, 1, 0x00ff00)
    blit(dst, src, -1, -1)
    expect(pixelAt(dst, 0, 0)).toBe(0x00ff00)
    blit(dst, src, 3, 3)
    expect(hashBuffer(dst)).toBe(hashBuffer(dst))
    blit(dst, src, 1, 1, (c) => c & 0xff00ff)
    expect(pixelAt(dst, 2, 2)).toBe(0x000000)
    blit(dst, src, 2, 0, () => null)
    expect(pixelAt(dst, 3, 1)).toBeNull()
  })

  it('rounds fractional coordinates in the pixel accessors', () => {
    const b = createBuffer(4, 4)
    setPixel(b, 1.4, 2.6, 0xabcdef)
    expect(pixelAt(b, 1, 3)).toBe(0xabcdef)
    expect(pixelAt(b, 0.6, 2.5)).toBe(0xabcdef)
    expect(readRgb(b, 1.2, 3.3)).toBe(0xabcdef)
    expect(isOpaque(b, 1.4, 2.6)).toBe(true)
    setPixel(b, 3.6, 0, 0x111111)
    expect(pixelAt(b, 3, 0)).toBeNull()
  })

  it('flips left to right', () => {
    const src = createBuffer(3, 1)
    setPixel(src, 0, 0, 0xff0000)
    const out = flipH(src)
    expect(pixelAt(out, 2, 0)).toBe(0xff0000)
    expect(pixelAt(out, 0, 0)).toBeNull()
  })

  it('lies a sprite down: shorter, wider, feet line kept', () => {
    const src = createBuffer(32, 32)
    for (let y = 4; y < 31; y++)
      for (let x = 12; x < 20; x++) setPixel(src, x, y, 0xffffff)
    const out = lieDown(src)
    const rows = new Set<number>()
    const cols = new Set<number>()
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (pixelAt(out, x, y) !== null) {
          rows.add(y)
          cols.add(x)
        }
      }
    }
    expect(Math.max(...rows)).toBe(30)
    expect(rows.size).toBeLessThan(27 * 0.7)
    expect(cols.size).toBeGreaterThan(8)
  })

  it('crops and scales', () => {
    const src = createBuffer(10, 10)
    setPixel(src, 5, 5, 0x0000ff)
    const view = crop(src, [4, 4, 3, 3])
    expect(view.width).toBe(3)
    expect(pixelAt(view, 1, 1)).toBe(0x0000ff)
    const outside = crop(src, [8, 8, 4, 4])
    expect(pixelAt(outside, 3, 3)).toBeNull()
    const big = scaleNearest(view, 2)
    expect(big.width).toBe(6)
    expect(pixelAt(big, 3, 2)).toBe(0x0000ff)
  })
})
