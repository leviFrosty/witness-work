import { Easing } from 'react-native-reanimated'
import { TranslationKey } from '@/lib/locales'

/**
 * The welcome constellation is authored in this design box, with the app tile
 * (the "hub") at `HUB`. The whole scene is scaled to fit the space above the
 * copy, so every size below is in design units.
 */
export const STAGE = { width: 360, height: 400 }
export const HUB = { x: 180, y: 200 }
/** Keeps the scene clear of the screen edges and sane on tablets. */
export const STAGE_INSET = 20
export const STAGE_SCALE = { min: 0.55, max: 1.5 }

export const HUB_TILE_SIZE = 88
/** App-icon corner ratio: the splash folds into a tile shaped like an icon. */
export const HUB_TILE_RADIUS = HUB_TILE_SIZE * 0.25
export const HUB_MARK_WIDTH = HUB_TILE_SIZE * 0.6
export const HUB_RING_RADIUS = 64
export const HUB_RING_WIDTH = 5
export const ORBIT_RADII = [124, 182] as const

/** How far each depth layer drifts at full tilt, in points. */
export const PARALLAX = { aurora: 10, hub: 6, satellites: 14 }

/** The story the headline tells, in the order a month of service unfolds. */
export type PillarId = 'plan' | 'track' | 'visits' | 'report' | 'progress'

export const PILLARS: { id: PillarId; titleKey: TranslationKey }[] = [
  { id: 'plan', titleKey: 'onboardingHeroPillarPlan' },
  { id: 'track', titleKey: 'onboardingHeroPillarTrack' },
  { id: 'visits', titleKey: 'onboardingHeroPillarVisits' },
  { id: 'report', titleKey: 'onboardingHeroPillarReport' },
  { id: 'progress', titleKey: 'onboardingHeroPillarProgress' },
]

/** What the headline shows: nothing yet, the greeting, or a part of the story. */
export type Headline = 'welcome' | PillarId | null

export type SatelliteId = 'plan' | 'timer' | 'map' | 'visit' | 'report'

export interface SatelliteSpec {
  id: SatelliteId
  /** The part of the story that brings this card forward. */
  pillar: PillarId
  /** Centre, relative to the hub. */
  dx: number
  dy: number
  /** Resting tilt, in degrees. */
  tilt: number
  /** 0–1: how far forward the card floats — drives parallax and bob. */
  depth: number
}

// "progress" has no card: it spotlights the hub and its ring instead.
export const SATELLITES: SatelliteSpec[] = [
  { id: 'plan', pillar: 'plan', dx: -88, dy: -128, tilt: -4, depth: 1 },
  { id: 'timer', pillar: 'track', dx: 100, dy: -98, tilt: 3, depth: 0.7 },
  { id: 'map', pillar: 'visits', dx: 128, dy: 30, tilt: 5, depth: 0.55 },
  { id: 'visit', pillar: 'visits', dx: -84, dy: 110, tilt: 3, depth: 0.9 },
  { id: 'report', pillar: 'report', dx: 92, dy: 156, tilt: -3, depth: 0.75 },
]

/** Milliseconds from the start of the first-launch welcome. */
export const INTRO = {
  collapseAt: 140,
  collapseFor: 820,
  revealFor: 1200,
  orbitsAt: 660,
  orbitsFor: 1100,
  burstAt: 700,
  burstStagger: 80,
  headlineAt: 800,
  subtitleAt: 1150,
  ctaAt: 1350,
  linkAt: 1500,
  // The story starts, and tapping no longer hurries the intro.
  doneAt: 1500,
}

/** How long one card takes to fly out of the hub. */
export const BURST_MS = 900
/** The whole burst: every card's flight, staggered. */
export const BURST_TOTAL_MS =
  BURST_MS + (SATELLITES.length - 1) * INTRO.burstStagger

/** Under Reduce Motion, the splash fades instead of collapsing. */
export const SPLASH_FADE_MS = 450
/** How long a return to the hero takes to settle back into place. */
export const RETURN_MS = 480
export const EXIT_MS = 380

/** How long the welcome line holds before the story starts. */
export const WELCOME_HOLD_MS = 2600
/** How long each part of the story holds the headline. */
export const PILLAR_HOLD_MS = 3000
/** Rounds of the story before it rests on the welcome (one under Reduce Motion). */
export const STORY_CYCLES = 2
/** Where the progress ring rests before the story starts. */
export const RING_START = 0.08

/**
 * Largest Dynamic Type multiplier the display copy honours before the scene
 * above it runs out of room.
 */
export const DISPLAY_FONT_SCALE_CAP = 1.4

export const EASE_OUT = Easing.out(Easing.cubic)
export const EASE_IN = Easing.in(Easing.cubic)
/** Slow start, decisive middle, long settle — the iOS app-close feel. */
export const EASE_COLLAPSE = Easing.bezier(0.6, 0, 0.12, 1)
