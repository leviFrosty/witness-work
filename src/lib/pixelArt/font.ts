import type { PixelBuffer } from './buffer'
import type { Rgb } from './color'
import { fillRect } from './draw'

export type Glyph = readonly string[]

export const GLYPHS: Readonly<Record<string, Glyph>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['0', '0', '0', '0', '1'],
  ':': ['0', '1', '0', '1', '0'],
  '/': ['001', '001', '010', '100', '100'],
  '-': ['000', '000', '111', '000', '000'],
  '+': ['000', '010', '111', '010', '000'],

  '٠': ['000', '010', '101', '010', '000'],
  '١': ['010', '010', '010', '010', '010'],
  '٢': ['101', '111', '100', '100', '100'],
  '٣': ['10101', '11111', '10000', '10000', '10000'],
  '٤': ['011', '100', '011', '100', '011'],
  '٥': ['010', '101', '101', '101', '010'],
  '٦': ['111', '001', '001', '001', '001'],
  '٧': ['101', '101', '101', '101', '010'],
  '٨': ['010', '101', '101', '101', '101'],
  '٩': ['111', '101', '111', '001', '001'],
  '٫': ['00', '00', '00', '01', '10'],
}

export const GLYPH_HEIGHT = 5

export function hasGlyph(ch: string): boolean {
  return GLYPHS[ch] !== undefined
}

export function textWidth(text: string, scale = 1): number {
  let w = 0
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (g) w += (g[0].length + 1) * scale
  }
  return Math.max(0, w - scale)
}

export function drawText(
  buf: PixelBuffer,
  text: string,
  x: number,
  y: number,
  color: Rgb,
  scale = 1
): number {
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) continue
    for (let j = 0; j < g.length; j++) {
      const row = g[j]
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '1') continue
        fillRect(
          buf,
          cx + i * scale,
          y + j * scale,
          cx + i * scale + scale,
          y + j * scale + scale,
          color
        )
      }
    }
    cx += (g[0].length + 1) * scale
  }
  return cx
}
