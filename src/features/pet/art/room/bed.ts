/**
 * The pet's bed, centred under the pet at x 68. The back layer is part of the
 * room base (drawn before the pet); the front layer (basket rim, loose straw)
 * is drawn over the pet so it sits _in_ the bed.
 */
import {
  createBuffer,
  createRng,
  fillEllipse,
  fillRect,
  plot,
  rgb,
  type PixelBuffer,
} from '@/lib/pixelArt'
import { BED_IDS, type BedId } from '@/types/pet'

import { SCENE_H, SCENE_W } from '../layout'

export { BED_IDS }
export type { BedId }

const C = {
  rugEdge: rgb('#8e3b37'),
  rugRed: rgb('#b8504a'),
  rugOrange: rgb('#d9824f'),
  cushionShadow: rgb('#3f6b8a'),
  cushion: rgb('#5a8ab0'),
  cushionLight: rgb('#7aa6c8'),
  cushionBase: rgb('#2f5470'),
  basketRim: rgb('#7a5230'),
  basketInside: rgb('#5a3a22'),
  basketCloth: rgb('#d9c39a'),
  weaveA: rgb('#a8743f'),
  weaveB: rgb('#8e5f31'),
  weaveTop: rgb('#c08a50'),
  hayDark: rgb('#c9a24a'),
  hay: rgb('#e0bf62'),
  strawDark: rgb('#a8822e'),
  strawLight: rgb('#f2d98a'),
}

const BACK: Readonly<Record<BedId, (buf: PixelBuffer) => void>> = {
  rug(buf) {
    fillEllipse(buf, 68, 85, 37, 8.5, C.rugEdge)
    fillEllipse(buf, 68, 85, 35, 7.5, C.rugRed)
    fillEllipse(buf, 68, 85, 29, 5.6, C.rugOrange)
    fillEllipse(buf, 68, 85, 22, 4, C.rugRed)
  },
  cushion(buf) {
    fillRect(buf, 42, 79, 95, 93, C.cushionShadow)
    fillRect(buf, 43, 78, 94, 92, C.cushion)
    fillRect(buf, 43, 78, 94, 80, C.cushionLight)
    for (const x of [50, 68, 86]) {
      plot(buf, x, 85, C.cushionShadow)
      plot(buf, x + 1, 85, C.cushionShadow)
    }
    fillRect(buf, 42, 92, 95, 94, C.cushionBase)
  },
  basket(buf) {
    fillEllipse(buf, 68, 84, 27, 7, C.basketRim)
    fillEllipse(buf, 68, 84, 25, 6, C.basketInside)
    fillEllipse(buf, 68, 85, 20, 4.5, C.basketCloth)
  },
  hay(buf) {
    fillEllipse(buf, 68, 86, 32, 6.5, C.hayDark)
    fillEllipse(buf, 68, 85, 28, 5, C.hay)
    const r = createRng(5)
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2
      const rr = r()
      const x = 68 + Math.cos(a) * rr * 30
      const y = 86 + Math.sin(a) * rr * 6
      plot(buf, x, y, C.strawDark)
      plot(buf, x + 1, y, C.strawLight)
    }
  },
}

const STRAWS: readonly (readonly [number, number])[] = [
  [46, 88],
  [52, 90],
  [60, 91],
  [76, 91],
  [84, 90],
  [90, 88],
]

const FRONT: Readonly<Partial<Record<BedId, (buf: PixelBuffer) => void>>> = {
  basket(buf) {
    for (let y = 84; y <= 92; y++) {
      for (let x = 40; x <= 96; x++) {
        const a = (x + 0.5 - 68) / 27
        const b = (y + 0.5 - 84) / 8
        if (a * a + b * b <= 1 && y >= 86) {
          const weave = (x + (y >> 1)) % 4 < 2 ? C.weaveA : C.weaveB
          plot(buf, x, y, y === 86 ? C.weaveTop : weave)
        }
      }
    }
  },
  hay(buf) {
    for (const [x, y] of STRAWS) {
      plot(buf, x, y, C.strawLight)
      plot(buf, x + 1, y - 1, C.hay)
      plot(buf, x + 2, y - 2, C.hayDark)
    }
  },
}

/** Paints the part of the bed behind the pet. */
export function drawBedBack(buf: PixelBuffer, bed: BedId): void {
  BACK[bed](buf)
}

const frontLayers = new Map<BedId, PixelBuffer | null>()

/**
 * The part of the bed in front of the pet, as a transparent scene-sized sprite
 * to blit over it (null when the bed has none). Cached; the scene also uses it
 * to tell the pet's pixels from the bed's.
 */
export function bedFrontLayer(bed: BedId): PixelBuffer | null {
  let layer = frontLayers.get(bed)
  if (layer === undefined) {
    const draw = FRONT[bed]
    layer = draw ? createBuffer(SCENE_W, SCENE_H) : null
    if (draw && layer) draw(layer)
    frontLayers.set(bed, layer)
  }
  return layer
}
