import { describe, expect, it } from 'vitest'

import {
  dim,
  greyOf,
  mix,
  packRgb,
  rgb,
  rgbPalette,
  rgbTuple,
  shadeOf,
  toHex,
} from './color'

describe('color', () => {
  it('parses and formats hex', () => {
    expect(rgb('#c9652a')).toBe(0xc9652a)
    expect(toHex(0x0a0b0c)).toBe('#0a0b0c')
    expect(rgbTuple(rgb('#102030'))).toEqual([16, 32, 48])
    expect(() => rgb('red')).toThrow()
  })

  it('packs with rounding and clamping', () => {
    expect(packRgb(-4, 255.6, 127.5)).toBe(0x00ff80)
  })

  it('mixes, dims and shades like the design board (values from its hex math)', () => {
    expect(toHex(mix(rgb('#000000'), rgb('#ffffff'), 0.5))).toBe('#808080')
    expect(toHex(mix(rgb('#3a2620'), rgb('#ffffff'), 0.4))).toBe('#897d79')
    expect(toHex(dim(rgb('#dcbc91'), 0.93))).toBe('#cdaf87')

    expect(toHex(shadeOf(rgb('#f5bd5c'), 0.42))).toBe('#674933')
    expect(toHex(greyOf(rgb('#f2a55c')))).toBe('#b0aeb6')
    expect(greyOf(rgb('#f2a55c'), 0)).toBe(rgb('#f2a55c'))
  })

  it('parses palettes once', () => {
    expect(rgbPalette({ a: '#010203', b: '#ffffff' })).toEqual({
      a: 0x010203,
      b: 0xffffff,
    })
  })
})
