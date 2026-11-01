import type { EmblemPart } from './emblems'
import type { BadgePalette, GradientStop } from './palette'

export const MEDALLION_VIEWBOX = 100

export const MEDALLION = {
  center: 50,

  rimR: 48,

  bevelR: 41.8,

  fieldR: 40.2,

  innerRingR: 37.6,
  outlineWidth: 1.2,

  lockedR: 47,
  lockedWidth: 1.6,
  lockedDash: '3.4 3',

  pipRingR: 44.9,
  pipR: 2.4,
  pipStepDeg: 10.5,

  pipMinSize: 30,

  emblemSize: 61,
} as const

const EMBLEM_UNITS = 64

const emblemScale = MEDALLION.emblemSize / EMBLEM_UNITS
const emblemOffset = (MEDALLION_VIEWBOX - MEDALLION.emblemSize) / 2

export const EMBLEM_TRANSFORM = `translate(${emblemOffset} ${emblemOffset}) scale(${emblemScale})`

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

  fill: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
}

export type MedallionScene = {
  gradients: SceneGradient[]

  back: SceneCircle[]

  front: SceneCircle[]
}

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

export const EMBLEM_STROKE = 4

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

export const emblemStrokeScale = (size: number) => {
  if (size >= 64) return 1
  if (size <= 24) return 1.2
  return round(1 + (0.2 * (64 - size)) / 40)
}
