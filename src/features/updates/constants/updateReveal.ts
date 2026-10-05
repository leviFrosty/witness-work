import type { TranslationKey } from '@/lib/locales'

/**
 * Returning installs that update from below this version to it (or past it) get
 * the update reveal on their first launch, instead of the usual What's New
 * announcement. A later Reveal update only needs to raise this: engagement is
 * stored against the version, so the new reveal starts fresh for everyone.
 */
export const UPDATE_REVEAL_VERSION = '1.44.0'

/**
 * What the release is called, wherever the reveal and What's New name it. Give
 * its `releaseNotes` entry `name: UPDATE_REVEAL_NAME` so the release wears the
 * same badge in What's New.
 */
export const UPDATE_REVEAL_NAME: TranslationKey = 'updateReveal_name'

/** Milliseconds from the moment the tile is ready to move. */
export interface RevealTimeline {
  revealAt: number
  revealFor: number
  orbitsAt: number
  orbitsFor: number
  /** The ring around the tile closes, like an install finishing. */
  ringAt: number
  ringFor: number
  /** The new features burst out of the tile as the ring closes. */
  burstAt: number
  headlineAt: number
  kickerAt: number
  /** The greeting gives way to the news. */
  newsAt: number
  ctaAt: number
  linkAt: number
  /** Tapping no longer hurries the intro. */
  doneAt: number
}

/** At launch: the splash collapses into the tile first. */
export const REVEAL_INTRO: RevealTimeline & {
  collapseAt: number
  collapseFor: number
} = {
  collapseAt: 140,
  collapseFor: 820,
  revealAt: 140,
  revealFor: 1200,
  orbitsAt: 660,
  orbitsFor: 1100,
  ringAt: 1000,
  ringFor: 1000,
  burstAt: 1960,
  headlineAt: 1000,
  kickerAt: 1200,
  newsAt: 2700,
  ctaAt: 2900,
  linkAt: 3050,
  doneAt: 3050,
}

/** A replay: the tile pops in over the app, then the same story, quicker. */
export const REVEAL_REPLAY: RevealTimeline = {
  revealAt: 0,
  revealFor: 900,
  orbitsAt: 200,
  orbitsFor: 1000,
  ringAt: 380,
  ringFor: 900,
  burstAt: 1240,
  headlineAt: 300,
  kickerAt: 450,
  newsAt: 1900,
  ctaAt: 2100,
  linkAt: 2250,
  doneAt: 2250,
}

/** How long one feature chip takes to fly out of the tile. */
export const REVEAL_CHIP_FLIGHT_MS = 900
export const REVEAL_CHIP_STAGGER_MS = 70
/** How many chips orbit the tile. */
export const REVEAL_CHIP_COUNT = 8
/** The whole burst: every chip's flight, staggered. */
export const REVEAL_BURST_TOTAL_MS =
  REVEAL_CHIP_FLIGHT_MS + (REVEAL_CHIP_COUNT - 1) * REVEAL_CHIP_STAGGER_MS

/** The tour settles in once the intro has cleared. */
export const REVEAL_TOUR_IN_MS = 450
/** The overlay fades away over the app. */
export const REVEAL_CLOSE_MS = 320
