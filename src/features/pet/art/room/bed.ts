/**
 * The pet's bed, centred under the pet at x 68. The back layer is part of the
 * room base (drawn before the pet); the front layer (basket rim, loose straw, a
 * cup's or tub's front wall) is drawn over the pet so it sits _in_ the bed.
 *
 * The pet's sprite covers x 52–84, y 52–84; its face stays above y 76, so no
 * front layer reaches above that near the middle. The gift on the rug sits at x
 * 95–99, y 86–90 (`RUG_GIFT_POS`), drawn over the back layer: front layers stay
 * clear of it.
 */
import {
  createBuffer,
  createRng,
  dim,
  fillEllipse,
  fillRect,
  mix,
  plot,
  readRgb,
  rgb,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
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

// ---------------------------------------------------------------------------
// Drawing helpers for the secret beds.

/** A pixel's colour, or null to leave it alone. */
type Paint = (x: number, y: number) => Rgb | null

/**
 * Squared normalized distance of pixel (x, y)'s centre from an ellipse's centre
 * (≤ 1 inside).
 */
function ell(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): number {
  const a = (x + 0.5 - cx) / rx
  const b = (y + 0.5 - cy) / ry
  return a * a + b * b
}

/** Whether pixel (x, y) is inside the ellipse rotated `deg` degrees. */
function inTilted(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg: number
): boolean {
  const t = (deg * Math.PI) / 180
  const dx = x + 0.5 - cx
  const dy = y + 0.5 - cy
  const u = (dx * Math.cos(t) + dy * Math.sin(t)) / rx
  const v = (-dx * Math.sin(t) + dy * Math.cos(t)) / ry
  return u * u + v * v <= 1
}

/**
 * Paints `paint` over the box x0–x1, y0–y1 (inclusive), then `edge` on every
 * unpainted pixel beside a painted one (an outline; return null to skip one).
 */
function paintBox(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  paint: Paint,
  edge?: Paint
): void {
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const hit = new Uint8Array(w * h)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = paint(x, y)
      if (c === null) continue
      plot(buf, x, y, c)
      hit[(y - y0) * w + (x - x0)] = 1
    }
  }
  if (!edge) return
  const at = (x: number, y: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 && hit[(y - y0) * w + (x - x0)]
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (at(x, y)) continue
      if (!at(x - 1, y) && !at(x + 1, y) && !at(x, y - 1) && !at(x, y + 1))
        continue
      const c = edge(x, y)
      if (c !== null) plot(buf, x, y, c)
    }
  }
}

/** A straight 1 px line. */
function line(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb
): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) {
    plot(buf, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c)
  }
}

/** Whether pixel (x, y)'s centre is within `r` of the segment (x0, y0)–(x1, y1). */
function nearSegment(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number
): boolean {
  const px = x + 0.5 - x0
  const py = y + 0.5 - y0
  const dx = x1 - x0
  const dy = y1 - y0
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - t * dx, py - t * dy) <= r
}

/** Darkens what's already there inside an ellipse: a soft shadow on any floor. */
function floorShadow(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  f = 0.8
): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (ell(x, y, cx, cy, rx, ry) <= 1)
        plot(buf, x, y, dim(readRgb(buf, x, y), f))
    }
  }
}

/** A round bubble or pearl of radius `r`: rim, body, and a glint up left. */
function bubble(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  r: number,
  body: Rgb,
  rim: Rgb,
  glint: Rgb
): void {
  paintBox(
    buf,
    Math.floor(cx - r),
    Math.floor(cy - r),
    Math.ceil(cx + r),
    Math.ceil(cy + r),
    (x, y) => {
      const e = ell(x, y, cx, cy, r, r)
      if (e > 1) return null
      const lower = y + 0.5 - cy > 0.2 * r && x + 0.5 - cx > -0.3 * r
      return e > 0.5 && lower ? rim : body
    }
  )
  if (r >= 1.5) plot(buf, cx - r * 0.45, cy - r * 0.45, glint)
}

// ---------------------------------------------------------------------------
// Giant teacup: porcelain cup on a saucer, gilt rim, blue band, handle left.

const TEA = rgbPalette({
  china: '#f7f4ee',
  light: '#ffffff',
  shade: '#dcd9d4',
  deep: '#b6b5bf',
  line: '#7f7c8e',
  inside: '#ebe5dc',
  insideDeep: '#cfc6ba',
  gold: '#e2ae38',
  goldLight: '#f8dc80',
  goldDark: '#a8781c',
  blue: '#3d6db3',
  blueLight: '#86aee2',
  blueDark: '#294f8c',
})

/** Cup rim: centre, radii; the bowl reaches `CUP_DEPTH` below the rim. */
const CUP_Y = 76
const CUP_RX = 22
const CUP_RY = 4
const CUP_DEPTH = 14
const CUP_IN_RX = 20.5
const CUP_IN_RY = 3

/** The front of the cup (rim lip, bowl, foot): the front layer. */
const cupFront: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const a = fx / CUP_RX
  const inRim = ell(x, y, 68, CUP_Y, CUP_RX, CUP_RY) <= 1
  const inBowl = ell(x, y, 68, CUP_Y, CUP_RX, CUP_DEPTH) <= 1 && y + 0.5 > CUP_Y
  if (!inRim && !inBowl) {
    // The foot ring under the bowl.
    if (ell(x, y, 68, 89.5, 10, 2) <= 1) return y >= 90 ? TEA.deep : TEA.shade
    return null
  }
  if (ell(x, y, 68, CUP_Y, CUP_IN_RX, CUP_IN_RY) <= 1) return null
  if (y + 0.5 <= CUP_Y) return null
  if (inRim)
    return a < -0.35 ? TEA.goldLight : a > 0.6 ? TEA.goldDark : TEA.gold
  // Depth below the front lip, so bands follow the cup's curve.
  const d = y + 0.5 - (CUP_Y + CUP_RY * Math.sqrt(Math.max(0, 1 - a * a)))
  if (d >= 3 && d < 5) {
    if (d < 4 && (x & 3) === 1) return TEA.blueLight
    return a > 0.55 ? TEA.blueDark : TEA.blue
  }
  if (d >= 5 && d < 6) {
    // Scalloped lace under the band.
    return (x & 3) === 1 || (x & 3) === 2
      ? a > 0.55
        ? TEA.blueDark
        : TEA.blue
      : bodyTone(a, y)
  }
  if (d >= 9.5 && d < 10.5 && Math.abs(a) < 0.8) return TEA.gold
  return bodyTone(a, y)
}

function bodyTone(a: number, y: number): Rgb {
  if (a < -0.62 && a > -0.8 && y < 86) return TEA.light
  if (a > 0.82 || (y >= 88 && a > 0.2)) return TEA.deep
  if (a > 0.5 || y >= 88) return TEA.shade
  return TEA.china
}

// ---------------------------------------------------------------------------
// Clamshell: a sandy scallop shell, open; its lid stands up behind the pet on
// a straight hinge with an ear each side, and the pet sits in the lower half.

const CLAM = rgbPalette({
  outline: '#7e5f45',
  lip: '#f3e4cb',
  lipLight: '#fff8ec',
  inside: '#efdcbd',
  insideLight: '#f9eedb',
  insideShade: '#dcc39d',
  groove: '#bd9a6c',
  hinge: '#a8835c',
  hingeDark: '#8a6a4a',
  outer: '#e6c99c',
  outerLight: '#f2dcb6',
  outerShade: '#cfae7f',
  outerDeep: '#b38f62',
  pearl: '#f7f3f2',
  pearlRim: '#cbbfd4',
  pearlGlint: '#ffffff',
})

/** The lid's hinge point (hidden behind the pet), radius and rib count. */
const CLAM_HX = 68
const CLAM_HY = 80
const CLAM_R = 28
const CLAM_RIBS = 7
/** The lid's fan spans these angles (radians) above the hinge. */
const CLAM_A0 = 0.44
const CLAM_A1 = Math.PI - 0.44
/** The straight hinge line along the ears' foot. */
const CLAM_EAR_TOP = 70
const CLAM_EAR_FOOT = 77

/** The lid's inside: a fan of straight ribs up from the hinge, on two ears. */
const clamUpper: Paint = (x, y) => {
  const dx = x + 0.5 - CLAM_HX
  const yc = y + 0.5
  const dy = CLAM_HY - yc
  const th = Math.atan2(dy, dx)
  const inFan = dy >= 0 && th >= CLAM_A0 && th <= CLAM_A1
  // The ears: a wedge each side of the hinge, its foot the hinge line.
  if (yc >= CLAM_EAR_TOP && yc < CLAM_EAR_FOOT) {
    const reach = 12 + (yc - CLAM_EAR_TOP)
    if (Math.abs(dx) <= reach) {
      if (yc >= CLAM_EAR_FOOT - 1) return CLAM.hingeDark
      if (yc >= CLAM_EAR_FOOT - 2) return CLAM.hinge
      if (!inFan) return dx < 0 ? CLAM.insideShade : CLAM.groove
    }
  }
  if (!inFan) return null
  const r = Math.hypot(dx, dy) / CLAM_R
  const span = (th - CLAM_A0) / (CLAM_A1 - CLAM_A0)
  const rib = span * CLAM_RIBS
  const f = rib - Math.floor(rib)
  // A gently waved rim: one shallow bump per rib.
  const edge = 0.96 + 0.04 * Math.sin(Math.PI * f)
  if (r > edge) return null
  if (r > edge - 0.07) return dx < -6 ? CLAM.lipLight : CLAM.lip
  // Straight grooves between the ribs, from the hinge out to the rim.
  if (r > 0.3 && (f < 0.1 || f > 0.92)) return CLAM.groove
  if (dx < -10) return CLAM.insideLight
  return dx > 10 ? CLAM.insideShade : CLAM.inside
}

/** The lower shell's inside, where the pet sits: a shallow cream bowl. */
const clamInside: Paint = (x, y) => {
  if (ell(x, y, 68, 81, 27, 4.5) > 1) return null
  if (ell(x, y, 68, 81, 25, 3.3) > 1) return x < 56 ? CLAM.lipLight : CLAM.lip
  return x > 82 ? CLAM.insideShade : CLAM.inside
}

/** The lower shell's outside: straight ribs fanning down to its hinge below. */
const clamLower: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const yc = y + 0.5
  if (yc < 81 || ell(x, y, 68, 81, 28, 12) > 1) return null
  if (ell(x, y, 68, 81, 27, 4.5) <= 1) return null
  const ang = Math.atan2(fx, 99 - yc)
  const rib = ang * 5
  const f = rib - Math.floor(rib)
  const lip = 81 + 4.5 * Math.sqrt(Math.max(0, 1 - (fx / 27) ** 2))
  if (yc < lip + 1) return fx < -12 ? CLAM.lipLight : CLAM.lip
  if (f < 0.12) return CLAM.outerDeep
  if (yc > 90) return CLAM.outerShade
  if (fx < -12) return CLAM.outerLight
  return fx > 14 ? CLAM.outerShade : CLAM.outer
}

// ---------------------------------------------------------------------------
// Rowboat: a painted, planked hull, pointed bow left, transom right, and an
// oar propped in it.

const BOAT = rgbPalette({
  paint: '#3e8f98',
  paintLight: '#5fb1b4',
  paintShade: '#2d6e79',
  seam: '#235660',
  bottom: '#a9452f',
  bottomShade: '#83321f',
  gunwale: '#7a4a26',
  gunwaleLight: '#a8703f',
  outline: '#2e2420',
  stripe: '#f0e4c6',
  stripeShade: '#cbbd9a',
  inner: '#9a6136',
  innerLight: '#bb7f48',
  floor: '#7a4a28',
  seat: '#cf9a5e',
  oar: '#e2b676',
  oarShade: '#b08248',
  oarTip: '#c9483a',
})

/** Hull geometry by u = −1 (bow) … 1 (stern). */
const boatU = (x: number) => (x + 0.5 - 68) / 31
const boatGun = (u: number) => 80 - 1.5 * u * u - (u < 0 ? 6 * u ** 4 : 0)
const boatOpen = (u: number) =>
  u < 0
    ? 5.5 * Math.max(0, 1 - u * u) ** 0.75
    : 5.5 * Math.sqrt(Math.max(0, 1 - (u / 1.15) ** 2))
const boatKeel = (u: number) => (u < 0 ? 92 - 16 * u ** 4 : 92 - 11 * u ** 4)

/** The near side of the hull (the front layer): gunwale, stripe, planks. */
const boatHull: Paint = (x, y) => {
  const u = boatU(x)
  if (u < -1 || u > 1) return null
  const gun = boatGun(u)
  const keel = boatKeel(u)
  const yc = y + 0.5
  const d = yc - gun
  if (d < 0 || yc > keel) return null
  if (d < 1) return u < -0.2 ? BOAT.gunwaleLight : BOAT.gunwale
  if (d < 2) return BOAT.gunwale
  if (d < 3) return u > 0.55 ? BOAT.stripeShade : BOAT.stripe
  if (keel - yc < 2.5) return u > 0.4 ? BOAT.bottomShade : BOAT.bottom
  if (Math.floor(d - 3) % 3 === 2) return BOAT.seam
  if (u > 0.93 || u > 0.45) return BOAT.paintShade
  return u < -0.5 ? BOAT.paintLight : BOAT.paint
}

/** Outline below and beside the hull, never across the pet. */
const boatEdge: Paint = (x, y) => {
  const u = Math.max(-1, Math.min(1, boatU(x)))
  return y + 0.5 > boatGun(u) + 1 ? BOAT.outline : null
}

/** The inside: far gunwale, inner planks, floorboards and a seat. */
const boatInside: Paint = (x, y) => {
  const u = boatU(x)
  if (u < -1 || u > 1) return null
  const gun = boatGun(u)
  const far = gun - boatOpen(u)
  const yc = y + 0.5
  if (yc < far - 1 || yc >= gun) return null
  if (yc < far) return BOAT.gunwale
  if (x >= 86 && x <= 88) return BOAT.seat
  if (yc < far + 1.5) return BOAT.innerLight
  return yc < far + 3 ? BOAT.inner : BOAT.floor
}

// ---------------------------------------------------------------------------
// Donut: pink glaze, chocolate drizzle, the pet sitting in the hole.

const DONUT = rgbPalette({
  dough: '#e2a864',
  doughLight: '#f2c88c',
  doughShade: '#bb7d3f',
  doughDark: '#8c5629',
  hole: '#6e4020',
  glaze: '#f392b4',
  glazeLight: '#ffc6da',
  glazeShade: '#d96b94',
  choc: '#5a321e',
  chocLight: '#7e4a2e',
  crumb: '#f8deb0',
  outline: '#6a3c1c',
})

const DONUT_RX = 27
const HOLE_X = 68
const HOLE_Y = 77
const HOLE_RX = 13
const HOLE_RY = 3.2

/** Chocolate drizzle: a zigzag across the glaze, as a set of pixel keys. */
const DRIZZLE: ReadonlySet<number> = (() => {
  const pts: readonly (readonly [number, number])[] = [
    [41, 83],
    [44, 75],
    [47, 85],
    [50, 73],
    [53, 86],
    [57, 82],
    [61, 87],
    [65, 82.5],
    [70, 87],
    [74, 82.5],
    [78, 86.5],
    [82, 82],
    [84, 86],
    [86, 73],
    [89, 85],
    [92, 75],
    [95, 82],
  ]
  const out = new Set<number>()
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n)
      const y = Math.round(y0 + ((y1 - y0) * k) / n)
      out.add(y * SCENE_W + x)
      out.add((y + 1) * SCENE_W + x)
    }
  }
  return out
})()

/** A bite out of the donut's far right side: two overlapping round nips. */
const BITES: readonly (readonly [number, number, number])[] = [
  [88, 73, 4.2],
  [94.5, 78, 4],
]
/** How far pixel (x, y) is into the nearest bite (≤ 1 inside it). */
const biteAt = (x: number, y: number) =>
  Math.min(...BITES.map(([bx, by, r]) => ell(x, y, bx, by, r, r)))

const donutAt: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const a = fx / DONUT_RX
  if (Math.abs(a) > 1) return null
  const inGlaze = ell(x, y, 68, 79.5, DONUT_RX, 9) <= 1
  const inDough = ell(x, y, 68, 83, DONUT_RX, 10) <= 1
  if (!inGlaze && !inDough) return null
  // The bitten edge shows the soft crumb inside.
  const bite = biteAt(x, y)
  if (bite <= 1) return null
  if (bite <= 1.7) return DONUT.crumb
  if (ell(x, y, HOLE_X, HOLE_Y, HOLE_RX, HOLE_RY) <= 1)
    return y + 0.5 < HOLE_Y ? DONUT.doughDark : DONUT.hole
  if (ell(x, y, HOLE_X, HOLE_Y, HOLE_RX + 1.6, HOLE_RY + 1.1) <= 1)
    return y + 0.5 < HOLE_Y ? DONUT.doughShade : DONUT.dough
  // Glaze ends in drips over the dough's side.
  const drip = [0, 1, 2, 1, 0, 0, 0][((x % 7) + 7) % 7]
  const glazeEnd = 79.5 + 9 * Math.sqrt(1 - a * a) - 2 + drip
  if (inGlaze && y + 0.5 < glazeEnd) {
    if (DRIZZLE.has(y * SCENE_W + x) && y + 1 < glazeEnd)
      return DRIZZLE.has((y - 1) * SCENE_W + x) ? DONUT.choc : DONUT.chocLight
    const top = (y + 0.5 - 70.5) / 9
    if (a < -0.5 && top < 0.55 && a > -0.85) return DONUT.glazeLight
    if (a > 0.6 || y + 1.5 >= glazeEnd) return DONUT.glazeShade
    return DONUT.glaze
  }
  if (y >= 91 || a > 0.7) return DONUT.doughShade
  return a < -0.6 ? DONUT.doughLight : DONUT.dough
}

/** The front edge of the hole: what lies below it is in front of the pet. */
function donutCut(x: number): number {
  const a = (x + 0.5 - HOLE_X) / (HOLE_RX + 1.6)
  return Math.abs(a) < 1
    ? HOLE_Y + (HOLE_RY + 1.1) * Math.sqrt(1 - a * a)
    : HOLE_Y
}

// ---------------------------------------------------------------------------
// Leather pouf: stitched panels and an embossed band.

const POUF = rgbPalette({
  top: '#c4673b',
  topLight: '#d9824f',
  leather: '#b2552d',
  light: '#cd7444',
  shade: '#8c3f20',
  dark: '#682c16',
  piping: '#5c2612',
  stitch: '#f2deb6',
  emboss: '#8f421f',
})

const POUF_RX = 23
const POUF_TOP = 78
const POUF_BOTTOM = 92

/** Half-width of the pouf's side at row y: a gentle bulge. */
const poufW = (y: number) =>
  POUF_RX +
  1.6 *
    Math.sin(
      Math.PI *
        Math.max(0, Math.min(1, (y - POUF_TOP) / (POUF_BOTTOM - POUF_TOP)))
    )

const poufAt: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const yc = y + 0.5
  if (ell(x, y, 68, POUF_TOP, POUF_RX, 5) <= 1) {
    if (ell(x, y, 68, POUF_TOP, POUF_RX - 1.3, 4) > 1) return POUF.piping
    // Seams from the middle, a stitched ring around the medallion.
    const ring = ell(x, y, 68, POUF_TOP, 15, 2.8)
    if (ring <= 1 && ell(x, y, 68, POUF_TOP, 13.5, 2) > 1)
      return (x & 1) === 0 ? POUF.stitch : POUF.top
    const ang = Math.atan2((yc - POUF_TOP) * 4.8, fx)
    const s8 = (ang / Math.PI) * 8
    const f = s8 - Math.floor(s8)
    if (ring > 1 && (f < 0.08 || f > 0.92)) return POUF.shade
    return fx < -8 && yc < POUF_TOP + 1 ? POUF.topLight : POUF.top
  }
  const w = poufW(yc)
  const a = fx / w
  if (yc < POUF_TOP || Math.abs(a) > 1) return null
  if (yc > POUF_BOTTOM + 4 * Math.sqrt(Math.max(0, 1 - a * a))) return null
  // Rows below the top's front edge, so bands follow the curve.
  const d = yc - (POUF_TOP + 5 * Math.sqrt(Math.max(0, 1 - a * a)))
  if (d < 1) return POUF.piping
  const tone =
    a < -0.62
      ? POUF.light
      : a > 0.78
        ? POUF.dark
        : a > 0.45
          ? POUF.shade
          : POUF.leather
  if (d >= 3 && d < 8) {
    // Embossed band: a stitched zigzag between two darker rules.
    const row = Math.floor(d - 3)
    if (row === 0 || row === 4) return POUF.emboss
    const k = ((x % 6) + 6) % 6
    const zig = k < 3 ? k : 6 - k
    if (row - 1 === zig || (row === 2 && k === 0)) {
      return Math.abs(a) > 0.86 ? POUF.emboss : POUF.stitch
    }
    return Math.abs(a) > 0.8 ? POUF.dark : POUF.emboss
  }
  // Panel seams, a shade darker.
  for (const s of [-0.75, -0.3, 0.3, 0.75]) {
    if (Math.abs(a - s) * w < 0.5) return a > 0.45 ? POUF.dark : POUF.shade
  }
  if (d >= 11) return a > 0.2 ? POUF.dark : POUF.shade
  return tone
}

// ---------------------------------------------------------------------------
// Pebble nest: a ring of smooth stones around moss, two feathers tucked in.

const NEST = rgbPalette({
  moss: '#6f9444',
  mossLight: '#93b85c',
  mossDark: '#4e6e30',
  outline: '#4a4642',
  white: '#f5f2ea',
  whiteShade: '#cfc8ba',
  quill: '#9a8a70',
  brown: '#b88a58',
  brownDark: '#6e4f30',
})

const PEBBLE_TONES = [
  '#a39b90',
  '#8f8c88',
  '#b8a68c',
  '#9ca5a8',
  '#c4baac',
  '#a8927a',
].map(rgb)

interface Pebble {
  x: number
  y: number
  rx: number
  ry: number
  tone: Rgb
  front: boolean
}

/** The ring of pebbles, back to front (fixed by the seed). */
const PEBBLES: readonly Pebble[] = (() => {
  const r = createRng(11)
  const out: Pebble[] = []
  const n = 15
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.18
    const y = 84 + Math.sin(th) * 6.5
    out.push({
      x: 68 + Math.cos(th) * 26.5,
      y,
      rx: 3.6 + r() * 1.2,
      ry: 2.6 + r() * 0.7,
      tone: PEBBLE_TONES[Math.floor(r() * PEBBLE_TONES.length)],
      front: Math.sin(th) > 0.55,
    })
  }
  return out.sort((p, q) => p.y - q.y)
})()

function drawPebble(buf: PixelBuffer, p: Pebble): void {
  paintBox(
    buf,
    Math.floor(p.x - p.rx),
    Math.floor(p.y - p.ry),
    Math.ceil(p.x + p.rx),
    Math.ceil(p.y + p.ry),
    (x, y) => {
      const e = ell(x, y, p.x, p.y, p.rx, p.ry)
      if (e > 1) return null
      const dx = x + 0.5 - p.x
      const dy = y + 0.5 - p.y
      if (dx < -0.2 * p.rx && dy < -0.15 * p.ry && e < 0.6)
        return mix(p.tone, rgb('#ffffff'), 0.35)
      if (dy > 0.35 * p.ry || dx > 0.6 * p.rx) return dim(p.tone, 0.8)
      return p.tone
    },
    (x, y) => (y + 0.5 > p.y - p.ry * 0.6 ? NEST.outline : null)
  )
}

/** A feather from its quill (x0, y0) to its tip (x1, y1). */
function feather(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  vane: Rgb,
  vaneShade: Rgb,
  quill: Rgb,
  barred?: Rgb
): void {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  const cx = (x0 + x1) / 2 + (x1 - x0) * 0.12
  const cy = (y0 + y1) / 2 + (y1 - y0) * 0.12
  paintBox(
    buf,
    Math.floor(Math.min(x0, x1) - 3),
    Math.floor(Math.min(y0, y1) - 3),
    Math.ceil(Math.max(x0, x1) + 3),
    Math.ceil(Math.max(y0, y1) + 3),
    (x, y) => {
      if (!inTilted(x, y, cx, cy, len * 0.42, 1.9, deg)) return null
      // Which side of the quill: one side lit, one shaded.
      const side = (x + 0.5 - x0) * (y1 - y0) - (y + 0.5 - y0) * (x1 - x0)
      if (barred && (Math.round(x + y) & 3) === 0) return barred
      return side > 0 ? vaneShade : vane
    }
  )
  line(buf, x0, y0, x0 + (x1 - x0) * 0.85, y0 + (y1 - y0) * 0.85, quill)
}

// ---------------------------------------------------------------------------
// Cheese wheel: rind, holes, a wedge cut out at the front right.

const CHEESE = rgbPalette({
  top: '#f5d364',
  topLight: '#fbe38e',
  cut: '#f8df82',
  cutShade: '#ebc75c',
  hole: '#d9aa3c',
  holeDark: '#b98a24',
  rind: '#d98a26',
  rindLight: '#eba63e',
  rindShade: '#b06a18',
  outline: '#7e5214',
})

const WHEEL_RX = 27
const WHEEL_RY = 6.5
const WHEEL_TOP = 79
const WHEEL_H = 12
const WEDGE_FROM = (12 * Math.PI) / 180
const WEDGE_TO = (74 * Math.PI) / 180

const inWedge = (th: number) => th >= WEDGE_FROM && th <= WEDGE_TO

/** Angle of a point on the top, in the wheel's own (circular) terms. */
const wheelAngle = (x: number, y: number) =>
  Math.atan2((y - WHEEL_TOP) / WHEEL_RY, (x - 68) / WHEEL_RX)

const TOP_HOLES: readonly (readonly [number, number, number, number])[] = [
  [48, 78.5, 2.6, 1.3],
  [56, 82.5, 1.8, 1],
  [84, 76, 1.8, 0.9],
  [44, 82, 1.5, 0.8],
  [60, 75, 1.4, 0.7],
  [76, 74.5, 1.3, 0.6],
]
/** Holes in the cut face, as (t along the face, rows down, radius). */
const CUT_HOLES: readonly (readonly [number, number, number])[] = [
  [0.7, 4.5, 2],
  [0.9, 9, 1.4],
  [0.48, 9, 1.5],
  [0.86, 2.2, 1.1],
  [0.58, 1.6, 0.9],
]

/** The far cut face: centre to rim along WEDGE_FROM, the wheel's height. */
function cutFace(x: number, y: number): Rgb | null {
  const px = WHEEL_RX * Math.cos(WEDGE_FROM)
  const py = WHEEL_RY * Math.sin(WEDGE_FROM)
  const t = (x + 0.5 - 68) / px
  if (t < 0 || t > 1) return null
  const d = y + 0.5 - (WHEEL_TOP + t * py)
  if (d < 0 || d > WHEEL_H) return null
  if (t > 0.95) return CHEESE.rindShade
  for (const [ht, hd, hr] of CUT_HOLES) {
    const e = (((t - ht) * px) ** 2 + (d - hd) ** 2) / (hr * hr)
    if (e <= 1) return d < hd ? CHEESE.holeDark : CHEESE.hole
  }
  if (d < 1) return CHEESE.topLight
  return d > WHEEL_H - 2 || t < 0.12 ? CHEESE.cutShade : CHEESE.cut
}

/**
 * The wheel, nearest surface first: the uncut top, then the uncut rind, then
 * (through the gap) the far cut face; the rest of the gap shows the floor.
 */
const cheeseAt: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const a = fx / WHEEL_RX
  if (Math.abs(a) > 1) return null
  const yc = y + 0.5
  if (ell(x, y, 68, WHEEL_TOP, WHEEL_RX, WHEEL_RY) <= 1) {
    if (!inWedge(wheelAngle(x + 0.5, yc))) {
      if (ell(x, y, 68, WHEEL_TOP, WHEEL_RX - 1.2, WHEEL_RY - 0.9) > 1)
        return a < -0.3 ? CHEESE.rindLight : CHEESE.rind
      for (const [hx, hy, hrx, hry] of TOP_HOLES) {
        if (ell(x, y, hx, hy, hrx, hry) <= 1)
          return yc < hy ? CHEESE.holeDark : CHEESE.hole
      }
      return a < -0.45 && yc < WHEEL_TOP ? CHEESE.topLight : CHEESE.top
    }
    return cutFace(x, y)
  }
  const front = WHEEL_TOP + WHEEL_RY * Math.sqrt(1 - a * a)
  if (yc < front || yc > front + WHEEL_H) return null
  const side = Math.atan2(Math.sqrt(1 - a * a), a)
  if (inWedge(side)) return cutFace(x, y)
  // The cut edge where the rind meets the gap.
  if (
    inWedge(
      Math.atan2(
        Math.sqrt(Math.max(0, 1 - ((fx + 1) / WHEEL_RX) ** 2)),
        (fx + 1) / WHEEL_RX
      )
    )
  )
    return CHEESE.rindShade
  if (a < -0.65) return CHEESE.rindLight
  if (a > 0.55 || yc > front + WHEEL_H - 2) return CHEESE.rindShade
  return CHEESE.rind
}

// ---------------------------------------------------------------------------
// Hammock: striped cloth slung between two wooden stands.

const HAMMOCK = rgbPalette({
  red: '#c9483a',
  cream: '#f1e3c2',
  teal: '#2f8b8a',
  mustard: '#e6b23c',
  inner: '#a63a2f',
  innerCream: '#cdbd9c',
  innerTeal: '#256e6d',
  innerMustard: '#bf9030',
  outline: '#5a2a24',
  post: '#9a6a3e',
  postLight: '#b98654',
  postDark: '#6a4424',
  rope: '#d8c49a',
  ropeShade: '#a8936a',
})

const HM_X0 = 42
const HM_X1 = 94
const hmU = (x: number) => ((x + 0.5 - HM_X0) / (HM_X1 - HM_X0)) * 2 - 1
/** Back edge, front lip and belly of the cloth by u. */
const hmBack = (u: number) => 72.5 + 5 * (1 - u * u)
const hmLip = (u: number) => 74 + 6.5 * (1 - u * u)
const hmBelly = (u: number) => 76.5 + 10 * (1 - u * u)
const STRIPES = [
  'red',
  'cream',
  'teal',
  'cream',
  'mustard',
  'cream',
  'red',
] as const

const hammockInside: Paint = (x, y) => {
  const u = hmU(x)
  if (u < -1 || u > 1) return null
  const yc = y + 0.5
  if (yc < hmBack(u) || yc >= hmLip(u)) return null
  const k = Math.floor(((yc - hmBack(u)) / (hmLip(u) - hmBack(u))) * 3)
  return [HAMMOCK.inner, HAMMOCK.innerCream, HAMMOCK.innerTeal][Math.min(2, k)]
}

const hammockFront: Paint = (x, y) => {
  const u = hmU(x)
  if (u < -1 || u > 1) return null
  const yc = y + 0.5
  const lip = hmLip(u)
  const belly = hmBelly(u)
  if (yc < lip || yc > belly) return null
  const k = Math.floor(((yc - lip) / (belly - lip)) * STRIPES.length)
  const c = HAMMOCK[STRIPES[Math.min(STRIPES.length - 1, k)]]
  return u > 0.55 || yc > belly - 1 ? dim(c, 0.85) : c
}

const hammockEdge: Paint = (x, y) => {
  const u = hmU(x)
  return u >= -1.1 && u <= 1.1 && y + 0.5 > hmLip(Math.max(-1, Math.min(1, u)))
    ? HAMMOCK.outline
    : null
}

function hammockStand(buf: PixelBuffer, x: number, side: -1 | 1): void {
  // Post, a foot along the floor, and a brace.
  fillRect(buf, x, 64, x + 2, 93, HAMMOCK.post)
  fillRect(
    buf,
    side < 0 ? x : x + 1,
    64,
    side < 0 ? x + 1 : x + 2,
    93,
    side < 0 ? HAMMOCK.postLight : HAMMOCK.postDark
  )
  fillRect(buf, x - 4, 92, x + 6, 94, HAMMOCK.postDark)
  fillRect(buf, x - 4, 92, x + 6, 93, HAMMOCK.post)
  fillRect(buf, x - 1, 63, x + 3, 65, HAMMOCK.postDark)
  line(buf, x + 1 - side * 4, 91, x + 1 - side * 1, 85, HAMMOCK.postDark)
}

// ---------------------------------------------------------------------------
// Bread loaf: a golden bâtard with pale scores.

const BREAD = rgbPalette({
  crust: '#d68d38',
  crustLight: '#e6a64e',
  crustTop: '#f2c069',
  crustShade: '#a8622a',
  crustDark: '#6a3814',
  crumb: '#f3dca4',
  crumbShade: '#dcb874',
  flour: '#f7f0e2',
})

const LOAF_RX = 28
const LOAF_MID = 86
const LOAF_UP = 10.5
const LOAF_DOWN = 5

/** Score marks: centre and length, tilted down to the right. */
const SCORES: readonly (readonly [number, number, number])[] = [
  [45, 82, 4.4],
  [55, 79, 5],
  [68, 77.5, 5.5],
  [81, 79, 5],
  [91, 82, 4.4],
]

/** The loaf's height factor at u = −1…1: full in the middle, pointed ends. */
const loafS = (a: number) => 1 - Math.abs(a) ** 2.6

/**
 * How far the crust lifts at x: each score's far edge bakes up into a ridge (an
 * "ear"), so the loaf's top is a row of low steps.
 */
function loafEar(x: number): number {
  for (const [sx, , len] of SCORES) {
    const t = (x + 0.5 - (sx - len * 0.85)) / (len * 1.7)
    if (t >= 0 && t <= 1) return 1.6 * t
  }
  return 0
}

const loafAt: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const a = fx / LOAF_RX
  if (Math.abs(a) >= 1) return null
  const yc = y + 0.5
  const s = loafS(a)
  const top = LOAF_MID - LOAF_UP * s - loafEar(x) * s
  const bottom = LOAF_MID + LOAF_DOWN * Math.sqrt(s)
  if (yc < top || yc > bottom) return null
  for (const [sx, sy, len] of SCORES) {
    // Each score opens into a pale cut with a dark lip below it.
    const tilt = -32
    if (inTilted(x, y, sx, sy, len, 1.9, tilt))
      return inTilted(x, y + 1, sx, sy, len, 1.9, tilt)
        ? BREAD.crumb
        : BREAD.crumbShade
    if (inTilted(x, y - 1, sx, sy, len, 1.9, tilt)) return BREAD.crustDark
  }
  const up = (LOAF_MID - yc) / (LOAF_UP * s)
  if (yc > bottom - 1.5) return BREAD.crustDark
  if (yc > LOAF_MID + 2) return a > 0.1 ? BREAD.crustShade : BREAD.crust
  if (yc < top + 1.2 && up > 0.3) return BREAD.crustTop
  if (up > 0.55 && a < 0.4) return a < -0.2 ? BREAD.crustTop : BREAD.crustLight
  if (a > 0.72) return BREAD.crustShade
  return a < -0.5 ? BREAD.crustLight : BREAD.crust
}

// ---------------------------------------------------------------------------
// Bathtub: white clawfoot tub, gold feet and tap, a heap of soap froth.

const TUB = rgbPalette({
  enamel: '#f8f7f3',
  light: '#ffffff',
  shade: '#dde2e8',
  deep: '#b3bcc9',
  outline: '#6f7a8c',
  inside: '#dfe6ee',
  gold: '#e7b42e',
  goldLight: '#fbe08a',
  goldDark: '#a3741a',
  foam: '#ffffff',
  foamRim: '#cfe3f0',
  foamGlint: '#f7d9f0',
  duck: '#ffd23f',
  duckShade: '#e3a51c',
  beak: '#f08a24',
  eye: '#3a2a1a',
})

const TUB_Y = 77
const TUB_RX = 28
const TUB_RY = 3.6
const TUB_IN_RX = 26
const TUB_IN_RY = 2.4
const TUB_DEPTH = 13

/** The tub's plan: a rounded rectangle (superellipse). */
const tubPlan = (x: number, y: number, rx: number, ry: number) =>
  Math.abs((x + 0.5 - 68) / rx) ** 4 + Math.abs((y + 0.5 - TUB_Y) / ry) ** 2

const tubFront: Paint = (x, y) => {
  const fx = x + 0.5 - 68
  const yc = y + 0.5
  const inRim = tubPlan(x, y, TUB_RX, TUB_RY) <= 1
  const bodyRx = TUB_RX - 1 - Math.max(0, yc - TUB_Y) * 0.18
  const inBody =
    yc > TUB_Y &&
    Math.abs(fx / bodyRx) ** 4 + ((yc - TUB_Y) / TUB_DEPTH) ** 2 <= 1
  if (!inRim && !inBody) return null
  if (yc <= TUB_Y || tubPlan(x, y, TUB_IN_RX, TUB_IN_RY) <= 1) return null
  const a = fx / TUB_RX
  if (inRim) return a < -0.5 ? TUB.light : a > 0.75 ? TUB.shade : TUB.enamel
  if (yc > TUB_Y + TUB_DEPTH - 2.5 || a > 0.82) return TUB.deep
  if (a > 0.5) return TUB.shade
  if (a < -0.66 && a > -0.84) return TUB.light
  // A gold pinstripe below the roll top.
  const lip = TUB_Y + TUB_RY * Math.sqrt(Math.max(0, 1 - a ** 4))
  if (yc - lip > 1 && yc - lip < 2 && Math.abs(a) < 0.86) return TUB.gold
  return TUB.enamel
}

function clawFoot(buf: PixelBuffer, x: number, flip: boolean): void {
  // A gold leg flaring to a ball and three toes.
  const s = flip ? -1 : 1
  paintBox(
    buf,
    x - 3,
    86,
    x + 3,
    94,
    (px, py) => {
      const dx = (px - x) * s
      if (py <= 88)
        return Math.abs(dx) <= 1 ? (dx < 0 ? TUB.goldLight : TUB.gold) : null
      if (py <= 91)
        return Math.abs(dx + (py - 88) * 0.5) <= 1.5
          ? dx < -0.5
            ? TUB.goldLight
            : TUB.gold
          : null
      if (py === 92) return dx >= -3 && dx <= 0 ? TUB.gold : null
      if (py === 93)
        return dx === -3 || dx === -1 || dx === 1 ? TUB.goldDark : null
      return null
    },
    (px, py) => (py >= 89 ? TUB.goldDark : null)
  )
}

/**
 * Froth bubbles: (x, y, r). Back ones heap behind the pet; front ones sit on
 * the rim.
 */
const FROTH_BACK: readonly (readonly [number, number, number])[] = [
  [44, 75, 2.2],
  [48, 73, 3],
  [53, 71.5, 3.2],
  [58, 72, 2.6],
  [79, 72, 2.6],
  [84, 71, 3.2],
  [89, 73, 3],
  [93, 75.5, 2.2],
  [51, 75, 2.5],
  [87, 75.5, 2.5],
]
const FROTH_FRONT: readonly (readonly [number, number, number])[] = [
  [45, 77.5, 2],
  [49, 77, 2.5],
  [54, 78, 2.2],
  [58.5, 79, 1.8],
  [77.5, 79, 1.8],
  [82, 78, 2.2],
  [86.5, 77, 2.5],
  [91, 77.5, 2],
  [62.5, 80, 1.4],
  [73, 80, 1.4],
  [52, 81.5, 1.2],
  [86, 81, 1.2],
]

/** A froth bubble: white, with a pale blue rim low on the right. */
function froth(buf: PixelBuffer, cx: number, cy: number, r: number): void {
  bubble(buf, cx, cy, r, TUB.foam, TUB.foamRim, TUB.foam)
}

/** A few pixels of rainbow sheen on the front froth. */
const IRIDESCENT: readonly (readonly [number, number])[] = [
  [48, 76],
  [86, 76],
  [53, 77],
]

/** Loose bubbles drifting up: rings with a glint. */
const BUBBLE_RING = ['.oo.', 'og.o', 'o..o', '.oo.']
const BUBBLE_RING_SMALL = ['.o.', 'o.o', '.o.']

function ring(
  buf: PixelBuffer,
  x: number,
  y: number,
  rows: readonly string[]
): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === 'o') plot(buf, x + i, y + j, TUB.foamRim)
      else if (row[i] === 'g') plot(buf, x + i, y + j, TUB.light)
    }
  })
}

function rubberDuck(buf: PixelBuffer, x: number, y: number): void {
  fillEllipse(buf, x, y + 2, 3, 1.8, TUB.duck)
  fillRect(buf, x - 3, y + 3, x + 3, y + 4, TUB.duckShade)
  fillEllipse(buf, x - 1.5, y - 0.5, 1.7, 1.7, TUB.duck)
  plot(buf, x - 4, y - 1, TUB.beak)
  plot(buf, x - 4, y, TUB.beak)
  plot(buf, x - 2, y - 1, TUB.eye)
  plot(buf, x + 2, y + 1, TUB.duckShade)
}

// ---------------------------------------------------------------------------

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
  teacup(buf) {
    floorShadow(buf, 68, 94.5, 31, 2.6)
    // Saucer: its underside, then the top with a gilt edge and a blue ring.
    fillEllipse(buf, 68, 91, 33, 5.2, TEA.deep)
    paintBox(
      buf,
      34,
      84,
      102,
      96,
      (x, y) => {
        if (ell(x, y, 68, 90, 33, 5) > 1) return null
        if (ell(x, y, 68, 90, 31.5, 3.9) > 1)
          return x < 60 ? TEA.goldLight : TEA.gold
        if (ell(x, y, 68, 90, 19, 2.4) <= 1) return TEA.shade
        return TEA.china
      },
      (x, y) => (y >= 90 ? TEA.line : null)
    )
    // Handle, behind the cup's left side.
    paintBox(
      buf,
      38,
      76,
      50,
      88,
      (x, y) => {
        if (ell(x, y, 45.5, 81.5, 5.2, 5) > 1) return null
        if (ell(x, y, 45.5, 81.5, 2.8, 2.6) <= 1) return null
        if (x > 47) return null
        return y > 83 ? TEA.shade : x < 42 ? TEA.china : TEA.light
      },
      () => TEA.line
    )
    // The inside: the far wall lit, the bottom in shadow; the far rim gilt.
    paintBox(buf, 44, 70, 92, 80, (x, y) => {
      if (ell(x, y, 68, CUP_Y, CUP_RX, CUP_RY) > 1) return null
      const yc = y + 0.5
      if (ell(x, y, 68, CUP_Y, CUP_IN_RX, CUP_IN_RY) <= 1)
        return yc < CUP_Y - 1 ? TEA.inside : TEA.insideDeep
      if (yc > CUP_Y) return null
      return yc < CUP_Y - 3 ? TEA.goldLight : TEA.gold
    })
  },
  clam(buf) {
    floorShadow(buf, 68, 92, 29, 3)
    paintBox(buf, 36, 50, 100, 80, clamUpper, () => CLAM.outline)
    paintBox(buf, 40, 76, 96, 86, clamInside)
    paintBox(buf, 39, 81, 97, 94, clamLower, (x, y) =>
      y >= 82 ? CLAM.outline : null
    )
    bubble(buf, 89, 80.5, 2.4, CLAM.pearl, CLAM.pearlRim, CLAM.pearlGlint)
  },
  rowboat(buf) {
    floorShadow(buf, 67, 92.5, 30, 2.8, 0.75)
    paintBox(buf, 36, 68, 100, 82, boatInside, (x, y) =>
      y < 78 ? BOAT.outline : null
    )
    // The oar, resting on the far gunwale and leaning out past the bow.
    const deg = (Math.atan2(12, 42) * 180) / Math.PI
    paintBox(
      buf,
      30,
      56,
      90,
      78,
      (x, y) => {
        if (inTilted(x, y, 39.5, 61, 6.5, 2.4, deg))
          return x < 37 ? BOAT.oarTip : y < 61 ? BOAT.oar : BOAT.oarShade
        if (nearSegment(x, y, 46, 63, 88, 75, 0.85))
          return nearSegment(x, y, 46, 62.5, 88, 74.5, 0.5)
            ? BOAT.oar
            : BOAT.oarShade
        return null
      },
      () => BOAT.outline
    )
  },
  donut(buf) {
    floorShadow(buf, 68, 92.5, 27, 2.6)
    paintBox(buf, 40, 69, 96, 94, donutAt, () => DONUT.outline)
  },
  pouf(buf) {
    floorShadow(buf, 68, 94, 27, 2.6)
    paintBox(buf, 40, 73, 96, 96, poufAt, () => POUF.piping)
  },
  nest(buf) {
    floorShadow(buf, 68, 89, 31, 4.5)
    // Moss, speckled.
    fillEllipse(buf, 68, 84, 25, 5.5, NEST.moss)
    const r = createRng(23)
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2
      const rr = Math.sqrt(r())
      const x = 68 + Math.cos(a) * rr * 23
      const y = 84 + Math.sin(a) * rr * 4.6
      plot(buf, x, y, r() < 0.5 ? NEST.mossLight : NEST.mossDark)
    }
    feather(buf, 47, 81, 39, 70, NEST.white, NEST.whiteShade, NEST.quill)
    feather(
      buf,
      88,
      80,
      95,
      71,
      NEST.brown,
      mix(NEST.brown, NEST.brownDark, 0.4),
      NEST.brownDark,
      NEST.brownDark
    )
    for (const p of PEBBLES) if (!p.front) drawPebble(buf, p)
  },
  cheese(buf) {
    floorShadow(buf, 68, 93, 28, 2.8)
    paintBox(buf, 40, 72, 96, 98, cheeseAt, () => CHEESE.outline)
  },
  hammock(buf) {
    floorShadow(buf, 68, 92, 22, 2.4, 0.84)
    hammockStand(buf, 33, -1)
    hammockStand(buf, 101, 1)
    // Ropes fan from each post to the cloth's gathered end.
    for (const [px, ex] of [
      [34, HM_X0],
      [102, HM_X1],
    ] as const) {
      for (const ey of [72, 74.5, 77]) line(buf, px, 65, ex, ey, HAMMOCK.rope)
    }
    paintBox(buf, HM_X0, 70, HM_X1, 82, hammockInside)
  },
  bread(buf) {
    floorShadow(buf, 68, 91.5, 29, 2.8)
    paintBox(buf, 38, 72, 98, 94, loafAt, (x, y) =>
      y > 76 ? BREAD.crustDark : mix(BREAD.crustDark, BREAD.crust, 0.3)
    )
    const r = createRng(31)
    for (let i = 0; i < 14; i++) {
      const x = 42 + r() * 52
      const y = 76 + r() * 4 + Math.abs(x - 68) * 0.12
      if (loafAt(Math.floor(x), Math.floor(y)) !== null)
        plot(buf, x, y, BREAD.flour)
    }
  },
  bathtub(buf) {
    floorShadow(buf, 68, 93.5, 27, 2.4)
    // Back feet, peeking out behind the front ones.
    clawFoot(buf, 55, false)
    clawFoot(buf, 81, true)
    // Gold gooseneck tap at the left end, with two cross handles.
    paintBox(
      buf,
      38,
      64,
      50,
      77,
      (x, y) => {
        if (nearSegment(x, y, 43, 76, 43, 68, 0.9))
          return x < 43 ? TUB.goldLight : TUB.gold
        if (nearSegment(x, y, 43.5, 66.5, 47, 66.5, 0.9))
          return y < 66 ? TUB.goldLight : TUB.gold
        if (nearSegment(x, y, 47.5, 67, 47.5, 69, 0.6)) return TUB.goldDark
        if (y === 73 && x >= 39 && x <= 47 && x !== 43)
          return (x & 1) === 0 ? TUB.gold : TUB.goldLight
        return null
      },
      (x, y) => (y < 77 ? TUB.goldDark : null)
    )
    // The rim's far half and the inside.
    paintBox(
      buf,
      38,
      72,
      98,
      80,
      (x, y) => {
        if (tubPlan(x, y, TUB_RX, TUB_RY) > 1) return null
        const yc = y + 0.5
        if (tubPlan(x, y, TUB_IN_RX, TUB_IN_RY) <= 1) return TUB.inside
        if (yc > TUB_Y) return null
        return x < 60 ? TUB.light : TUB.enamel
      },
      (x, y) => (y < TUB_Y ? TUB.outline : null)
    )
    // Froth heaped behind the pet, loose bubbles, and a duck.
    for (const [x, y, r] of FROTH_BACK) froth(buf, x, y, r)
    rubberDuck(buf, 90, 68.5)
    ring(buf, 47, 62, BUBBLE_RING)
    ring(buf, 92, 60, BUBBLE_RING_SMALL)
    ring(buf, 41, 57, BUBBLE_RING_SMALL)
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
  teacup(buf) {
    paintBox(buf, 44, 76, 92, 92, cupFront, (x, y) =>
      y > CUP_Y + 1 && ell(x, y, 68, CUP_Y, CUP_IN_RX, CUP_IN_RY) > 1
        ? TEA.line
        : null
    )
  },
  rowboat(buf) {
    paintBox(buf, 36, 72, 100, 93, boatHull, boatEdge)
  },
  donut(buf) {
    paintBox(
      buf,
      40,
      69,
      96,
      94,
      (x, y) => (y + 0.5 > donutCut(x) ? donutAt(x, y) : null),
      (x, y) => (y + 0.5 > donutCut(x) + 0.5 ? DONUT.outline : null)
    )
  },
  nest(buf) {
    for (const p of PEBBLES) if (p.front) drawPebble(buf, p)
  },
  hammock(buf) {
    paintBox(buf, HM_X0, 72, HM_X1, 88, hammockFront, hammockEdge)
    // Fringe along the belly.
    for (let x = HM_X0 + 3; x <= HM_X1 - 3; x += 2) {
      const yb = hmBelly(hmU(x)) + 1
      plot(buf, x, yb, HAMMOCK.cream)
      if (x % 4 === 1) plot(buf, x, yb + 1, HAMMOCK.ropeShade)
    }
  },
  bathtub(buf) {
    paintBox(buf, 39, 76, 97, 92, tubFront, (x, y) =>
      y + 0.5 > TUB_Y + 1 && tubPlan(x, y, TUB_IN_RX, TUB_IN_RY) > 1
        ? TUB.outline
        : null
    )
    clawFoot(buf, 47, false)
    clawFoot(buf, 89, true)
    for (const [x, y, r] of FROTH_FRONT) froth(buf, x, y, r)
    for (const [x, y] of IRIDESCENT) plot(buf, x, y, TUB.foamGlint)
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
