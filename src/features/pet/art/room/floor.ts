/** Floor (y 62–99): wood planks, flagstones, brick or clay tile. */
import {
  createRng,
  dim,
  fillRect,
  mix,
  plot,
  rgb,
  type PixelBuffer,
} from '@/lib/pixelArt'
import { FLOOR_IDS, type FloorId } from '@/types/pet'

export { FLOOR_IDS }
export type { FloorId }

/** Top row of the floor. */
export const FLOOR_TOP = 62

const WHITE = rgb('#ffffff')
const C = {
  wood: rgb('#b07a4c'),
  woodSeam: rgb('#8f5f39'),
  woodJoint: rgb('#9a6740'),
  grout: rgb('#6c675f'),
  stones: [rgb('#a29c91'), rgb('#968f84'), rgb('#aca69a')],
  mortar: rgb('#8b6a58'),
  brickA: rgb('#b4583e'),
  brickB: rgb('#a54f37'),
  brickTop: rgb('#c56a4e'),
  tileGrout: rgb('#9a6a4a'),
  tileA: rgb('#c8754a'),
  tileB: rgb('#ead6b4'),
}

const FLOORS: Readonly<Record<FloorId, (buf: PixelBuffer) => void>> = {
  wood(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, C.wood)
    for (let y = FLOOR_TOP; y < buf.height; y += 7) {
      fillRect(buf, 0, y, W, y + 1, C.woodSeam)
      const off = (((y - FLOOR_TOP) / 7) % 2) * 18
      for (let x = off; x < W; x += 36)
        fillRect(buf, x, y + 1, x + 1, y + 7, C.woodJoint)
    }
  },
  stone(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, C.grout)
    const r = createRng(3)
    for (let y = FLOOR_TOP; y < buf.height; y += 9) {
      let x = -Math.floor(r() * 10)
      while (x < W) {
        const w = 11 + Math.floor(r() * 11)
        const c = C.stones[Math.floor(r() * 3)]
        fillRect(buf, x + 1, y + 1, x + w, y + 9, c)
        fillRect(buf, x + 1, y + 1, x + w, y + 2, mix(c, WHITE, 0.18))
        plot(buf, x + 2 + r() * (w - 4), y + 3 + r() * 4, dim(c, 0.9))
        x += w
      }
    }
  },
  brick(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, C.mortar)
    for (let y = FLOOR_TOP; y < buf.height; y += 5) {
      const off = (((y - FLOOR_TOP) / 5) % 2) * 6
      for (let x = -off; x < W; x += 12) {
        const c = (x + y) % 3 ? C.brickA : C.brickB
        fillRect(buf, x + 1, y + 1, x + 12, y + 5, c)
        fillRect(buf, x + 1, y + 1, x + 12, y + 2, C.brickTop)
      }
    }
  },
  tile(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, C.tileGrout)
    for (let y = FLOOR_TOP; y < buf.height; y += 8) {
      for (let x = 0; x < W; x += 10) {
        const c = (x / 10 + (y - FLOOR_TOP) / 8) % 2 ? C.tileA : C.tileB
        fillRect(buf, x + 1, y + 1, x + 10, y + 8, c)
        fillRect(buf, x + 1, y + 1, x + 10, y + 2, mix(c, WHITE, 0.15))
      }
    }
  },
}

/** Paints the floor. */
export function drawFloor(buf: PixelBuffer, floor: FloorId): void {
  FLOORS[floor](buf)
}
