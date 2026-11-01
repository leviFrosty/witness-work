import { describe, expect, it } from 'vitest'

import { pixelAt } from './buffer'
import { shadeOf } from './color'
import { rasterize, type Shape } from './raster'

const RED = 0xff0000
const BLUE = 0x0000ff
const GREEN = 0x00ff00

describe('rasterize', () => {
  it('fills an ellipse by pixel centres and outlines it from outside', () => {
    const out = rasterize(
      { shapes: [{ t: 'e', x: 8, y: 8, rx: 4, ry: 3, c: RED }] },
      16,
      16
    )
    expect(pixelAt(out, 8, 8)).toBe(RED)
    expect(pixelAt(out, 4, 8)).toBe(RED)

    expect(pixelAt(out, 3, 8)).toBe(shadeOf(RED, 0.42))
    expect(pixelAt(out, 2, 8)).toBeNull()
    expect(pixelAt(out, 0, 0)).toBeNull()
  })

  it('shades the lower right and highlights the upper left', () => {
    const out = rasterize(
      {
        shapes: [
          { t: 'e', x: 8, y: 8, rx: 6, ry: 6, c: RED, s: BLUE, h: GREEN },
        ],
      },
      16,
      16
    )
    expect(pixelAt(out, 11, 12)).toBe(BLUE)
    expect(pixelAt(out, 5, 4)).toBe(GREEN)
    expect(pixelAt(out, 8, 8)).toBe(RED)
  })

  it('rotates ellipses', () => {
    const upright = rasterize(
      { shapes: [{ t: 'e', x: 8, y: 8, rx: 1, ry: 6, c: RED }] },
      16,
      16
    )
    const tilted = rasterize(
      { shapes: [{ t: 'e', x: 8, y: 8, rx: 1, ry: 6, a: 90, c: RED }] },
      16,
      16
    )
    expect(pixelAt(upright, 8, 3)).toBe(RED)
    expect(pixelAt(upright, 3, 8)).not.toBe(RED)
    expect(pixelAt(tilted, 3, 8)).toBe(RED)
  })

  it('fills polygons', () => {
    const tri: Shape = {
      t: 'p',
      pts: [
        [2, 2],
        [14, 2],
        [2, 14],
      ],
      c: GREEN,
    }
    const out = rasterize({ shapes: [tri] }, 16, 16)
    expect(pixelAt(out, 3, 3)).toBe(GREEN)
    expect(pixelAt(out, 12, 12)).toBeNull()
  })

  it('draws inner edges only between edge shapes of different groups', () => {
    const body: Shape = { t: 'e', x: 8, y: 10, rx: 6, ry: 4, c: RED }
    const head: Shape = {
      t: 'e',
      x: 8,
      y: 5,
      rx: 4,
      ry: 4,
      c: BLUE,
      edge: true,
    }
    const out = rasterize({ shapes: [body, head] }, 16, 16)

    expect(pixelAt(out, 8, 8)).toBe(shadeOf(BLUE, 0.66))
    const grouped = rasterize(
      {
        shapes: [
          { ...body, g: 'x' },
          { ...head, g: 'x' },
        ],
      },
      16,
      16
    )
    expect(pixelAt(grouped, 8, 8)).toBe(BLUE)
  })

  it('skips outlines next to `no` shapes', () => {
    const out = rasterize(
      { shapes: [{ t: 'e', x: 8, y: 8, rx: 3, ry: 3, c: RED, no: true }] },
      16,
      16
    )
    expect(pixelAt(out, 4, 8)).toBeNull()
  })

  it('clips paint layers to shapes of the listed kinds', () => {
    const out = rasterize(
      {
        shapes: [
          { t: 'e', x: 4, y: 8, rx: 3, ry: 3, c: RED, k: 'head' },
          { t: 'e', x: 12, y: 8, rx: 3, ry: 3, c: RED, k: 'body' },
        ],
        paints: [{ t: 'e', x: 8, y: 8, rx: 8, ry: 8, c: GREEN, on: ['head'] }],
      },
      16,
      16
    )
    expect(pixelAt(out, 4, 8)).toBe(GREEN)
    expect(pixelAt(out, 12, 8)).toBe(RED)
  })

  it('draws nothing for a zero-radius ellipse', () => {
    for (const [rx, ry] of [
      [0, 2],
      [2, 0],
      [0, 0],
    ]) {
      const out = rasterize(
        { shapes: [{ t: 'e', x: 8.5, y: 8.5, rx, ry, c: RED }] },
        16,
        16
      )
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) expect(pixelAt(out, x, y)).toBeNull()
    }
  })

  it('draws feature pixels last, rounded and clipped', () => {
    const out = rasterize(
      {
        shapes: [{ t: 'e', x: 8, y: 8, rx: 4, ry: 4, c: RED }],
        feats: [
          [7.6, 8.2, BLUE],
          [40, 40, BLUE],
        ],
      },
      16,
      16
    )
    expect(pixelAt(out, 8, 8)).toBe(BLUE)
  })
})
