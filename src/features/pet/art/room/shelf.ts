/**
 * The shelf in the centre of the back wall (board x 70–113, y 32–34, brackets
 * below) and what stands on it.
 */
import {
  dim,
  fillEllipse,
  fillRect,
  mix,
  plot,
  rgb,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import { SHELF_IDS, type ShelfId } from '@/types/pet'

export { SHELF_IDS }
export type { ShelfId }

/** Shelf art is authored at x 128–172 and shifted left by this much. */
const SHIFT_X = -58

const WHITE = rgb('#ffffff')

/** Drawing helpers in authored (unshifted) coordinates. */
function shifted(buf: PixelBuffer) {
  return {
    rect: (x0: number, y0: number, x1: number, y1: number, c: Rgb) =>
      fillRect(buf, x0 + SHIFT_X, y0, x1 + SHIFT_X, y1, c),
    ell: (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      c: Rgb,
      top = false
    ) => fillEllipse(buf, cx + SHIFT_X, cy, rx, ry, c, top),
    dot: (x: number, y: number, c: Rgb) => plot(buf, x + SHIFT_X, y, c),
  }
}

type Draw = ReturnType<typeof shifted>

const ITEMS: Readonly<Record<ShelfId, (d: Draw) => void>> = {
  scrolls({ rect }) {
    rect(134, 25, 150, 31, rgb('#efe0bd'))
    rect(136, 27, 148, 28, rgb('#cdbb95'))
    rect(132, 24, 134, 32, rgb('#9b6a3f'))
    rect(150, 24, 152, 32, rgb('#9b6a3f'))
    rect(158, 24, 166, 32, rgb('#5f8fb0'))
    rect(159, 22, 165, 24, rgb('#4a7393'))
  },
  books({ rect }) {
    const spines: readonly (readonly [number, number, string])[] = [
      [132, 9, '#8e3b37'],
      [135, 8, '#3f6b8a'],
      [138, 9, '#c9a24a'],
      [141, 7, '#4f7a4a'],
      [144, 9, '#6b4a8a'],
      [147, 8, '#8e3b37'],
    ]
    for (const [x, h, color] of spines) {
      const c = rgb(color)
      rect(x, 32 - h, x + 3, 32, c)
      rect(x, 32 - h, x + 1, 32, mix(c, WHITE, 0.2))
      rect(x, 30 - h + 4, x + 3, 30 - h + 5, dim(c, 0.75))
    }
    rect(155, 29, 167, 32, rgb('#3f6b8a'))
    rect(155, 26, 167, 29, rgb('#c9a24a'))
    rect(155, 26, 167, 27, rgb('#e0bf6a'))
  },
  pottery({ rect, ell, dot }) {
    ell(141, 26.5, 5.5, 5.5, rgb('#c0703f'))
    ell(141, 25, 5, 4, rgb('#d18350'))
    rect(139, 19, 143, 22, rgb('#b0602f'))
    rect(138, 19, 144, 20, rgb('#9c5228'))
    dot(135, 24, rgb('#9c5228'))
    dot(135, 25, rgb('#9c5228'))
    dot(147, 24, rgb('#9c5228'))
    dot(147, 25, rgb('#9c5228'))
    rect(137, 27, 145, 28, rgb('#9c5228'))
    ell(158, 28.5, 3.6, 3.6, rgb('#a85e33'))
    rect(157, 23, 159, 25, rgb('#8e4f2a'))
    ell(165, 29.5, 2.6, 2.6, rgb('#5f8fb0'))
  },
  fruit({ rect, ell, dot }) {
    ell(150, 31, 9, 4, rgb('#d9c39a'), true)
    rect(141, 30, 159, 32, rgb('#c4ab7e'))
    const apples: readonly (readonly [number, number])[] = [
      [145, 27.5],
      [155, 27.5],
      [150, 26],
    ]
    const red: readonly Rgb[] = [rgb('#b8333a'), rgb('#b8333a'), rgb('#c94048')]
    apples.forEach(([x, y], i) => {
      const c = red[i]
      ell(x, y, 2.8, 2.8, c)
      dot(x - 1, y - 1, mix(c, WHITE, 0.35))
      dot(x, y - 3, rgb('#6e2a20'))
    })
    ell(136, 30, 2, 2, rgb('#6a3a6a'))
    ell(164, 30, 2, 2, rgb('#6a3a6a'))
  },
}

/** Paints the shelf board, brackets and `shelf`'s items. */
export function drawShelf(buf: PixelBuffer, shelf: ShelfId): void {
  const d = shifted(buf)
  d.rect(128, 32, 172, 34, rgb('#8a5a3a'))
  d.rect(128, 34, 172, 35, rgb('#6e4529'))
  d.rect(131, 35, 133, 38, rgb('#6e4529'))
  d.rect(167, 35, 169, 38, rgb('#6e4529'))
  ITEMS[shelf](d)
}
