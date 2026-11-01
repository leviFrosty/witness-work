import {
  blit,
  createBuffer,
  fillBuffer,
  rgb,
  type PixelBuffer,
} from '@/lib/pixelArt'

export function contactSheet(
  cells: readonly PixelBuffer[],
  cols: number,
  gap = 4
): PixelBuffer {
  const cw = Math.max(...cells.map((c) => c.width))
  const ch = Math.max(...cells.map((c) => c.height))
  const rows = Math.ceil(cells.length / cols)
  const sheet = createBuffer(cols * (cw + gap) + gap, rows * (ch + gap) + gap)
  fillBuffer(sheet, rgb('#e8e8e8'))
  cells.forEach((cell, i) => {
    const x = gap + (i % cols) * (cw + gap)
    const y = gap + Math.floor(i / cols) * (ch + gap)
    blit(sheet, cell, x, y)
  })
  return sheet
}
