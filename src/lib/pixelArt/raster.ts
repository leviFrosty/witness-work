import { createBuffer, type PixelBuffer } from './buffer'
import { shadeOf, type Rgb } from './color'

export interface ShapeTones {
  readonly c: Rgb

  readonly s?: Rgb

  readonly h?: Rgb
}

export interface ShapeOptions extends ShapeTones {
  readonly g?: string

  readonly edge?: boolean

  readonly no?: boolean

  readonly k?: string
}

export interface EllipseShape extends ShapeOptions {
  readonly t: 'e'
  readonly x: number
  readonly y: number
  readonly rx: number
  readonly ry: number
  readonly a?: number
}

export interface PolygonShape extends ShapeOptions {
  readonly t: 'p'
  readonly pts: readonly (readonly [number, number])[]
}

export type Shape = EllipseShape | PolygonShape

export type Paint = Shape & { readonly on: readonly string[] }

export type FeaturePixel = readonly [x: number, y: number, c: Rgb]

export interface ShapeSpec {
  readonly shapes: readonly Shape[]
  readonly paints?: readonly Paint[]
  readonly feats?: readonly FeaturePixel[]
}

interface Prepared {
  readonly shape: Shape
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly cos: number
  readonly sin: number
  readonly cx: number
  readonly cy: number
  readonly hw: number
  readonly hh: number
}

function prepare(s: Shape): Prepared {
  if (s.t === 'e') {
    const rad = ((s.a ?? 0) * Math.PI) / 180
    const r = s.a ? Math.max(s.rx, s.ry) : 0
    const ex = s.a ? r : s.rx
    const ey = s.a ? r : s.ry
    return {
      shape: s,
      x0: Math.floor(s.x - ex - 1),
      y0: Math.floor(s.y - ey - 1),
      x1: Math.ceil(s.x + ex + 1),
      y1: Math.ceil(s.y + ey + 1),
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      cx: s.x,
      cy: s.y,
      hw: s.rx,
      hh: s.ry,
    }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of s.pts) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return {
    shape: s,
    x0: Math.floor(minX - 1),
    y0: Math.floor(minY - 1),
    x1: Math.ceil(maxX + 1),
    y1: Math.ceil(maxY + 1),
    cos: 1,
    sin: 0,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    hw: (maxX - minX) / 2 || 1,
    hh: (maxY - minY) / 2 || 1,
  }
}

let hitX = 0
let hitY = 0

function hit(p: Prepared, px: number, py: number): boolean {
  const s = p.shape
  if (s.t === 'e') {
    if (s.rx === 0 || s.ry === 0) return false
    let dx = px - s.x
    let dy = py - s.y
    if (s.a) {
      const rx = dx * p.cos + dy * p.sin
      dy = -dx * p.sin + dy * p.cos
      dx = rx
    }
    const nx = dx / s.rx
    const ny = dy / s.ry
    if (nx * nx + ny * ny > 1) return false
    hitX = nx
    hitY = ny
    return true
  }
  const pts = s.pts
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const yi = pts[i][1]
    const xj = pts[j][0]
    const yj = pts[j][1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  if (!inside) return false
  hitX = (px - p.cx) / p.hw
  hitY = (py - p.cy) / p.hh
  return true
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function rasterize(
  spec: ShapeSpec,
  width: number,
  height: number
): PixelBuffer {
  const shapes = spec.shapes
  const paints = (spec.paints ?? []).map((p) => ({
    paint: p,
    prep: prepare(p),
  }))
  const n = width * height
  const col = new Int32Array(n).fill(-1)
  const own = new Int16Array(n).fill(-1)

  const groupIds = new Map<string, number>()
  const group = new Int32Array(shapes.length)
  const edge = new Uint8Array(shapes.length)
  const noOutline = new Uint8Array(shapes.length)

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]
    if (s.g !== undefined) {
      let id = groupIds.get(s.g)
      if (id === undefined) {
        id = shapes.length + groupIds.size
        groupIds.set(s.g, id)
      }
      group[i] = id
    } else {
      group[i] = i
    }
    edge[i] = s.edge ? 1 : 0
    noOutline[i] = s.no ? 1 : 0

    const p = prepare(s)
    const x0 = Math.max(0, p.x0)
    const y0 = Math.max(0, p.y0)
    const x1 = Math.min(width - 1, p.x1)
    const y1 = Math.min(height - 1, p.y1)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        if (!hit(p, px, py)) continue
        const nx = hitX
        const ny = hitY
        const tone =
          s.s !== undefined && nx * 0.45 + ny * 0.85 > 0.52
            ? 1
            : s.h !== undefined && -nx * 0.5 - ny * 0.85 > 0.6
              ? 2
              : 0
        let src: ShapeTones = s
        if (s.k !== undefined) {
          for (const { paint, prep } of paints) {
            if (paint.on.includes(s.k) && hit(prep, px, py)) src = paint
          }
        }
        const k = y * width + x
        col[k] =
          tone === 1 ? (src.s ?? src.c) : tone === 2 ? (src.h ?? src.c) : src.c
        own[k] = i
      }
    }
  }

  const out = new Int32Array(col)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x
      const i = own[k]
      if (i >= 0) {
        if (!edge[i]) continue
        for (const [dx, dy] of NEIGHBOURS) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          const j = own[yy * width + xx]
          if (j >= 0 && j < i && group[j] !== group[i] && !noOutline[j]) {
            out[k] = shadeOf(col[k], 0.66)
            break
          }
        }
      } else {
        for (const [dx, dy] of NEIGHBOURS) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          const j = own[yy * width + xx]
          if (j >= 0 && !noOutline[j]) {
            out[k] = shadeOf(col[yy * width + xx], 0.42)
            break
          }
        }
      }
    }
  }

  for (const [fx, fy, c] of spec.feats ?? []) {
    const xi = Math.round(fx)
    const yi = Math.round(fy)
    if (xi >= 0 && yi >= 0 && xi < width && yi < height)
      out[yi * width + xi] = c
  }

  const buf = createBuffer(width, height)
  const d = buf.data
  for (let k = 0; k < n; k++) {
    const c = out[k]
    if (c < 0) continue
    d[k * 4] = (c >> 16) & 255
    d[k * 4 + 1] = (c >> 8) & 255
    d[k * 4 + 2] = c & 255
    d[k * 4 + 3] = 255
  }
  return buf
}
