import type { TranslationKey } from '@/lib/locales'

export const UPDATE_REVEAL_VERSION = '1.44.0'

export const UPDATE_REVEAL_NAME: TranslationKey = 'updateReveal_name'

export interface RevealTimeline {
  revealAt: number
  revealFor: number
  orbitsAt: number
  orbitsFor: number

  ringAt: number
  ringFor: number

  burstAt: number
  headlineAt: number
  kickerAt: number

  newsAt: number
  ctaAt: number
  linkAt: number

  doneAt: number
}

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

export const REVEAL_CHIP_FLIGHT_MS = 900
export const REVEAL_CHIP_STAGGER_MS = 70

export const REVEAL_CHIP_COUNT = 8

export const REVEAL_BURST_TOTAL_MS =
  REVEAL_CHIP_FLIGHT_MS + (REVEAL_CHIP_COUNT - 1) * REVEAL_CHIP_STAGGER_MS

export const REVEAL_TOUR_IN_MS = 450

export const REVEAL_CLOSE_MS = 320
