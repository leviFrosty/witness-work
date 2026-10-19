import { describe, expect, it } from 'vitest'

import { createBuffer, pixelAt } from './buffer'
import { drawText, GLYPHS, GLYPH_HEIGHT, hasGlyph, textWidth } from './font'

const LATIN = '0123456789'
const ARABIC = '٠١٢٣٤٥٦٧٨٩'

function inkCount(text: string): number {
  const buf = createBuffer(80, 8)
  drawText(buf, text, 0, 0, 0xffffff)
  let n = 0
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 80; x++) if (pixelAt(buf, x, y) !== null) n++
  return n
}

describe('pixel font', () => {
  it('has every Latin and Eastern Arabic digit and the number punctuation', () => {
    for (const ch of [...LATIN, ...ARABIC, '.', '٫', ':', '/', '-', '+']) {
      expect(hasGlyph(ch)).toBe(true)
      expect(GLYPHS[ch]).toHaveLength(GLYPH_HEIGHT)
      expect(inkCount(ch)).toBeGreaterThan(0)
    }
  })

  it('gives every digit a distinct shape within its system', () => {
    for (const set of [LATIN, ARABIC]) {
      const shapes = new Set([...set].map((d) => GLYPHS[d].join('/')))
      expect(shapes.size).toBe(10)
    }
  })

  it('keeps glyph rows rectangular', () => {
    for (const glyph of Object.values(GLYPHS)) {
      expect(new Set(glyph.map((row) => row.length)).size).toBe(1)
    }
  })

  it('measures text with one-pixel gaps and skips unknown characters', () => {
    expect(textWidth('1')).toBe(3)
    expect(textWidth('14.5')).toBe(3 + 1 + 3 + 1 + 1 + 1 + 3)
    expect(textWidth('١٤٫٥')).toBe(3 + 1 + 3 + 1 + 2 + 1 + 3)
    expect(textWidth('٣')).toBe(5)
    expect(textWidth('a1b')).toBe(3)
    expect(textWidth('')).toBe(0)
    expect(textWidth('12', 2)).toBe(14)
  })

  it('draws at the requested scale and returns the next x', () => {
    const buf = createBuffer(20, 12)
    const next = drawText(buf, '7', 1, 1, 0xff0000, 2)
    expect(next).toBe(1 + 8)
    expect(pixelAt(buf, 1, 1)).toBe(0xff0000)
    expect(pixelAt(buf, 6, 2)).toBe(0xff0000)
    expect(pixelAt(buf, 0, 0)).toBeNull()
  })
})
