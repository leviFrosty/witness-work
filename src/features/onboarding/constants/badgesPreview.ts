import type { BadgeArtId, BadgeLevel } from '@/types/badges'

/**
 * The badges preview is authored in this design box and scaled to fit the step,
 * so every size below is in design units.
 */
export const STAGE = { width: 320, height: 248 }
/** Room the scene keeps from the card's edges, and its scale limits. */
export const STAGE_INSET = 10
export const STAGE_SCALE = { max: 1.15, compact: 0.86 }
/** Windows shorter than this (an iPhone SE) get the compact scale. */
export const COMPACT_WINDOW_HEIGHT = 720

/** The badge the preview pretends to earn: a first month of sharing. */
export const PREVIEW_BADGE: { art: BadgeArtId; level: BadgeLevel } = {
  art: 'monthsShared',
  level: 1,
}

export const TILE = { width: 150, height: 120, check: 52, padTop: 16 }
/** The center of the tile's checkbox, where the tap lands. */
export const TAP_POINT = {
  x: STAGE.width / 2,
  y: (STAGE.height - TILE.height) / 2 + TILE.padTop + TILE.check / 2,
}
/** Where the fingertip starts, relative to the tap point. */
export const FINGER_FROM = { x: 74, y: 82 }
export const FINGER_SIZE = 30

/**
 * The share chip overlaps only the card's bottom padding, so the card's last
 * line stays clear of it.
 */
export const CARD = { width: 252, padTop: 16, padX: 16, padBottom: 26 }
export const COIN_SIZE = 76
export const CHIP = { height: 36, avatar: 24, medal: 22, overlap: 8 }

/**
 * One pass of the story, in ms from the step appearing: the checkbox is tapped,
 * the New badge card springs up with the real medallion (its own spring and
 * sweep), confetti bursts, and a chip shows who else sees it. After `settle`
 * the card floats and the metal glints now and then. Reduce Motion shows the
 * `settle` frame.
 */
export const T = {
  tileIn: [0, 380],
  fingerIn: [650, 1100],
  press: [1120, 1200, 1420],
  check: [1180, 1520],
  ripple: [1160, 1680],
  fingerOut: [1340, 1640],
  tileOut: [1760, 2080],
  cardIn: [1820, 2340],
  /** `BadgeSpotlight`'s delay: it springs in and sweeps on its own clock. */
  coin: 1920,
  /** The medallion has landed: the one light haptic. */
  landed: 2150,
  glow: [1980, 2500],
  confetti: [2300, 3900],
  kicker: [2200, 2560],
  title: [2300, 2660],
  description: [2400, 2760],
  chip: [3100, 3580],
  chipMedal: [3460, 3820],
  settle: 3900,
} as const

/** The settled card's slow float, and how often its metal glints. */
export const FLOAT_MS = 4200
export const GLINT_FIRST_MS = 5400
export const GLINT_EVERY_MS = 5200
