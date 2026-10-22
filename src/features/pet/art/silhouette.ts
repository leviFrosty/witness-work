/**
 * A locked secret option's thumbnail: its shape as a flat shadow over a dimmed
 * room, so it hints at what's coming without showing its colours or details.
 */
import { createBuffer, rgb, rgbTuple, type PixelBuffer } from '@/lib/pixelArt'

/** `object`: one flat shadow. `surface`: two tones, so a pattern still reads. */
export type SilhouetteStyle = 'object' | 'surface'

const INK = rgbTuple(rgb('#2c2834'))
const INK_LIGHT = rgbTuple(rgb('#4a4357'))

/**
 * How far apart (per channel) two pixels may be and still count as the same
 * thing: the lamp lights each option's room from its own flame, so a table or a
 * plant shifts a light band between references.
 */
const NEAR = 40
/** Rounding, per channel, when matching a shift in the lamp's light. */
const SLACK = 3
/**
 * Gaps a shape encloses, up to this many pixels, are filled unless the room
 * shows through most of them.
 */
const MAX_HOLE = 160
/** Gaps a surface encloses, up to this many pixels, are filled. */
const MAX_GAP = 12
/** Loose bits of a shape up to this many pixels are dropped. */
const MAX_SPECK = 2
/** Pinholes in a shape up to this many pixels are always filled. */
const MAX_PINHOLE = 4
/**
 * Under another lamp's light, at least this share of the bare room is a shade
 * lighter or darker.
 */
const RELIT_SHARE = 0.03
/** How far around a floor's pixel its tone looks. */
const TONE_RADIUS = 4
/** A plain reference matches at least this share of a surface. */
const PLAIN_SHARE = 0.15

const luma = (d: Uint8ClampedArray, i: number) =>
  0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]

const sameAt = (a: PixelBuffer, b: PixelBuffer, i: number) =>
  a.data[i] === b.data[i] &&
  a.data[i + 1] === b.data[i + 1] &&
  a.data[i + 2] === b.data[i + 2] &&
  a.data[i + 3] === b.data[i + 3]

/** The night tint and the lamp's warm light (`art/lighting.ts`), per channel. */
const TINT = [16, 14, 40] as const
const WARM = [255, 150, 40] as const

/**
 * Whether two pixels could be the same thing in a different band of the lamp's
 * light: their difference (at most `NEAR` per channel) is the colour darkened
 * toward the night tint plus some warm light, to within rounding.
 */
function litAlike(a: PixelBuffer, b: PixelBuffer, i: number): boolean {
  const x = a.data
  const y = b.data
  if (x[i + 3] !== y[i + 3]) return false
  let dr = x[i] - y[i]
  let dg = x[i + 1] - y[i + 1]
  let db = x[i + 2] - y[i + 2]
  if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > NEAR) return false
  // As a brightening: d ≈ s·u + t·WARM with s, t ≥ 0.
  if (dr + dg + db < 0) {
    dr = -dr
    dg = -dg
    db = -db
  }
  const ur = (x[i] + y[i]) / 2 - TINT[0]
  const ug = (x[i + 1] + y[i + 1]) / 2 - TINT[1]
  const ub = (x[i + 2] + y[i + 2]) / 2 - TINT[2]
  const [wr, wg, wb] = WARM
  const fits = (s: number, t: number) =>
    Math.abs(dr - s * ur - t * wr) <= SLACK &&
    Math.abs(dg - s * ug - t * wg) <= SLACK &&
    Math.abs(db - s * ub - t * wb) <= SLACK
  const uu = ur * ur + ug * ug + ub * ub
  const ww = wr * wr + wg * wg + wb * wb
  const uw = ur * wr + ug * wg + ub * wb
  const du = dr * ur + dg * ug + db * ub
  const dw = dr * wr + dg * wg + db * wb
  if (fits(uu ? Math.max(0, du / uu) : 0, 0)) return true
  if (fits(0, Math.max(0, dw / ww))) return true
  const det = uu * ww - uw * uw
  if (det <= 1e-6) return false
  const s = (du * ww - dw * uw) / det
  const t = (dw * uu - du * uw) / det
  return s >= 0 && t >= 0 && fits(s, t)
}

/**
 * Flips each connected run of `value` in `mask` (4-connected for gaps, 0;
 * 8-connected for bits of shape, 1) to the other value when `flip` says so,
 * given its pixels and whether it reaches the edge of the view. Transparent
 * pixels never change.
 */
function flipRuns(
  mask: Uint8Array,
  shown: PixelBuffer,
  value: 0 | 1,
  flip: (run: readonly number[], edge: boolean) => boolean
): void {
  const diagonal = value === 1
  const { width, height } = shown
  const seen = new Uint8Array(mask.length)
  const run: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || mask[start] !== value) continue
    if (shown.data[start * 4 + 3] === 0) continue
    run.length = 0
    run.push(start)
    seen[start] = 1
    let edge = false
    for (let k = 0; k < run.length; k++) {
      const p = run[k]
      const x = p % width
      const y = (p - x) / width
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          if (!diagonal && dx && dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const q = ny * width + nx
          if (seen[q] || mask[q] !== value) continue
          if (shown.data[q * 4 + 3] === 0) continue
          seen[q] = 1
          run.push(q)
        }
      }
    }
    if (flip(run, edge)) for (const p of run) mask[p] = 1 - value
  }
}

/**
 * An object's own pixels: those it keeps over another backdrop
 * (`references[0]`, so not the bare wall or floor showing around it, even where
 * every other option covers it) that no other option shares (`references[1…]`,
 * so not the pet, the table or anything else that's in each of their rooms;
 * under another lamp, "shares" means two of them have it in another band of
 * light). Then enclosed gaps are filled unless the room shows through them, and
 * loose specks dropped.
 */
function objectPixels(
  shown: PixelBuffer,
  references: readonly PixelBuffer[]
): Uint8Array {
  const [backdrop, ...others] = references
  const n = shown.width * shown.height
  const own = new Uint8Array(n)
  // An option lit by its own lamp (the lamp's options) matches the room only
  // loosely; under the same light the bare wall and floor match exactly.
  const loose = others.map((ref) => {
    let bare = 0
    let relit = 0
    for (let p = 0; p < n; p++) {
      const i = p * 4
      if (!backdrop || sameAt(shown, backdrop, i)) continue
      bare++
      if (!sameAt(shown, ref, i) && litAlike(shown, ref, i)) relit++
    }
    return relit > bare * RELIT_SHARE
  })
  // With one or two others, sharing a pixel with any one means it's the room.
  const shared = others.length > 2 ? 2 : 1
  const alikeAt = (k: number, i: number) =>
    sameAt(shown, others[k], i) || (loose[k] && litAlike(shown, others[k], i))
  // The bare room that another option shows too: a real gap in the shape,
  // not glass or a flame that happens to match.
  const seeThrough = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const i = p * 4
    if (shown.data[i + 3] === 0) continue
    if (backdrop && !sameAt(shown, backdrop, i)) {
      for (let k = 0; k < others.length; k++) {
        if (alikeAt(k, i)) {
          seeThrough[p] = 1
          break
        }
      }
      continue
    }
    // An exact match is the room; a loose one counts only with a second.
    let alike = 0
    for (let k = 0; k < others.length && alike < shared; k++) {
      if (sameAt(shown, others[k], i)) alike = shared
      else if (loose[k] && litAlike(shown, others[k], i)) alike++
    }
    if (alike < shared) own[p] = 1
  }
  flipRuns(own, shown, 0, (run, edge) => {
    if (edge || run.length > MAX_HOLE) return false
    if (run.length <= MAX_PINHOLE) return true
    let open = 0
    for (const p of run) open += seeThrough[p]
    return open * 2 < run.length
  })
  flipRuns(own, shown, 1, (run) => run.length <= MAX_SPECK)
  return own
}

/**
 * Per pixel, whether it's lighter than the average of the `mask` pixels within
 * `radius` (a summed-area table, so the sunbeam and the lamp's light bands
 * don't decide the tone, only what's next to it).
 */
function lighterThanAround(
  shown: PixelBuffer,
  mask: Uint8Array,
  radius: number
): Uint8Array {
  const { width, height } = shown
  const w1 = width + 1
  const sum = new Float64Array(w1 * (height + 1))
  const count = new Float64Array(w1 * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    let rowCount = 0
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (mask[p]) {
        rowSum += luma(shown.data, p * 4)
        rowCount++
      }
      const k = (y + 1) * w1 + x + 1
      sum[k] = sum[k - w1] + rowSum
      count[k] = count[k - w1] + rowCount
    }
  }
  const box = (
    t: Float64Array,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => t[y1 * w1 + x1] - t[y0 * w1 + x1] - t[y1 * w1 + x0] + t[y0 * w1 + x0]
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (!mask[p]) continue
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const mean = box(sum, x0, y0, x1, y1) / box(count, x0, y0, x1, y1)
      out[p] = luma(shown.data, p * 4) > mean + 0.5 ? 1 : 0
    }
  }
  return out
}

/**
 * A surface's own pixels (those that differ from any reference: the same view
 * with another colour or floor), and which of them take the light tone. When a
 * reference shows the same surface plain, the pixels that differ from it are
 * the pattern; otherwise (floors) the ones lighter than what's around them.
 */
function surfacePixels(
  shown: PixelBuffer,
  references: readonly PixelBuffer[]
): { own: Uint8Array; light: Uint8Array } {
  const n = shown.width * shown.height
  const own = new Uint8Array(n)
  let count = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    if (shown.data[i + 3] === 0) continue
    if (references.some((ref) => !sameAt(shown, ref, i))) {
      own[p] = 1
      count++
    }
  }
  let plain: PixelBuffer | null = null
  let best = 0
  for (const ref of references) {
    let same = 0
    for (let p = 0; p < n; p++) if (own[p] && sameAt(shown, ref, p * 4)) same++
    if (same > best) {
      best = same
      plain = ref
    }
  }
  let light: Uint8Array
  if (plain && best >= count * PLAIN_SHARE) {
    light = new Uint8Array(n)
    for (let p = 0; p < n; p++) {
      if (own[p] && !sameAt(shown, plain, p * 4)) light[p] = 1
    }
  } else {
    light = lighterThanAround(shown, own, TONE_RADIUS)
  }
  flipRuns(own, shown, 0, (run, edge) => !edge && run.length <= MAX_GAP)
  return { own, light }
}

/**
 * `shown` with the option's own pixels as a shadow and the rest of the room
 * greyed and faded. All buffers are the same size; `references` are the same
 * view with other choices (`silhouetteRooms` in `lib/roomOptions.ts`):
 *
 * - `object`: first the option over another backdrop, then other options of its
 *   part. Small gaps inside the shape are filled and loose pixels dropped.
 * - `surface`: the same view with other colours or floors, and (walls) the same
 *   wall plain, whose differences become the light tone.
 */
export function silhouetteOf(
  shown: PixelBuffer,
  references: readonly PixelBuffer[],
  style: SilhouetteStyle
): PixelBuffer {
  const { width, height } = shown
  const out = createBuffer(width, height)
  const n = width * height
  const { own, light } =
    style === 'surface'
      ? surfacePixels(shown, references)
      : { own: objectPixels(shown, references), light: null }
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const alpha = shown.data[i + 3]
    if (alpha === 0) continue
    if (references.length && own[p]) {
      const ink = light?.[p] ? INK_LIGHT : INK
      out.data[i] = ink[0]
      out.data[i + 1] = ink[1]
      out.data[i + 2] = ink[2]
    } else {
      // Grey, low contrast, lifted toward the middle so the shadow stands out.
      const grey = Math.round(luma(shown.data, i) * 0.45 + 120)
      out.data[i] = grey
      out.data[i + 1] = grey
      out.data[i + 2] = grey
    }
    out.data[i + 3] = alpha
  }
  return out
}
