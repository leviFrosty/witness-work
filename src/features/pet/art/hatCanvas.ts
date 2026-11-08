import {
  createBuffer,
  type FeaturePixel,
  type Paint,
  type PixelBuffer,
  type Shape,
} from '@/lib/pixelArt'

export const BIG_HAT_W = 48

export const BIG_HAT_H = 56

export const BIG_HAT_CX = BIG_HAT_W / 2

export const BIG_HAT_BRIM_ROW = 52

const BASE = BIG_HAT_BRIM_ROW + 0.9

export type Tones = readonly [c: string, s?: string, h?: string]

type Opts = {
  readonly g?: string
  readonly edge?: boolean
  readonly no?: boolean
  readonly k?: string
  readonly a?: number
}

const color = (hex: string): number => parseInt(hex.slice(1), 16)

const tones = ([c, s, h]: Tones) => ({
  c: color(c),
  ...(s ? { s: color(s) } : {}),
  ...(h ? { h: color(h) } : {}),
})

const toCanvas = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([d, u]) => [BIG_HAT_CX + d, BASE - u] as const)

export const poly = (
  pts: readonly (readonly [number, number])[],
  t: Tones,
  opts: Omit<Opts, 'a'> = {}
): Shape => ({ t: 'p', pts: toCanvas(pts), ...tones(t), ...opts })

export const ell = (
  d: number,
  u: number,
  rx: number,
  ry: number,
  t: Tones,
  opts: Opts = {}
): Shape => ({
  t: 'e',
  x: BIG_HAT_CX + d,
  y: BASE - u,
  rx,
  ry,
  ...tones(t),
  ...opts,
})

export const box = (
  d0: number,
  u0: number,
  d1: number,
  u1: number,
  t: Tones,
  opts: Omit<Opts, 'a'> = {}
): Shape =>
  poly(
    [
      [d0, u0],
      [d1, u0],
      [d1, u1],
      [d0, u1],
    ],
    t,
    opts
  )

export const feat = (d: number, u: number, c: string): FeaturePixel => [
  BIG_HAT_CX + d,
  BASE - u,
  color(c),
]

export function domeOf(
  d: number,
  base: number,
  rx: number,
  ry: number,
  steps = 16
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI * (i / steps)
    pts.push([d - rx * Math.cos(a), base + ry * Math.sin(a)])
  }
  return pts
}

export const paint = (
  pts: readonly (readonly [number, number])[],
  t: Tones,
  on: readonly string[]
): Paint => ({ t: 'p', pts: toCanvas(pts), ...tones(t), on })

export const bigHatCanvas = (): PixelBuffer =>
  createBuffer(BIG_HAT_W, BIG_HAT_H)

export const bigHatPoint = (d: number, u: number): [number, number] => [
  BIG_HAT_CX + d,
  BASE - u,
]
