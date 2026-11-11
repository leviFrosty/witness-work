import {
  createRng,
  dim,
  fillEllipse,
  fillRect,
  mix,
  plot,
  readRgb,
  rgb,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import { FLOOR_IDS, type FloorId } from '@/types/pet'

export { FLOOR_IDS }
export type { FloorId }

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

const S = {
  zelGrout: rgb('#e4d8bd'),
  zelTeal: rgb('#17656a'),
  zelGreen: rgb('#2a7a58'),
  zelOchre: rgb('#c9932c'),
  zelClay: rgb('#b4512f'),
  azuGrout: rgb('#9fb0d4'),
  azuWhite: rgb('#f1eee4'),
  azuBlue: rgb('#2a4f9f'),
  azuSky: rgb('#7f9fd6'),
  terBase: rgb('#e7dcc6'),
  terSeam: rgb('#cdbfa4'),
  terChips: [rgb('#c0643f'), rgb('#5f7c9c'), rgb('#d1a042'), rgb('#4b4642')],
  hbWoods: [rgb('#bb8452'), rgb('#a66d41'), rgb('#c79461')],
  hbSeam: rgb('#7a4f2e'),
  tatStraw: rgb('#b8b46c'),
  tatStrawB: rgb('#aaa860'),
  tatCloth: rgb('#3a3a2c'),
  tatClothHi: rgb('#57573f'),
  pebGap: rgb('#3f3a35'),
  pebbles: [rgb('#9b958c'), rgb('#8e7b67'), rgb('#7f8b98'), rgb('#aaa397')],
  hexGrout: rgb('#a89c86'),
  hexCream: rgb('#ede4d0'),
  hexSage: rgb('#8aa47c'),
  hexClay: rgb('#c4774f'),
  harLine: rgb('#5b3426'),
  harTiles: [rgb('#b2433c'), rgb('#d39b3b'), rgb('#efe1c2')],
  chocGroove: rgb('#3a2015'),
  choc: rgb('#6c3b22'),
  chocHi: rgb('#8c5333'),
  chocShine: rgb('#a76a45'),
  chocLo: rgb('#4f2a18'),
  pondWater: rgb('#3b8a85'),
  pondDeep: rgb('#2e7471'),
  pondRipple: rgb('#8cc9bd'),
  padGreen: rgb('#5d9d3d'),
  padDark: rgb('#3f7a2b'),
  padLight: rgb('#86bd57'),
  lilyPetal: rgb('#f7f5ec'),
  lilyShade: rgb('#cfd6c8'),
  lilyHeart: rgb('#f2c94c'),
}

const L = {
  lawn: rgb('#7dab4f'),
  lawnDark: rgb('#6b9a44'),
  lawnLight: rgb('#8fbb5a'),
  blade: rgb('#568a36'),
  tip: rgb('#a9d26d'),
  daisy: rgb('#f7f5ec'),
  daisyShade: rgb('#d5dcc2'),
  pink: rgb('#f0a9bf'),
  pinkShade: rgb('#cf7f9a'),
  heart: rgb('#f2c94c'),
  bell: rgb('#7f9fe0'),
  bellLight: rgb('#b4c8f2'),
}

export const LAWN_FLOWERS: readonly (readonly [number, number, 0 | 1 | 2])[] = [
  [9, 69, 0],
  [27, 91, 1],
  [16, 82, 2],
  [38, 66, 1],
  [52, 96, 0],
  [61, 68, 2],
  [5, 96, 0],
  [33, 78, 0],
  [106, 66, 0],
  [112, 96, 1],
  [100, 80, 2],
  [134, 97, 0],
  [156, 94, 2],
  [158, 66, 1],
  [176, 80, 0],
  [86, 97, 2],
  [72, 65, 0],
  [142, 68, 0],
]

const B = {
  sand: rgb('#ead4a2'),
  sandDark: rgb('#d9bf88'),
  sandLight: rgb('#f5e6bf'),
  grit: rgb('#c4a878'),
  wet: rgb('#cdb07c'),
  shell: rgb('#f0a79a'),
  shellShade: rgb('#c9766e'),
  shellRib: rgb('#dd8a80'),
  shellLight: rgb('#fbd9d0'),
  whelk: rgb('#f6efe0'),
  whelkLight: rgb('#ffffff'),
  whelkDark: rgb('#a8875c'),
  star: rgb('#e8843c'),
  starLight: rgb('#f6aa66'),
  starDark: rgb('#c0622a'),
  pebble: rgb('#a39c92'),
  pebbleBlue: rgb('#8795a5'),
}

const SHORE_SCALLOPS: readonly (readonly [number, number])[] = [
  [14, 70],
  [58, 67],
  [108, 71],
  [34, 86],
  [164, 84],
]
const SHORE_WHELKS: readonly (readonly [number, number])[] = [
  [28, 66],
  [6, 82],
  [98, 66],
  [150, 68],
  [112, 86],
]
const SHORE_STARS: readonly (readonly [number, number])[] = [
  [22, 78],
  [132, 67],
  [8, 92],
]
const SHORE_PEBBLES: readonly (readonly [number, number, boolean])[] = [
  [42, 70, true],
  [4, 66, false],
  [68, 64, true],
  [18, 88, false],
  [120, 96, true],
  [156, 92, false],
  [172, 70, true],
  [30, 94, true],
]

const K = {
  water: rgb('#5bb6b0'),
  deep: rgb('#4aa5a4'),
  bedStone: rgb('#48999d'),
  bedSand: rgb('#7cc7b6'),
  glint: rgb('#b4ead9'),
  bank: rgb('#56503f'),
  moss: rgb('#6f9a45'),
  stones: [rgb('#a7a196'), rgb('#948d82'), rgb('#b5aea1'), rgb('#8c8f94')],
}

const F = {
  soil: rgb('#6a5236'),
  soilDark: rgb('#58432c'),
  soilLight: rgb('#7c6242'),
  moss: rgb('#5f8c3e'),
  mossLight: rgb('#7fae4c'),
  mossDark: rgb('#476d30'),
  mossBright: rgb('#9cc65c'),
  twig: rgb('#3f2d1c'),
  twigLight: rgb('#6b4f33'),
  leaves: [rgb('#e8a23a'), rgb('#cf5f2e'), rgb('#f0c44a'), rgb('#b9743a')],
  fern: rgb('#2a6a3f'),
  fernLight: rgb('#9fe070'),
  fernDark: rgb('#1f4a2c'),
  stem: rgb('#efe2c6'),
  stemShade: rgb('#cdbb98'),
  cap: rgb('#c58f58'),
  capLight: rgb('#e6bd88'),
  capDark: rgb('#96663a'),
}

const FOREST_MOSS: readonly (readonly [number, number, number, number])[] = [
  [14, 67, 15, 4],
  [52, 71, 17, 5],
  [98, 66, 16, 3.6],
  [140, 70, 19, 5],
  [174, 78, 11, 5],
  [8, 84, 12, 5],
  [40, 92, 20, 5],
  [84, 86, 14, 4],
  [120, 91, 18, 5.4],
  [160, 95, 15, 4],
  [70, 98, 12, 3],
  [118, 77, 8, 2.4],
  [24, 76, 7, 2.2],
]

const FERN_FROND: readonly (readonly [number, number, boolean])[] = [
  [0, 0, false],
  [0, -1, false],
  [0, -2, false],
  [0, -3, false],
  [0, -4, true],
  [1, -1, false],
  [2, -2, false],
  [3, -3, true],
  [-1, -1, false],
  [-2, -2, false],
  [-3, -3, true],
  [2, 0, false],
  [3, 0, false],
  [4, -1, true],
  [-2, 0, false],
  [-3, 0, false],
  [-4, -1, true],
]

const FOREST_FERNS: readonly (readonly [number, number, boolean])[] = [
  [8, 70, false],
  [36, 94, true],
  [62, 67, false],
  [18, 86, true],
  [104, 68, false],
  [112, 95, true],
  [140, 96, false],
  [156, 68, true],
  [174, 92, false],
  [86, 97, false],
]

const FOREST_MUSHROOMS: readonly (readonly [number, number, boolean])[] = [
  [26, 74, true],
  [31, 77, false],
  [4, 92, false],
  [48, 64, false],
  [100, 88, true],
  [105, 91, false],
  [96, 91, false],
  [150, 93, true],
  [168, 66, false],
  [70, 96, false],
]

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function backGlow(buf: PixelBuffer, c: Rgb, t: number): void {
  const rows = buf.height - FLOOR_TOP
  for (let y = FLOOR_TOP; y < buf.height; y++) {
    const f = t * (1 - (y - FLOOR_TOP) / rows)
    if (f <= 0.005) continue
    for (let x = 0; x < buf.width; x++) {
      plot(buf, x, y, mix(readRgb(buf, x, y), c, f))
    }
  }
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
  grass(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, L.lawn)
    const r = createRng(88)
    for (let n = 0; n < 34; n++) {
      const cx = r() * W
      const cy = FLOOR_TOP + r() * 38
      const rx = 5 + r() * 9
      const tone = r() < 0.55 ? L.lawnDark : L.lawnLight
      for (let y = Math.floor(cy - 2); y <= cy + 2; y++) {
        if (y < FLOOR_TOP) continue
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x + 0.5 - cx) / rx
          const b = (y + 0.5 - cy) / 2.4
          if (a * a + b * b <= 1 && (x + y * 3) % 5 !== 0) plot(buf, x, y, tone)
        }
      }
    }
    for (let n = 0; n < 90; n++) {
      const x = Math.floor(r() * W)
      const y = FLOOR_TOP + 1 + Math.floor(r() * 37)
      const tone = r() < 0.5 ? L.blade : L.tip
      plot(buf, x, y, tone)
      if (r() < 0.6) plot(buf, x, y - 1, tone)
    }
    for (const [x, y, kind] of LAWN_FLOWERS) {
      if (kind === 2) {
        plot(buf, x, y, L.bell)
        plot(buf, x + 1, y, L.bellLight)
        plot(buf, x, y + 1, L.blade)
        continue
      }
      const petal = kind === 0 ? L.daisy : L.pink
      plot(buf, x, y - 1, petal)
      plot(buf, x - 1, y, petal)
      plot(buf, x + 1, y, petal)
      plot(buf, x, y + 1, kind === 0 ? L.daisyShade : L.pinkShade)
      plot(buf, x, y, L.heart)
    }
    backGlow(buf, L.tip, 0.14)
  },
  shore(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, B.sand)
    const r = createRng(17)
    for (let n = 0; n < 330; n++) {
      const x = Math.floor(r() * W)
      const y = FLOOR_TOP + Math.floor(r() * 38)
      const tone = r()
      plot(
        buf,
        x,
        y,
        tone < 0.45 ? B.sandDark : tone < 0.8 ? B.sandLight : B.grit
      )
    }
    for (let n = 0; n < 16; n++) {
      const x = Math.floor(r() * (W - 12))
      const y = FLOOR_TOP + 2 + Math.floor(r() * 26)
      const w = 5 + Math.floor(r() * 7)
      for (let i = 0; i < w; i++)
        plot(buf, x + i, y + (i > 1 && i < w - 2 ? 0 : 1), B.sandDark)
      for (let i = 2; i < w - 2; i++) plot(buf, x + i, y + 1, B.sandLight)
    }
    for (let y = 95; y < buf.height; y++) {
      for (let x = 0; x < W; x++) {
        if (y > 95 || (x + (x >> 2)) % 3 !== 0) plot(buf, x, y, B.wet)
      }
    }
    for (const [x, y] of SHORE_SCALLOPS) {
      fillRect(buf, x - 2, y - 1, x + 3, y + 1, B.shell)
      fillRect(buf, x - 1, y - 2, x + 2, y - 1, B.shell)
      plot(buf, x - 1, y + 1, B.shellShade)
      plot(buf, x, y + 1, B.shellShade)
      plot(buf, x + 1, y + 1, B.shellShade)
      plot(buf, x - 1, y - 1, B.shellRib)
      plot(buf, x + 1, y - 1, B.shellRib)
      plot(buf, x - 2, y, B.shellRib)
      plot(buf, x, y, B.shellRib)
      plot(buf, x + 2, y, B.shellRib)
      plot(buf, x, y - 2, B.shellLight)
    }
    for (const [x, y] of SHORE_WHELKS) {
      fillRect(buf, x, y, x + 3, y + 2, B.whelk)
      plot(buf, x + 3, y + 1, B.whelk)
      plot(buf, x + 4, y + 1, B.whelkDark)
      plot(buf, x + 1, y, B.whelkLight)
      plot(buf, x, y + 1, B.whelkDark)
      plot(buf, x + 2, y + 1, B.whelkDark)
    }
    for (const [x, y] of SHORE_STARS) {
      plot(buf, x, y - 2, B.star)
      fillRect(buf, x - 2, y - 1, x + 3, y, B.star)
      fillRect(buf, x - 1, y, x + 2, y + 1, B.star)
      plot(buf, x - 2, y + 1, B.star)
      plot(buf, x - 1, y + 1, B.starDark)
      plot(buf, x + 1, y + 1, B.starDark)
      plot(buf, x + 2, y + 1, B.star)
      plot(buf, x, y - 1, B.starLight)
      plot(buf, x, y, B.starDark)
    }
    for (const [x, y, tone] of SHORE_PEBBLES) {
      const c = tone ? B.pebble : B.pebbleBlue
      fillRect(buf, x, y, x + 2, y + 1, c)
      plot(buf, x, y, mix(c, WHITE, 0.3))
      plot(buf, x + 2, y, dim(c, 0.8))
    }
    backGlow(buf, B.sandLight, 0.3)
  },
  koi(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, K.water)
    const r = createRng(207)
    for (let n = 0; n < 30; n++) {
      const cx = r() * W
      const cy = FLOOR_TOP + 5 + r() * 33
      const rx = 4 + r() * 8
      const ry = 1.4 + r() * 1.6
      fillEllipse(buf, cx, cy, rx, ry, K.deep)
    }
    for (let n = 0; n < 26; n++) {
      const cx = Math.floor(r() * W)
      const cy = FLOOR_TOP + 6 + Math.floor(r() * 32)
      const w = 2 + Math.floor(r() * 3)
      const tone = r() < 0.5 ? K.bedStone : K.bedSand
      fillRect(buf, cx, cy, cx + w, cy + 1, tone)
      if (w > 2) fillRect(buf, cx + 1, cy + 1, cx + w - 1, cy + 2, tone)
    }
    for (let n = 0; n < 18; n++) {
      const x = Math.floor(r() * (W - 6))
      const y = FLOOR_TOP + 6 + Math.floor(r() * 32)
      fillRect(buf, x, y, x + 2 + Math.floor(r() * 3), y + 1, K.glint)
    }
    backGlow(buf, K.glint, 0.22)
    fillRect(buf, 0, FLOOR_TOP, W, FLOOR_TOP + 4, K.bank)
    let x = -Math.floor(r() * 4)
    while (x < W) {
      const w = 6 + Math.floor(r() * 7)
      const h = 3 + Math.floor(r() * 3)
      const c = K.stones[Math.floor(r() * K.stones.length)]
      fillRect(buf, x + 1, FLOOR_TOP, x + w, FLOOR_TOP + h, c)
      fillRect(buf, x + 2, FLOOR_TOP + h, x + w - 1, FLOOR_TOP + h + 1, c)
      fillRect(buf, x + 1, FLOOR_TOP, x + w, FLOOR_TOP + 1, mix(c, WHITE, 0.28))
      plot(buf, x + w - 1, FLOOR_TOP + h - 1, dim(c, 0.8))
      fillRect(
        buf,
        x + 2,
        FLOOR_TOP + h + 1,
        x + w - 1,
        FLOOR_TOP + h + 2,
        K.deep
      )
      if (r() < 0.3) {
        plot(buf, x + 3, FLOOR_TOP + 1, K.moss)
        plot(buf, x + 4, FLOOR_TOP + 1, K.moss)
        plot(buf, x + 4, FLOOR_TOP + 2, K.moss)
      }
      x += w
    }
  },
  forest(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, F.soil)
    const r = createRng(311)
    for (let n = 0; n < 150; n++) {
      const x = Math.floor(r() * W)
      const y = FLOOR_TOP + Math.floor(r() * 38)
      const tone = r() < 0.5 ? F.soilDark : F.soilLight
      plot(buf, x, y, tone)
      plot(buf, x + 1, y, tone)
    }
    for (const [cx, cy, rx, ry] of FOREST_MOSS) {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
        if (y < FLOOR_TOP) continue
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          const a = (x + 0.5 - cx) / rx
          const b = (y + 0.5 - cy) / ry
          const bump = 0.12 * Math.sin(x * 0.9 + cy) + 0.1 * Math.sin(x * 0.37)
          const e = a * a + b * b + bump
          if (e > 1) continue
          const under = b > 0.35 && e > 0.62
          const top = b < -0.25 && e < 0.8
          const fleck = (x * 5 + y * 3) % 11 === 0
          plot(
            buf,
            x,
            y,
            under
              ? F.mossDark
              : top
                ? fleck
                  ? F.mossBright
                  : F.mossLight
                : fleck
                  ? F.mossLight
                  : F.moss
          )
        }
      }
    }
    for (let n = 0; n < 7; n++) {
      const x = Math.floor(r() * (W - 12))
      const y = FLOOR_TOP + 4 + Math.floor(r() * 32)
      const w = 5 + Math.floor(r() * 6)
      const rise = r() < 0.5 ? 1 : -1
      for (let i = 0; i < w; i++)
        plot(buf, x + i, y + (i > w / 2 ? rise : 0), F.twig)
      plot(buf, x + 2, y - 1, F.twig)
      plot(buf, x + 1, y, F.twigLight)
    }
    for (let n = 0; n < 34; n++) {
      const x = Math.floor(r() * (W - 5))
      const y = FLOOR_TOP + 2 + Math.floor(r() * 35)
      const c = F.leaves[Math.floor(r() * F.leaves.length)]
      const lean = r() < 0.5 ? 1 : -1
      fillRect(buf, x, y, x + 3, y + 1, c)
      plot(buf, x + 1, y - 1, mix(c, WHITE, 0.22))
      plot(buf, x + 1 + lean, y - 1, c)
      plot(buf, x + 1, y + 1, dim(c, 0.72))
      plot(buf, x + 1 - lean * 2, y + 1, dim(c, 0.72))
    }
    for (const [x, y, flip] of FOREST_FERNS) {
      const side = flip ? -1 : 1
      for (const [dx, dy, tip] of FERN_FROND) {
        plot(buf, x + dx * side, y + dy, tip ? F.fernLight : F.fern)
      }
      plot(buf, x, y + 1, F.fernDark)
    }
    for (const [x, y, size] of FOREST_MUSHROOMS) {
      if (size) {
        fillRect(buf, x, y + 2, x + 2, y + 5, F.stem)
        plot(buf, x + 1, y + 4, F.stemShade)
        fillRect(buf, x - 2, y, x + 4, y + 2, F.cap)
        fillRect(buf, x - 1, y - 1, x + 3, y, F.cap)
        fillRect(buf, x - 2, y + 1, x + 4, y + 2, F.capDark)
        plot(buf, x, y - 1, F.capLight)
        plot(buf, x - 1, y, F.capLight)
      } else {
        fillRect(buf, x, y + 1, x + 1, y + 3, F.stem)
        fillRect(buf, x - 1, y, x + 2, y + 1, F.cap)
        plot(buf, x, y - 1, F.capLight)
        plot(buf, x + 1, y, F.capDark)
      }
    }
    backGlow(buf, F.mossLight, 0.12)
  },
  zellige(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, S.zelGrout)
    const r = createRng(41)
    for (let j = 0; FLOOR_TOP + j * 6 < buf.height; j++) {
      const y = FLOOR_TOP + j * 6 + 1
      for (let i = 0; i * 6 < W; i++) {
        const x = i * 6 + 1
        const accent = mod(i + 2 * j, 9) === 0
        let c: Rgb
        if (accent) c = mod(i + j, 2) ? S.zelOchre : S.zelClay
        else c = r() < 0.5 ? S.zelTeal : S.zelGreen
        c = mix(c, r() < 0.5 ? WHITE : dim(c, 0.6), r() * 0.14)
        fillRect(buf, x, y, x + 5, y + 5, c)

        const cut = r()
        if (cut < 0.25) plot(buf, x + (r() < 0.5 ? 0 : 4), y + 4, S.zelGrout)
        else if (cut < 0.4)
          fillRect(buf, x + 4, y + 1, x + 5, y + 4, S.zelGrout)
        else if (cut < 0.5)
          fillRect(buf, x + 1, y + 4, x + 4, y + 5, dim(c, 0.85))

        fillRect(buf, x, y, x + 4, y + 1, mix(c, WHITE, 0.22))
        plot(buf, x + 1, y + 1, mix(c, WHITE, 0.6))
      }
    }
  },
  azulejo(buf) {
    const W = buf.width
    const P = 12
    const y0 = FLOOR_TOP - 3
    for (let y = FLOOR_TOP; y < buf.height; y++) {
      for (let x = 0; x < W; x++) {
        const lx = mod(x - 3, P)
        const ly = mod(y - y0, P)
        const u = Math.min(lx, P - lx)
        const v = Math.min(ly, P - ly)
        let c = S.azuWhite

        if (u + v <= 3) c = S.azuBlue
        else if (lx === 0 || ly === 0) c = S.azuGrout
        else {
          const d = Math.abs(lx - 6) + Math.abs(ly - 6)
          if (u + v === 5) c = S.azuSky
          if (d === 0) c = S.azuSky
          else if (d === 2) c = S.azuBlue
          if (ly === 1 && c === S.azuWhite) c = mix(c, WHITE, 0.6)
        }
        plot(buf, x, y, c)
      }
    }
  },
  terrazzo(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, S.terBase)
    for (let y = FLOOR_TOP + 18; y < buf.height; y += 19)
      fillRect(buf, 0, y, W, y + 1, S.terSeam)
    for (let x = 59; x < W; x += 60)
      fillRect(buf, x, FLOOR_TOP, x + 1, buf.height, S.terSeam)
    const r = createRng(77)
    for (let n = 0; n < 340; n++) {
      const x = Math.floor(r() * W)
      const y = FLOOR_TOP + Math.floor(r() * (buf.height - FLOOR_TOP))
      const k = r()
      const c = S.terChips[k < 0.34 ? 0 : k < 0.6 ? 1 : k < 0.85 ? 2 : 3]
      plot(buf, x, y, c)
      const s = r()
      if (s < 0.25) plot(buf, x + 1, y, c)
      else if (s < 0.35) {
        plot(buf, x + 1, y, c)
        plot(buf, x, y + 1, dim(c, 0.85))
        plot(buf, x + 1, y + 1, dim(c, 0.85))
      }
    }

    backGlow(buf, WHITE, 0.2)
  },
  herringbone(buf) {
    const W = buf.width
    const u = 4
    const r = createRng(19)
    const tones = new Map<string, Rgb>()
    for (let y = FLOOR_TOP; y < buf.height; y++) {
      for (let x = 0; x < W; x++) {
        const n = Math.floor(x / u)
        const rel = y - FLOOR_TOP - (n - 1) * u
        const k = Math.floor(rel / (4 * u))
        const m = mod(rel, 4 * u)
        const band = Math.floor(m / u)
        const horizontal = band < 2
        const pn = band === 0 ? n - 1 : n
        const lx = x - pn * u
        const ly = horizontal ? m - band * u : m - 2 * u
        const key = `${horizontal ? 'h' : 'v'}${pn},${k}`
        let tone = tones.get(key)
        if (tone === undefined) {
          tone = S.hbWoods[Math.floor(r() * 3)]
          tones.set(key, tone)
        }
        let c = horizontal ? tone : dim(tone, 0.9)
        if (lx === 0 || ly === 0) c = S.hbSeam
        else if (ly === 1 && horizontal) c = mix(tone, WHITE, 0.16)
        else if (lx === 1 && !horizontal) c = mix(c, WHITE, 0.1)
        plot(buf, x, y, c)
      }
    }
  },
  tatami(buf) {
    const mat = (x: number, y: number, w: number, h: number): void => {
      const lying = w > h
      const straw = lying ? S.tatStraw : S.tatStrawB
      fillRect(buf, x, y, x + w, y + h, straw)

      if (lying) {
        for (let wx = x + 2; wx < x + w - 1; wx += 2)
          fillRect(buf, wx, y + 2, wx + 1, y + h - 2, dim(straw, 0.94))
        fillRect(buf, x, y, x + w, y + 2, S.tatCloth)
        fillRect(buf, x, y, x + w, y + 1, S.tatClothHi)
        fillRect(buf, x, y + h - 1, x + w, y + h, S.tatCloth)
        fillRect(buf, x + 1, y + 2, x + w - 1, y + 3, mix(straw, WHITE, 0.14))
        fillRect(buf, x, y + 2, x + 1, y + h - 1, dim(straw, 0.75))
      } else {
        for (let wy = y + 2; wy < y + h - 1; wy += 2)
          fillRect(buf, x + 2, wy, x + w - 2, wy + 1, dim(straw, 0.94))
        fillRect(buf, x, y, x + 2, y + h, S.tatCloth)
        fillRect(buf, x + 1, y, x + 2, y + h, S.tatClothHi)
        fillRect(buf, x + w - 1, y, x + w, y + h, S.tatCloth)
        fillRect(buf, x + 2, y, x + w - 1, y + 1, dim(straw, 0.75))
        fillRect(buf, x + 2, y + 1, x + w - 1, y + 2, mix(straw, WHITE, 0.14))
      }
    }
    for (let j = 0; FLOOR_TOP - 6 + j * 24 < buf.height; j++) {
      const y = FLOOR_TOP - 6 + j * 24
      for (let b = -1; b * 36 < buf.width; b++) {
        const x = b * 36 + (j % 2) * 18
        const left = mod(b, 2) === 0
        const vx = left ? x : x + 24
        const hx = left ? x + 12 : x
        mat(vx, y, 12, 24)
        mat(hx, y, 24, 12)
        mat(hx, y + 12, 24, 12)
      }
    }
  },
  pebbles(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, S.pebGap)
    const r = createRng(58)
    for (let j = 0; FLOOR_TOP + j * 5 < buf.height + 3; j++) {
      const cy = FLOOR_TOP + 2 + j * 5
      let x = -((j % 2) * 4) - Math.floor(r() * 3)
      while (x < W + 4) {
        const rx = 3 + r() * 1.6
        const ry = 2.3 + r() * 0.5
        const cx = x + rx + 0.5
        const c = S.pebbles[Math.floor(r() * S.pebbles.length)]
        fillEllipse(buf, cx, cy + 0.5, rx, ry, dim(c, 0.72))
        fillEllipse(buf, cx - 0.3, cy, rx - 0.4, ry - 0.4, c)
        plot(buf, cx - rx * 0.4, cy - ry * 0.45, mix(c, WHITE, 0.45))
        plot(buf, cx - rx * 0.4 + 1, cy - ry * 0.45, mix(c, WHITE, 0.25))
        x += rx * 2 + 1
      }
    }
  },
  hex(buf) {
    const W = buf.width
    const px = 6
    const py = 5
    const r = createRng(23)
    const tint = new Map<string, Rgb>()
    const tileColor = (i: number, j: number): Rgb => {
      const key = `${i},${j}`
      let c = tint.get(key)
      if (c !== undefined) return c
      const centre = (a: number, b: number): boolean =>
        mod(a + 3 * b, 7) === 0 && mod((a + 3 * b) / 7 + b, 3) === 0
      if (centre(i, j)) c = S.hexClay
      else if (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, -1],
          [-1, 1],
        ].some(([di, dj]) => centre(i + di, j + dj))
      )
        c = S.hexSage
      else c = r() < 0.06 ? S.hexSage : S.hexCream
      tint.set(key, c)
      return c
    }
    for (let y = FLOOR_TOP; y < buf.height; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x + 0.5
        const fy = y + 0.5 - FLOOR_TOP
        const j0 = Math.round(fy / py)
        let d1 = Infinity
        let d2 = Infinity
        let best: [number, number, number, number] = [0, 0, 0, 0]
        for (let j = j0 - 1; j <= j0 + 1; j++) {
          const i0 = Math.round((fx - (j * px) / 2) / px)
          for (let i = i0 - 1; i <= i0 + 1; i++) {
            const cx = i * px + (j * px) / 2 + 0.5
            const cy = j * py + 0.5
            const d = Math.hypot(fx - cx, (fy - cy) * 1.1)
            if (d < d1) {
              d2 = d1
              d1 = d
              best = [i, j, fx - cx, fy - cy]
            } else if (d < d2) d2 = d
          }
        }
        const [i, j, dx, dy] = best
        let c = S.hexGrout
        if (d2 - d1 > 0.6) {
          c = tileColor(i, j)
          if (dy < -1.2 && dx < 1.5) c = mix(c, WHITE, 0.22)
        }
        plot(buf, x, y, c)
      }
    }
  },
  harlequin(buf) {
    const W = buf.width
    const L = 20
    for (let y = FLOOR_TOP; y < buf.height; y++) {
      for (let x = 0; x < W; x++) {
        const s = x + 2 * (y - FLOOR_TOP) + 10
        const t = x - 2 * (y - FLOOR_TOP) + 10
        const sm = mod(s, L)
        const tm = mod(t, L)
        let c: Rgb
        if (sm < 2 || tm < 2) c = S.harLine
        else {
          const i = Math.floor(s / L)
          const j = Math.floor(t / L)
          c = S.harTiles[mod(i + 2 * j, 3)]

          if (sm < 4 || tm >= L - 2) c = mix(c, WHITE, 0.18)
        }
        plot(buf, x, y, c)
      }
    }
  },
  chocolate(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, S.chocGroove)
    const SW = 20
    const SH = 12
    for (let y = FLOOR_TOP; y < buf.height; y += SH) {
      for (let x = -6; x < W; x += SW) {
        const x0 = x + 1
        const y0 = y + 1
        const x1 = x + SW - 1
        const y1 = y + SH - 1
        fillRect(buf, x0, y0, x1, y1, S.chocLo)
        fillRect(buf, x0, y0, x1 - 1, y1 - 1, S.chocHi)
        fillRect(buf, x0 + 2, y0 + 2, x1 - 2, y1 - 2, S.choc)
        fillRect(buf, x0, y0, x1 - 1, y0 + 1, S.chocShine)
        fillRect(buf, x0, y0, x0 + 1, y1 - 1, S.chocShine)
        fillRect(buf, x0 + 2, y1 - 2, x1 - 2, y1 - 1, S.chocLo)
        fillRect(buf, x1 - 2, y0 + 2, x1 - 1, y1 - 1, S.chocLo)
        plot(buf, x0 + 3, y0 + 3, S.chocHi)
        plot(buf, x0 + 4, y0 + 3, S.chocHi)
      }
    }
  },
  lilypond(buf) {
    const W = buf.width
    fillRect(buf, 0, FLOOR_TOP, W, buf.height, S.pondWater)
    const r = createRng(64)
    for (let n = 0; n < 26; n++) {
      const x = Math.floor(r() * W)
      const y = FLOOR_TOP + 2 + Math.floor(r() * 34)
      fillRect(buf, x, y, x + 6 + Math.floor(r() * 10), y + 1, S.pondDeep)
    }
    const ripples: readonly (readonly [number, number])[] = [
      [6, 66],
      [44, 64],
      [100, 68],
      [154, 92],
      [16, 96],
      [124, 97],
      [76, 98],
    ]
    for (const [x, y] of ripples) {
      fillRect(buf, x, y, x + 4, y + 1, S.pondRipple)
      plot(buf, x - 1, y + 1, S.pondRipple)
      plot(buf, x + 4, y + 1, S.pondRipple)
    }

    const pads: readonly (readonly [
      number,
      number,
      number,
      number,
      boolean,
    ])[] = [
      [12, 72, 8, 0.6, true],
      [6, 90, 6, 2.4, false],
      [30, 65, 6, 1.4, false],
      [22, 97, 5, 4.9, false],
      [62, 66, 4, 5.2, false],
      [110, 66, 6, 3.6, false],
      [150, 67, 8, 4.4, true],
      [130, 96, 7, 0.9, true],
      [114, 84, 4, 2.6, false],
      [168, 92, 7, 2, false],
    ]
    for (const [cx, cy, rad, notch, blossom] of pads) {
      const ry = rad * 0.55
      fillEllipse(buf, cx + 0.5, cy + 1, rad, ry, S.padDark)
      fillEllipse(buf, cx, cy, rad, ry, S.padGreen)
      fillEllipse(
        buf,
        cx - rad * 0.3,
        cy - ry * 0.3,
        rad * 0.5,
        ry * 0.4,
        S.padLight
      )

      for (let k = 0; k <= rad * 1.2; k++) {
        const a = notch + (k / (rad * 1.2) - 0.5) * 0.7
        for (let d = 1; d <= rad; d++)
          plot(
            buf,
            cx + Math.cos(a) * d,
            cy + Math.sin(a) * d * 0.55,
            S.pondWater
          )
      }
      if (blossom) {
        const bx = cx + 1
        const by = cy - 2

        fillRect(buf, bx - 2, by, bx + 3, by + 1, S.lilyPetal)
        plot(buf, bx - 2, by, S.lilyShade)
        plot(buf, bx + 2, by, S.lilyShade)
        plot(buf, bx - 1, by - 1, S.lilyPetal)
        plot(buf, bx + 1, by - 1, S.lilyPetal)
        plot(buf, bx, by - 2, S.lilyPetal)
        plot(buf, bx, by - 1, S.lilyHeart)
      }
    }
    backGlow(buf, S.pondRipple, 0.28)
  },
}

export function drawFloor(buf: PixelBuffer, floor: FloorId): void {
  FLOORS[floor](buf)
}
