/**
 * Colors for badge medallions. Dependency-free (type imports only) so the React
 * Native renderer and `scripts/badges/preview-badges.mjs` share it.
 *
 * Every level keeps one illustration; only the frame metal, the field tint and
 * the role colors change. One-time Badges use a teal enamel frame so they never
 * read as a level, and locked levels drop all color.
 */
import type { BadgeLevel } from '@/types/badges'
import type { EmblemRole } from './emblems'

export type BadgeScheme = 'light' | 'dark'
export type BadgeArtState = 'earned' | 'locked'

export type GradientStop = { offset: number; color: string; opacity?: number }

export type BadgePalette = {
  /** Outer rim, lit from the top-left. `null` = no rim fill (locked). */
  rim: GradientStop[] | null
  /** Thin inner bevel between rim and field, lit from the opposite side. */
  bevel: GradientStop[] | null
  /** Radial field gradient, center → edge. `null` = transparent. */
  field: GradientStop[] | null
  /** Hairline around the outer rim. */
  outline: string
  /** Dashed outline instead of a metal rim (locked). */
  dashed: boolean
  /** Colors for each emblem role. */
  roles: Record<EmblemRole, string>
  /** Fill colors that differ from `roles` (locked keeps fills faint). */
  fills?: Partial<Record<EmblemRole, string>>
  pip: { fill: string; stroke: string }
  /** Soft light sweep across the rim (Gold and Pearl). */
  sheen: GradientStop[] | null
  /** Fine engraved ring just inside the field edge (Gold and Pearl). */
  innerRing: string | null
  /** Opacity of the whole emblem group. */
  emblemOpacity: number
}

type LevelColors = {
  rim: [string, string, string]
  /** Optional iridescent stop for Pearl, placed between rim mid and dark. */
  rimSheen?: string
  bevel: [string, string]
  field: [string, string]
  outline: string
  ink: string
  metal: string
  metalDeep: string
  face: string
  pip: string
  pipStroke: string
  rich: boolean
}

const LEVELS: Record<BadgeScheme, Record<BadgeLevel, LevelColors>> = {
  light: {
    // Bronze
    1: {
      rim: ['#EDBE8E', '#D79A62', '#9C5B2E'],
      bevel: ['#8F522A', '#EBB988'],
      field: ['#FFF7EE', '#F4DCC4'],
      outline: '#87491F',
      ink: '#5A2F15',
      metal: '#D69456',
      metalDeep: '#A3612E',
      face: '#FFFBF6',
      pip: '#FFF4E6',
      pipStroke: '#6E3B19',
      rich: false,
    },
    // Silver
    2: {
      rim: ['#F1F4F6', '#D5DBE1', '#8D97A1'],
      bevel: ['#7D8893', '#E9EDF0'],
      field: ['#FCFDFE', '#E3E8ED'],
      outline: '#6F7A85',
      ink: '#2F3B47',
      metal: '#B3BEC8',
      metalDeep: '#6E7A86',
      face: '#FFFFFF',
      pip: '#FFFFFF',
      pipStroke: '#56616C',
      rich: false,
    },
    // Gold (muted antique, never the flat Supporter yellow)
    3: {
      rim: ['#F6E3A2', '#E9C766', '#A9821F'],
      bevel: ['#9A7518', '#F4DE92'],
      field: ['#FFFAEA', '#F5E5B6'],
      outline: '#82610F',
      ink: '#553D0B',
      metal: '#DEB94F',
      metalDeep: '#A47C1A',
      face: '#FFFDF4',
      pip: '#FFF9E6',
      pipStroke: '#6E520D',
      rich: true,
    },
    // Pearl
    4: {
      rim: ['#FDFBFF', '#E9E1F6', '#B4A4D9'],
      rimSheen: '#D3ECE8',
      bevel: ['#A090CC', '#F7F3FC'],
      field: ['#FFFFFF', '#EEE8F9'],
      outline: '#8A79BD',
      ink: '#3F3460',
      metal: '#C7BAE8',
      metalDeep: '#8471BA',
      face: '#FFFFFF',
      pip: '#FFFFFF',
      pipStroke: '#6E5DA6',
      rich: true,
    },
  },
  dark: {
    1: {
      rim: ['#F1C08F', '#E0A874', '#A9673A'],
      bevel: ['#93552C', '#F0C196'],
      field: ['#FBEEDF', '#EBCDAE'],
      outline: '#7E4520',
      ink: '#56300F',
      metal: '#D99A5E',
      metalDeep: '#A6632F',
      face: '#FFF8F0',
      pip: '#FFF4E6',
      pipStroke: '#6E3B19',
      rich: false,
    },
    2: {
      rim: ['#F5F7F9', '#E1E6EA', '#9AA4AE'],
      bevel: ['#86919B', '#EEF1F4'],
      field: ['#F5F7F9', '#DCE2E8'],
      outline: '#6C7782',
      ink: '#2C3844',
      metal: '#B4BFC9',
      metalDeep: '#6E7A86',
      face: '#FFFFFF',
      pip: '#FFFFFF',
      pipStroke: '#56616C',
      rich: false,
    },
    3: {
      rim: ['#F8E6A8', '#F0D27A', '#B48C2A'],
      bevel: ['#A07B1E', '#F7E3A0'],
      field: ['#FBF3DC', '#EFDCA6'],
      outline: '#7E5F10',
      ink: '#523A0A',
      metal: '#E0BC55',
      metalDeep: '#A67E1C',
      face: '#FFFCF0',
      pip: '#FFF9E6',
      pipStroke: '#6E520D',
      rich: true,
    },
    4: {
      rim: ['#FBF9FF', '#EEE8FA', '#B9AADF'],
      rimSheen: '#C2E6E0',
      bevel: ['#A394D0', '#F8F5FD'],
      field: ['#F9F7FD', '#E8E1F6'],
      outline: '#7C6BB0',
      ink: '#3D325E',
      metal: '#C9BCEA',
      metalDeep: '#8572BB',
      face: '#FFFFFF',
      pip: '#FFFFFF',
      pipStroke: '#6E5DA6',
      rich: true,
    },
  },
}

/** One-time Badges: teal enamel rim, ivory field. */
const ONE_TIME: Record<BadgeScheme, LevelColors> = {
  light: {
    rim: ['#1B7F8C', '#0B5560', '#063A42'],
    bevel: ['#05313A', '#2A8C99'],
    field: ['#FFFDF6', '#F3EBD9'],
    outline: '#042E35',
    ink: '#083C44',
    metal: '#7FC2C9',
    metalDeep: '#0F6873',
    face: '#FFFFFF',
    pip: '#FFFFFF',
    pipStroke: '#063A42',
    rich: false,
  },
  dark: {
    rim: ['#5ED3E0', '#1FB3C4', '#127A87'],
    bevel: ['#0F6A75', '#6FD8E4'],
    field: ['#FCF8EE', '#EDE3CD'],
    outline: '#0D5F69',
    ink: '#083C44',
    metal: '#7FC8D0',
    metalDeep: '#0F6873',
    face: '#FFFFFF',
    pip: '#FFFFFF',
    pipStroke: '#063A42',
    rich: false,
  },
}

/**
 * Locked levels: neutral line and motif colors from the app theme. `base` is
 * the card color, used as an opaque fill so hidden lines stay hidden once the
 * whole motif is faded.
 */
const LOCKED: Record<
  BadgeScheme,
  { line: string; motif: string; base: string }
> = {
  light: { line: '#B9B9B9', motif: '#373737', base: '#FFFFFF' },
  dark: { line: '#555555', motif: '#E2E2E2', base: '#1E1E1E' },
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

/** Mixes two `#RRGGBB` colors; `t` = share of `b`. */
const mix = (a: string, b: string, t: number) =>
  `#${hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`

const SHEEN: GradientStop[] = [
  { offset: 0, color: '#FFFFFF', opacity: 0 },
  { offset: 0.42, color: '#FFFFFF', opacity: 0 },
  { offset: 0.5, color: '#FFFFFF', opacity: 0.55 },
  { offset: 0.58, color: '#FFFFFF', opacity: 0 },
  { offset: 1, color: '#FFFFFF', opacity: 0 },
]

const fromColors = (c: LevelColors): BadgePalette => ({
  rim: c.rimSheen
    ? [
        { offset: 0, color: c.rim[0] },
        { offset: 0.34, color: c.rim[1] },
        { offset: 0.56, color: c.rimSheen },
        { offset: 0.8, color: c.rim[1] },
        { offset: 1, color: c.rim[2] },
      ]
    : [
        { offset: 0, color: c.rim[0] },
        { offset: 0.4, color: c.rim[1] },
        { offset: 1, color: c.rim[2] },
      ],
  bevel: [
    { offset: 0, color: c.bevel[0] },
    { offset: 1, color: c.bevel[1] },
  ],
  field: [
    { offset: 0, color: c.field[0] },
    { offset: 1, color: c.field[1] },
  ],
  outline: c.outline,
  dashed: false,
  roles: {
    ink: c.ink,
    metal: c.metal,
    metalDeep: c.metalDeep,
    face: c.face,
  },
  pip: { fill: c.pip, stroke: c.pipStroke },
  sheen: c.rich ? SHEEN : null,
  innerRing: c.rich ? c.metalDeep : null,
  emblemOpacity: 1,
})

const lockedPalette = (scheme: BadgeScheme): BadgePalette => {
  const { line, motif, base } = LOCKED[scheme]
  return {
    rim: null,
    bevel: null,
    field: null,
    outline: line,
    dashed: true,
    roles: {
      ink: motif,
      metal: mix(base, motif, 0.25),
      metalDeep: motif,
      face: base,
    },
    fills: { metalDeep: mix(base, motif, 0.5) },
    pip: { fill: line, stroke: 'none' },
    sheen: null,
    innerRing: null,
    emblemOpacity: 0.34,
  }
}

/** The palette for one medallion. `level: null` is a One-time Badge. */
export const badgePalette = (
  level: BadgeLevel | null,
  scheme: BadgeScheme,
  state: BadgeArtState = 'earned'
): BadgePalette => {
  if (state === 'locked') return lockedPalette(scheme)
  return fromColors(level === null ? ONE_TIME[scheme] : LEVELS[scheme][level])
}
