/**
 * The shared medallion frame: geometry plus a renderer-agnostic scene, so the
 * React Native renderer and the HTML preview draw exactly the same thing.
 * Dependency-free (type imports only).
 *
 * Frame coordinates use a 0..100 viewBox. The 64-unit emblem box sits in the
 * middle of the field (see `EMBLEM_TRANSFORM`).
 */
import type { EmblemPart } from './emblems'
import type { BadgePalette, GradientStop } from './palette'

export const MEDALLION_VIEWBOX = 100

export const MEDALLION = {
  center: 50,
  /** Outer edge of the metal rim. */
  rimR: 48,
  /** Outer edge of the inner bevel ring. */
  bevelR: 41.8,
  /** Edge of the field (inside the bevel). */
  fieldR: 40.2,
  /** Fine engraved ring inside the field (rich levels only). */
  innerRingR: 37.6,
  outlineWidth: 1.2,
  /** Dashed outline for locked levels. */
  lockedR: 47,
  lockedWidth: 1.6,
  lockedDash: '3.4 3',
  /** Level pips sit on the rim band, centered at the bottom. */
  pipRingR: 44.9,
  pipR: 2.4,
  pipStepDeg: 10.5,
  /** Below this rendered size (px) pips are hidden. */
  pipMinSize: 30,
  /** Side of the 64-unit emblem box once placed in the frame. */
  emblemSize: 61,
} as const

/** The emblem's own coordinate space (mirrors `EMBLEM_BOX` in emblems.ts). */
const EMBLEM_UNITS = 64

const emblemScale = MEDALLION.emblemSize / EMBLEM_UNITS
const emblemOffset = (MEDALLION_VIEWBOX - MEDALLION.emblemSize) / 2

/** SVG transform that places the 64-unit emblem box inside the field. */
export const EMBLEM_TRANSFORM = `translate(${emblemOffset} ${emblemOffset}) scale(${emblemScale})`

/** Centers of `count` level pips along the bottom of the rim. */
export const pipPositions = (count: number) => {
  const { center, pipRingR, pipStepDeg } = MEDALLION
  return Array.from({ length: count }, (_, i) => {
    const deg = 90 + (i - (count - 1) / 2) * pipStepDeg
    const rad = (deg * Math.PI) / 180
    return {
      cx: round(center + pipRingR * Math.cos(rad)),
      cy: round(center + pipRingR * Math.sin(rad)),
    }
  })
}

const round = (n: number) => Math.round(n * 1000) / 1000

export type SceneGradient =
  | {
      kind: 'linear'
      id: string
      x1: number
      y1: number
      x2: number
      y2: number
      stops: GradientStop[]
    }
  | {
      kind: 'radial'
      id: string
      cx: number
      cy: number
      r: number
      fx: number
      fy: number
      stops: GradientStop[]
    }

export type SceneCircle = {
  type: 'circle'
  key: string
  cx: number
  cy: number
  r: number
  /** A color, `url(#id)`, or `'none'`. */
  fill: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
}

export type MedallionScene = {
  gradients: SceneGradient[]
  /** Drawn below the emblem. */
  back: SceneCircle[]
  /** Drawn above the emblem (pips). */
  front: SceneCircle[]
}

/**
 * Builds the frame for one medallion.
 *
 * @param idPrefix Unique per rendered instance; gradient ids derive from it.
 * @param pips Number of level pips to draw (0 to hide).
 */
export const medallionScene = (
  palette: BadgePalette,
  idPrefix: string,
  pips: number
): MedallionScene => {
  const { center: c } = MEDALLION
  const gradients: SceneGradient[] = []
  const back: SceneCircle[] = []
  const id = (name: string) => `${idPrefix}-${name}`
  const url = (name: string) => `url(#${id(name)})`

  if (palette.rim && palette.bevel) {
    gradients.push(
      {
        kind: 'linear',
        id: id('rim'),
        x1: 18,
        y1: 6,
        x2: 82,
        y2: 94,
        stops: palette.rim,
      },
      {
        kind: 'linear',
        id: id('bevel'),
        x1: 26,
        y1: 14,
        x2: 74,
        y2: 86,
        stops: palette.bevel,
      }
    )
    back.push(
      {
        type: 'circle',
        key: 'rim',
        cx: c,
        cy: c,
        r: MEDALLION.rimR,
        fill: url('rim'),
        stroke: palette.outline,
        strokeWidth: MEDALLION.outlineWidth,
      },
      {
        type: 'circle',
        key: 'bevel',
        cx: c,
        cy: c,
        r: MEDALLION.bevelR,
        fill: url('bevel'),
      }
    )
  } else {
    back.push({
      type: 'circle',
      key: 'rim',
      cx: c,
      cy: c,
      r: MEDALLION.lockedR,
      fill: 'none',
      stroke: palette.outline,
      strokeWidth: MEDALLION.lockedWidth,
      strokeDasharray: palette.dashed ? MEDALLION.lockedDash : undefined,
    })
  }

  if (palette.sheen) {
    gradients.push({
      kind: 'linear',
      id: id('sheen'),
      x1: 8,
      y1: 30,
      x2: 92,
      y2: 70,
      stops: palette.sheen,
    })
    back.push({
      type: 'circle',
      key: 'sheen',
      cx: c,
      cy: c,
      r: (MEDALLION.rimR + MEDALLION.bevelR) / 2,
      fill: 'none',
      stroke: url('sheen'),
      strokeWidth: MEDALLION.rimR - MEDALLION.bevelR - 0.6,
    })
  }

  if (palette.field) {
    gradients.push({
      kind: 'radial',
      id: id('field'),
      cx: c,
      cy: 40,
      r: 46,
      fx: c,
      fy: 34,
      stops: palette.field,
    })
    back.push({
      type: 'circle',
      key: 'field',
      cx: c,
      cy: c,
      r: MEDALLION.fieldR,
      fill: url('field'),
    })
  }

  if (palette.innerRing) {
    back.push({
      type: 'circle',
      key: 'innerRing',
      cx: c,
      cy: c,
      r: MEDALLION.innerRingR,
      fill: 'none',
      stroke: palette.innerRing,
      strokeWidth: 0.55,
      strokeDasharray: '0.1 1.6',
    })
  }

  const front: SceneCircle[] = pipPositions(pips).map((p, i) => ({
    type: 'circle',
    key: `pip${i}`,
    cx: p.cx,
    cy: p.cy,
    r: MEDALLION.pipR,
    fill: palette.pip.fill,
    stroke: palette.pip.stroke,
    strokeWidth: palette.pip.stroke === 'none' ? undefined : 0.75,
  }))

  return { gradients, back, front }
}

/** An emblem part with its roles resolved to concrete colors. */
export type ResolvedEmblemPart =
  | {
      type: 'path'
      key: string
      d: string
      fill: string
      stroke: string
      strokeWidth: number
      opacity?: number
    }
  | {
      type: 'circle'
      key: string
      cx: number
      cy: number
      r: number
      fill: string
      stroke: string
      strokeWidth: number
      opacity?: number
    }

/** Default emblem stroke (6.25% of the 64-unit box, close to Lucide weight). */
export const EMBLEM_STROKE = 4

/**
 * Maps role names to palette colors. `strokeScale` thickens lines slightly at
 * tiny sizes so the motif survives at 24 px.
 */
export const resolveEmblem = (
  parts: EmblemPart[],
  palette: BadgePalette,
  strokeScale = 1
): ResolvedEmblemPart[] =>
  parts.map((part, i) => {
    const fill = part.fill
      ? (palette.fills?.[part.fill] ?? palette.roles[part.fill])
      : 'none'
    const stroke = part.stroke ? palette.roles[part.stroke] : 'none'
    const strokeWidth = (part.strokeWidth ?? EMBLEM_STROKE) * strokeScale
    const key = `e${i}`
    if (part.type === 'circle') {
      return {
        type: 'circle',
        key,
        cx: part.cx,
        cy: part.cy,
        r: part.r,
        fill,
        stroke,
        strokeWidth,
        opacity: part.opacity,
      }
    }
    return {
      type: 'path',
      key,
      d: part.d,
      fill,
      stroke,
      strokeWidth,
      opacity: part.opacity,
    }
  })

/** Stroke boost for small renders: 1 at ≥ 64 px, up to 1.2 at 24 px. */
export const emblemStrokeScale = (size: number) => {
  if (size >= 64) return 1
  if (size <= 24) return 1.2
  return round(1 + (0.2 * (64 - size)) / 40)
}
