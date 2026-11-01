import { rgb, type FeaturePixel, type Rgb } from '@/lib/pixelArt'

import type { PetFace } from './types'

const EYE = rgb('#2a1c18')
const WHITE = rgb('#ffffff')
const BLUSH = rgb('#f6877f')
const TONGUE = rgb('#f07a86')

export interface FaceState {
  readonly face: PetFace
  readonly blink: boolean
}

export interface FaceLayout {
  readonly lx: number

  readonly rx: number

  readonly ey: number

  readonly blush?: boolean

  readonly mx?: number

  readonly my?: number

  readonly ec?: Rgb

  readonly pu?: Rgb

  readonly iris?: Rgb

  readonly mc?: Rgb
}

function eye(
  st: FaceState,
  ex: number,
  ey: number,
  side: -1 | 1,
  o: FaceLayout
): FeaturePixel[] {
  const f: FeaturePixel[] = []
  const E = o.ec ?? EYE
  const P = o.pu ?? EYE
  const I = o.iris ?? P
  const d = (x: number, y: number, c: Rgb) => f.push([ex + x, ey + y, c])
  const m = st.face
  if (m === 'nap' || m === 'dead') {
    d(-1, 1, E)
    d(0, 2, E)
    d(1, 2, E)
    d(2, 1, E)
  } else if (m === 'joy') {
    d(0, 1, E)
    d(1, 1, E)
    d(-1, 2, E)
    d(2, 2, E)
  } else if (st.blink) {
    d(0, 2, E)
    d(1, 2, E)
  } else if (m === 'low') {
    d(0, 1, WHITE)
    d(1, 1, P)
    d(0, 2, I)
    d(1, 2, P)
    if (side < 0) {
      d(0, -1, E)
      d(1, -2, E)
    } else {
      d(1, -1, E)
      d(0, -2, E)
    }
  } else if (m === 'wide') {
    d(0, -1, WHITE)
    d(1, -1, P)
    d(0, 0, I)
    d(1, 0, P)
    d(0, 1, I)
    d(1, 1, P)
    d(0, 2, I)
    d(1, 2, P)
  } else {
    d(0, 0, WHITE)
    d(1, 0, P)
    d(0, 1, I)
    d(1, 1, P)
    d(0, 2, I)
    d(1, 2, P)
  }
  return f
}

export function facePixels(st: FaceState, o: FaceLayout): FeaturePixel[] {
  const f = [...eye(st, o.lx, o.ey, -1, o), ...eye(st, o.rx, o.ey, 1, o)]
  const m = st.face
  if (o.blush && (m === 'joy' || m === 'happy')) {
    const by = o.ey + 3
    f.push(
      [o.lx - 2, by, BLUSH],
      [o.lx - 1, by, BLUSH],
      [o.rx + 2, by, BLUSH],
      [o.rx + 3, by, BLUSH]
    )
  }
  if (o.mx !== undefined && o.my !== undefined) {
    const x = o.mx
    const y = o.my
    const mc = o.mc ?? EYE
    if (m === 'joy' || m === 'wide') {
      f.push(
        [x, y, mc],
        [x + 1, y, mc],
        [x + 2, y, mc],
        [x + 3, y, mc],
        [x + 1, y + 1, TONGUE],
        [x + 2, y + 1, TONGUE]
      )
    } else if (m === 'low') {
      f.push([x, y + 1, mc], [x + 1, y, mc], [x + 2, y, mc], [x + 3, y + 1, mc])
    } else if (m === 'nap' || m === 'dead') {
      f.push([x + 1, y, mc], [x + 2, y, mc])
    } else {
      f.push([x, y, mc], [x + 1, y + 1, mc], [x + 2, y + 1, mc], [x + 3, y, mc])
    }
  }
  return f
}
