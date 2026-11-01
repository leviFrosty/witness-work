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

const SHIFT_X = -58

const WHITE = rgb('#ffffff')

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

function line(
  d: Draw,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb,
  w = 1
): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = y0 + ((y1 - y0) * i) / n
    if (w <= 1) d.dot(x, y, c)
    else d.ell(x, y, w / 2, w / 2, c)
  }
}

function ellBand(
  d: Draw,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  y0: number,
  y1: number,
  c: Rgb
): void {
  for (let y = Math.max(y0, Math.floor(cy - ry)); y < y1; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const a = (x + 0.5 - cx) / rx
      const b = (y + 0.5 - cy) / ry
      if (a * a + b * b <= 1) d.dot(x, y, c)
    }
  }
}

function dalaHorse(
  { rect }: Draw,
  x: number,
  size: 'big' | 'small',
  facing: 1 | -1,
  body: Rgb,
  saddle: Rgb,
  paint: Rgb
): void {
  const big = size === 'big'
  const w = big ? 17 : 13
  const fx = (a: number, b: number) =>
    facing === 1 ? ([x + a, x + b] as const) : ([x + w - b, x + w - a] as const)
  const r = (a: number, y0: number, b: number, y1: number, c: Rgb) => {
    const [l, rr] = fx(a, b)
    rect(l, y0, rr, y1, c)
  }
  const p = (a: number, y: number, c: Rgb) => r(a, y, a + 1, y + 1, c)
  const eye = dim(body, 0.45)
  if (big) {
    r(1, 28, 5, 32, body)
    r(9, 28, 13, 32, body)
    r(1, 23, 14, 28, body)
    r(0, 23, 1, 26, body)
    r(9, 19, 14, 23, body)
    p(14, 22, body)
    r(11, 17, 15, 18, body)
    r(10, 18, 17, 21, body)
    p(11, 16, body)
    r(3, 23, 9, 27, saddle)
    r(3, 27, 9, 28, paint)
    p(4, 25, paint)
    p(6, 24, paint)
    p(8, 25, paint)
    r(9, 19, 10, 23, paint)
    p(13, 19, eye)
    r(11, 20, 13, 21, paint)
    p(3, 29, paint)
    p(11, 29, paint)
  } else {
    r(1, 29, 4, 32, body)
    r(7, 29, 10, 32, body)
    r(1, 25, 11, 29, body)
    r(0, 25, 1, 27, body)
    r(7, 24, 11, 25, body)
    r(8, 21, 11, 22, body)
    r(7, 22, 13, 24, body)
    p(8, 20, body)
    r(2, 25, 7, 28, saddle)
    r(2, 28, 7, 29, paint)
    p(3, 26, paint)
    p(5, 26, paint)
    r(7, 22, 8, 25, paint)
    p(10, 22, eye)
  }
}

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
  ship(d) {
    const { rect, dot } = d
    const wood = rgb('#8a5a36')
    const glass = rgb('#b9d8d0')
    const rim = rgb('#6f9e98')
    const sail = rgb('#f6f0e0')
    const hull = rgb('#6a3420')
    rect(137, 31, 159, 32, dim(wood, 0.8))
    rect(137, 20, 157, 30, glass)
    rect(136, 21, 158, 29, glass)
    rect(137, 20, 157, 21, rim)
    rect(137, 29, 157, 30, rim)
    rect(136, 21, 137, 29, rim)
    rect(157, 21, 158, 23, rim)
    rect(157, 27, 158, 29, rim)
    rect(158, 22, 163, 28, glass)
    rect(158, 22, 163, 23, rim)
    rect(158, 27, 163, 28, rim)
    rect(163, 22, 166, 28, rgb('#c48a52'))
    rect(165, 22, 166, 28, rgb('#9e6a3a'))
    rect(138, 26, 156, 28, rgb('#4f86a8'))
    rect(141, 25, 156, 26, mix(hull, WHITE, 0.2))
    rect(142, 26, 155, 27, hull)
    rect(143, 27, 153, 28, dim(hull, 0.8))
    rect(138, 27, 141, 28, mix(rgb('#4f86a8'), WHITE, 0.3))
    rect(154, 27, 156, 28, mix(rgb('#4f86a8'), WHITE, 0.3))
    rect(147, 20, 148, 25, dim(hull, 0.8))
    rect(151, 21, 152, 25, dim(hull, 0.8))
    rect(144, 22, 147, 25, sail)
    rect(145, 21, 147, 22, sail)
    rect(148, 23, 151, 25, sail)
    dot(152, 23, sail)
    dot(152, 24, sail)
    dot(153, 24, sail)
    dot(147, 20, rgb('#c94048'))
    rect(139, 21, 143, 22, mix(glass, WHITE, 0.7))
    dot(138, 22, mix(glass, WHITE, 0.7))
    rect(159, 23, 161, 24, mix(glass, WHITE, 0.6))
    for (const x of [139, 151]) {
      rect(x, 30, x + 6, 31, wood)
      dot(x, 29, wood)
      dot(x + 5, 29, wood)
    }
  },
  dala(d) {
    const cream = rgb('#f1e4c4')
    dalaHorse(d, 132, 'big', 1, rgb('#c0392f'), rgb('#3f7a4a'), cream)
    dalaHorse(d, 154, 'small', -1, rgb('#3f6b9a'), rgb('#c0392f'), cream)
  },
  spices({ rect, ell, dot }) {
    const glass = rgb('#cfe2dc')
    const edge = rgb('#8fb0a8')
    const jar = (x0: number, x1: number, top: number, fill: number, c: Rgb) => {
      rect(x0, top, x1, 32, glass)
      rect(x0, top, x0 + 1, 32, edge)
      rect(x1 - 1, top, x1, 32, edge)
      rect(x0 + 1, fill, x1 - 1, 32, c)
      rect(x0 + 1, fill, x1 - 1, fill + 1, mix(c, WHITE, 0.25))
      dot(x0 + 1, top + 1, WHITE)
    }
    const cork = rgb('#c49a62')
    const tin = rgb('#a7adb4')
    const wood = rgb('#7a4a2a')

    jar(131, 138, 25, 27, rgb('#e2a52a'))
    rect(132, 22, 137, 25, cork)
    rect(132, 22, 137, 23, mix(cork, WHITE, 0.25))

    jar(140, 146, 21, 24, rgb('#c2412d'))
    ell(143, 21, 3.6, 2.5, rgb('#d9d2c2'), true)
    dot(141, 19, rgb('#b8333a'))
    dot(143, 19, rgb('#b8333a'))
    dot(145, 20, rgb('#b8333a'))
    dot(142, 20, rgb('#b8333a'))
    dot(144, 18, rgb('#b8333a'))

    jar(148, 155, 24, 26, rgb('#5e8a3a'))
    rect(147, 22, 156, 24, tin)
    rect(147, 22, 156, 23, mix(tin, WHITE, 0.35))
    dot(150, 28, rgb('#7fae55'))
    dot(152, 29, rgb('#7fae55'))

    jar(158, 164, 24, 31, rgb('#8a4f2a'))
    rect(159, 19, 160, 31, rgb('#a8643a'))
    rect(160, 21, 161, 31, rgb('#8a4f2a'))
    rect(161, 18, 162, 31, rgb('#b8703f'))
    rect(162, 20, 163, 31, rgb('#8a4f2a'))

    rect(165, 30, 171, 32, wood)
    rect(165, 30, 171, 31, mix(wood, WHITE, 0.2))
    rect(167, 29, 169, 30, wood)
  },
  nesting({ ell, rect, dot }) {
    const cream = rgb('#f3dfc4')
    const cheek = rgb('#e49a8a')
    const ink = rgb('#3a2a24')
    const leaf = rgb('#4f8a4a')
    const doll = (
      cx: number,
      base: number,
      s: number,
      dress: Rgb,
      apron: Rgb,
      flower: Rgb
    ) => {
      const bodyR = 3.2 + s * 1
      const headR = 2.2 + s * 0.7
      const bodyCy = base - bodyR
      const headCy = bodyCy - bodyR - headR + 2
      ell(cx, bodyCy, bodyR, bodyR, dress)
      rect(cx - bodyR + 0.5, bodyCy, cx + bodyR, base, dress)
      ell(cx, headCy, headR, headR, dress)
      ell(cx, headCy + 0.5, headR - 1, headR - 1, cream)
      ell(cx, bodyCy + 1, bodyR - 1.5, bodyR - 1, apron)
      dot(cx, bodyCy + 1, flower)
      if (s >= 1) {
        dot(cx - 1, bodyCy + 2, leaf)
        dot(cx + 1, bodyCy, leaf)
      }
      if (s >= 2) {
        dot(cx - 1, bodyCy - 1, flower)
        dot(cx + 1, bodyCy + 2, flower)
        dot(cx - 2, headCy + 1, cheek)
        dot(cx + 1, headCy + 1, cheek)
      }
      if (s >= 1) {
        dot(cx - 1, headCy, ink)
        dot(cx + 1, headCy, ink)
      }
      rect(cx - bodyR + 0.5, base - 1, cx + bodyR, base, dim(dress, 0.75))
      dot(cx - bodyR + 1, bodyCy - 1, mix(dress, WHITE, 0.35))
    }
    const red = rgb('#c0392f')
    const yellow = rgb('#e2b23a')
    const blue = rgb('#3f6b9a')
    doll(139, 32, 2, red, yellow, red)
    doll(150, 32, 1, blue, yellow, red)
    doll(159.5, 32, 0, yellow, red, yellow)
  },
  shells(d) {
    const { rect, ell, dot } = d
    const shell = rgb('#d39a72')
    const cream = rgb('#f5e8d4')
    const shade = rgb('#b07a56')
    const pink = rgb('#ee8f86')

    const along = (t: number) => ({
      x: 132.5 + 11.5 * t,
      y: 23.5 + 4.5 * t,
      r: 0.7 + 3.6 * t,
    })
    for (let i = 0; i <= 24; i++) {
      const { x, y, r } = along(i / 24)
      ell(x + 0.3, y + 0.6, r, r * 0.9, shell)
    }
    for (let i = 0; i <= 24; i++) {
      const { x, y, r } = along(i / 24)
      ell(x - 0.2, y - 0.4, r * 0.8, r * 0.7, cream)
    }
    for (const t of [0.3, 0.55, 0.8]) {
      const { x, y, r } = along(t)
      line(d, x + 0.38 * r, y - 0.85 * r, x - 0.38 * r, y + 0.85 * r, shade)
    }
    for (const t of [0.45, 0.7, 0.95]) {
      const { x, y, r } = along(t)
      dot(x + 0.38 * (r + 0.9), y - 0.93 * (r + 0.9), shell)
    }
    line(d, 134, 23, 139, 24, WHITE)
    ell(146.5, 27.5, 2.5, 4.2, pink)
    ell(146.9, 28.3, 1.2, 2.4, dim(pink, 0.75))

    const coral = rgb('#e8a48c')
    ell(155, 27, 5, 5, coral)
    rect(150, 27, 161, 30, coral)
    for (let x = 151; x <= 159; x += 2) {
      line(d, 155, 31, x, 23 + Math.abs(x - 155) / 2, dim(coral, 0.82))
    }
    for (let x = 151; x <= 159; x += 2)
      dot(x, 22 + Math.abs(x - 155) / 2, coral)
    rect(152, 29, 158, 32, coral)
    rect(152, 30, 153, 32, dim(coral, 0.82))
    rect(157, 30, 158, 32, dim(coral, 0.82))
    rect(154, 30, 157, 32, mix(coral, WHITE, 0.3))
    dot(152, 24, mix(coral, WHITE, 0.45))

    ell(165, 29.5, 3.2, 2.5, rgb('#eadcc2'))
    dot(164, 28, rgb('#b98a62'))
    dot(166, 29, rgb('#b98a62'))
    dot(167, 30, rgb('#b98a62'))
    dot(165, 30, rgb('#b98a62'))
    dot(163, 30, rgb('#b98a62'))
    dot(163, 28, WHITE)
  },
  abacus({ rect, dot }) {
    const wood = rgb('#8a5a36')
    const dark = rgb('#6e4529')
    const rod = rgb('#d8c08a')
    rect(133, 17, 167, 19, wood)
    rect(133, 28, 167, 30, wood)
    rect(133, 17, 135, 32, wood)
    rect(165, 17, 167, 32, wood)
    rect(133, 17, 167, 18, mix(wood, WHITE, 0.2))
    rect(133, 29, 167, 30, dark)
    rect(132, 31, 136, 32, dark)
    rect(164, 31, 168, 32, dark)

    const rows: readonly (readonly [number, string, readonly number[]])[] = [
      [20, '#c0392f', [135, 138, 141, 144, 159, 162]],
      [23, '#e2b23a', [135, 138, 153, 156, 159, 162]],
      [26, '#3f6b9a', [135, 138, 141, 150, 156, 162]],
    ]
    for (const [y, color, beads] of rows) {
      const c = rgb(color)
      rect(135, y, 165, y + 1, rod)
      for (const x of beads) {
        rect(x, y, x + 3, y + 1, c)
        dot(x + 1, y - 1, mix(c, WHITE, 0.35))
        dot(x + 1, y + 1, dim(c, 0.7))
      }
    }
  },
  globe(d) {
    const { rect, ell, dot } = d
    const brass = rgb('#c9a24a')
    const brassDark = rgb('#9c7a30')
    const ocean = rgb('#3f78a8')
    const land = rgb('#5e9a4a')

    ell(150, 31, 6, 2, brassDark, true)
    rect(144, 30, 157, 32, brassDark)
    rect(145, 30, 156, 31, brass)
    rect(149, 27, 152, 30, brass)

    ell(150.5, 20.5, 6.5, 6.5, dim(ocean, 0.8))
    ell(149.8, 19.8, 5.8, 5.8, ocean)
    ell(147.5, 17.5, 2.6, 1.8, land)
    dot(149, 16, land)
    ell(152.5, 22.5, 2.2, 2.6, land)
    dot(151, 20, land)
    dot(146, 22, land)
    dot(147, 23, land)
    dot(154, 17, land)
    rect(146, 16, 147, 18, mix(ocean, WHITE, 0.45))
    dot(147, 15, mix(ocean, WHITE, 0.45))

    for (let a = 90; a <= 270; a += 4) {
      const r = (a * Math.PI) / 180
      dot(150.5 + 8.3 * Math.cos(r), 20.5 + 8.3 * Math.sin(r), brass)
    }
    dot(150, 12, brassDark)
    dot(150, 29, brassDark)
    line(d, 150, 28, 150, 30, brass)
  },
  robot({ rect, ell, dot }) {
    const tin = rgb('#a9b6c2')
    const tinDark = rgb('#7d8a96')
    const panel = rgb('#46525e')
    const red = rgb('#d0473a')
    const brass = rgb('#d0a94a')

    rect(157, 24, 160, 25, brass)
    rect(160, 21, 161, 28, brass)
    rect(161, 22, 162, 27, dim(brass, 0.8))

    rect(143, 30, 148, 32, panel)
    rect(152, 30, 157, 32, panel)
    rect(144, 27, 147, 30, tinDark)
    rect(153, 27, 156, 30, tinDark)

    rect(143, 19, 157, 27, tin)
    rect(143, 19, 144, 27, mix(tin, WHITE, 0.4))
    rect(156, 19, 157, 27, tinDark)
    rect(146, 21, 154, 25, panel)
    dot(147, 22, red)
    dot(149, 22, brass)
    dot(151, 22, rgb('#6fbf5a'))
    rect(147, 24, 153, 25, tinDark)

    rect(140, 20, 143, 22, tinDark)
    rect(140, 22, 142, 26, tinDark)
    rect(139, 26, 142, 27, panel)
    rect(157, 19, 159, 21, tinDark)
    rect(158, 15, 160, 19, tinDark)
    rect(158, 14, 161, 15, panel)

    rect(145, 12, 155, 19, tin)
    rect(145, 12, 155, 13, mix(tin, WHITE, 0.4))
    rect(154, 13, 155, 19, tinDark)
    ell(148, 15, 1.5, 1.5, rgb('#f4ead0'))
    ell(152, 15, 1.5, 1.5, rgb('#f4ead0'))
    dot(148, 15, panel)
    dot(152, 15, panel)
    rect(147, 17, 153, 18, panel)
    rect(144, 14, 145, 17, red)
    rect(155, 14, 156, 17, red)

    rect(150, 9, 151, 12, panel)
    dot(150, 8, red)
  },
  telescope(d) {
    const { ell, dot } = d
    const brass = rgb('#c9a24a')
    const brassDark = rgb('#97752c')
    const shine = rgb('#efd88a')
    const leg = rgb('#6e4529')

    line(d, 152, 23, 144, 31, leg)
    line(d, 152, 23, 160, 31, leg)
    line(d, 152, 23, 152, 31, dim(leg, 0.8))
    dot(144, 31, dim(leg, 0.7))
    dot(160, 31, dim(leg, 0.7))

    line(d, 161, 24, 139, 14, brassDark, 3.2)
    line(d, 160.5, 23, 139, 13.2, brass, 2.2)
    line(d, 159, 22, 141, 13.6, shine)
    ell(138, 13.5, 2.4, 2.4, brassDark)
    ell(137.5, 13, 1.4, 1.4, rgb('#2f4058'))
    dot(137, 12, rgb('#9fc0e0'))
    line(d, 147, 16.5, 145.5, 19.5, brassDark)
    line(d, 155, 20, 153.5, 23, brassDark)

    ell(162, 24.5, 1.4, 1.4, rgb('#3a2a24'))
    ell(152, 22, 1.6, 1.6, brassDark)
  },
  fishbowl(d) {
    const { rect, ell, dot } = d
    const rim = rgb('#8fb7bf')
    const glass = rgb('#d4e8ea')
    const water = rgb('#6fb0c8')
    const orange = rgb('#e8822a')
    const plant = rgb('#4f8a3a')
    rect(143, 31, 158, 32, rgb('#8a5a36'))
    ell(150.5, 24, 8.5, 7.5, rim)
    ell(150.5, 24, 7.5, 6.6, glass)
    ellBand(d, 150.5, 24, 7.5, 6.6, 20, 32, water)
    ellBand(d, 150.5, 24, 7.5, 6.6, 20, 21, mix(water, WHITE, 0.4))
    ellBand(d, 150.5, 24, 7.5, 6.6, 29, 32, rgb('#cdb68a'))
    rect(145, 16, 157, 17, rim)
    rect(146, 17, 156, 18, glass)

    line(d, 146, 29, 145, 26, plant)
    line(d, 145, 26, 146, 23, plant)
    line(d, 147, 29, 148, 25, mix(plant, WHITE, 0.2))

    ell(153, 25, 2.4, 1.5, orange)
    rect(155, 24, 156, 27, orange)
    rect(156, 23, 157, 28, dim(orange, 0.85))
    dot(152, 24, rgb('#2a2018'))
    dot(153, 26, mix(orange, WHITE, 0.4))
    dot(150, 22, mix(water, WHITE, 0.6))
    dot(149, 21, mix(water, WHITE, 0.6))

    dot(144, 21, WHITE)
    dot(144, 22, WHITE)
    dot(145, 20, WHITE)
    dot(155, 29, mix(glass, WHITE, 0.6))
  },
}

export function drawShelf(buf: PixelBuffer, shelf: ShelfId): void {
  const d = shifted(buf)
  d.rect(128, 32, 172, 34, rgb('#8a5a3a'))
  d.rect(128, 34, 172, 35, rgb('#6e4529'))
  d.rect(131, 35, 133, 38, rgb('#6e4529'))
  d.rect(167, 35, 169, 38, rgb('#6e4529'))
  ITEMS[shelf](d)
}
