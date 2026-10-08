import { describe, expect, it } from 'vitest'
import {
  BADGE_COLLECTION_IDS,
  BADGE_LEVELS,
  ONE_TIME_BADGE_IDS,
  type BadgeLevel,
} from '@/types/badges'
import { BADGE_EMBLEMS, EMBLEM_BOX, type EmblemPart } from './emblems'
import { badgePalette, type BadgeArtState, type BadgeScheme } from './palette'
import { MEDALLION, pipPositions } from './medallion'

const ART_IDS = [...BADGE_COLLECTION_IDS, ...ONE_TIME_BADGE_IDS]
const SCHEMES: BadgeScheme[] = ['light', 'dark']
const STATES: BadgeArtState[] = ['earned', 'locked']
const LEVELS: (BadgeLevel | null)[] = [...BADGE_LEVELS, null]

/** Every coordinate pair a path visits (endpoints and control points). */
const pathPoints = (d: string) => {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? []
  const points: [number, number][] = []
  let cmd = ''
  let x = 0
  let y = 0
  let i = 0
  const n = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++]
      if (cmd === 'Z') continue
    }
    const pairs = { M: 1, L: 1, C: 3, Q: 2 }[cmd as 'M' | 'L' | 'C' | 'Q']
    if (pairs) {
      for (let p = 0; p < pairs; p++) {
        x = n()
        y = n()
        points.push([x, y])
      }
    } else if (cmd === 'H') {
      x = n()
      points.push([x, y])
    } else if (cmd === 'V') {
      y = n()
      points.push([x, y])
    } else if (cmd === 'A') {
      i += 5
      x = n()
      y = n()
      points.push([x, y])
    } else {
      throw new Error(`Unexpected path command "${cmd}" in ${d}`)
    }
  }
  return points
}

const partPoints = (part: EmblemPart): [number, number][] =>
  part.type === 'circle'
    ? [
        [part.cx - part.r, part.cy],
        [part.cx + part.r, part.cy],
        [part.cx, part.cy - part.r],
        [part.cx, part.cy + part.r],
      ]
    : pathPoints(part.d)

describe('badge emblems', () => {
  it('has a non-empty illustration for every art id', () => {
    expect(Object.keys(BADGE_EMBLEMS).sort()).toEqual([...ART_IDS].sort())
    for (const art of ART_IDS) {
      expect(BADGE_EMBLEMS[art].length, art).toBeGreaterThan(0)
    }
  })

  it('uses non-empty, absolute-command paths', () => {
    for (const art of ART_IDS) {
      for (const part of BADGE_EMBLEMS[art]) {
        expect(
          part.fill ?? part.stroke,
          `${art} part has no paint`
        ).toBeTruthy()
        if (part.type !== 'path') continue
        expect(part.d.trim().length, art).toBeGreaterThan(0)
        expect(part.d, `${art} uses relative commands`).not.toMatch(/[a-y]/)
        expect(
          pathPoints(part.d).every(([x, y]) => Number.isFinite(x + y))
        ).toBe(true)
      }
    }
  })

  it('stays inside the emblem box and the round field', () => {
    // The field is a circle, so check distance from the center too.
    const fieldRadius =
      (MEDALLION.fieldR * EMBLEM_BOX) / MEDALLION.emblemSize - 2
    for (const art of ART_IDS) {
      for (const part of BADGE_EMBLEMS[art]) {
        for (const [x, y] of partPoints(part)) {
          expect(x, art).toBeGreaterThanOrEqual(0)
          expect(x, art).toBeLessThanOrEqual(EMBLEM_BOX)
          expect(y, art).toBeGreaterThanOrEqual(0)
          expect(y, art).toBeLessThanOrEqual(EMBLEM_BOX)
          expect(Math.hypot(x - 32, y - 32), art).toBeLessThanOrEqual(
            fieldRadius
          )
        }
      }
    }
  })

  it('only uses roles every palette defines', () => {
    const used = new Set(
      ART_IDS.flatMap((art) =>
        BADGE_EMBLEMS[art].flatMap((part) => [part.fill, part.stroke])
      ).filter((role) => role !== undefined)
    )
    for (const level of LEVELS) {
      for (const scheme of SCHEMES) {
        for (const state of STATES) {
          const palette = badgePalette(level, scheme, state)
          for (const role of used) {
            expect(
              palette.roles[role],
              `${level}/${scheme}/${state}/${role}`
            ).toMatch(/^#[0-9A-Fa-f]{6}$/)
          }
        }
      }
    }
  })
})

describe('badge palette and frame', () => {
  it('gives each level its own metal and One-time Badges a distinct frame', () => {
    for (const scheme of SCHEMES) {
      const rims = LEVELS.map((level) =>
        JSON.stringify(badgePalette(level, scheme).rim)
      )
      expect(new Set(rims).size).toBe(LEVELS.length)
    }
  })

  it('draws locked levels as a dashed outline without metal', () => {
    const palette = badgePalette(3, 'light', 'locked')
    expect(palette.rim).toBeNull()
    expect(palette.field).toBeNull()
    expect(palette.dashed).toBe(true)
    expect(palette.emblemOpacity).toBeLessThan(0.5)
  })

  it('centers one to four pips along the bottom of the rim', () => {
    for (const count of BADGE_LEVELS) {
      const pips = pipPositions(count)
      expect(pips).toHaveLength(count)
      const meanX = pips.reduce((sum, p) => sum + p.cx, 0) / count
      expect(meanX).toBeCloseTo(MEDALLION.center, 5)
      for (const pip of pips) expect(pip.cy).toBeGreaterThan(MEDALLION.center)
    }
  })
})
