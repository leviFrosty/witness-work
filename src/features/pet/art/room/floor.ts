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
