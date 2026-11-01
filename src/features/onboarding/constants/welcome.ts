import { Easing } from 'react-native-reanimated'
import { TranslationKey } from '@/lib/locales'

export const STAGE = { width: 360, height: 400 }
export const HUB = { x: 180, y: 200 }

export const STAGE_INSET = 20
export const STAGE_SCALE = { min: 0.55, max: 1.5 }

export const HUB_TILE_SIZE = 88

export const HUB_TILE_RADIUS = HUB_TILE_SIZE * 0.25
export const HUB_MARK_WIDTH = HUB_TILE_SIZE * 0.6
export const HUB_RING_RADIUS = 64
export const HUB_RING_WIDTH = 5
export const ORBIT_RADII = [124, 182] as const

export const PARALLAX = { aurora: 10, hub: 6, satellites: 14 }

export type PillarId = 'plan' | 'track' | 'visits' | 'report' | 'progress'

export const PILLARS: { id: PillarId; titleKey: TranslationKey }[] = [
  { id: 'plan', titleKey: 'onboardingHeroPillarPlan' },
  { id: 'track', titleKey: 'onboardingHeroPillarTrack' },
  { id: 'visits', titleKey: 'onboardingHeroPillarVisits' },
  { id: 'report', titleKey: 'onboardingHeroPillarReport' },
  { id: 'progress', titleKey: 'onboardingHeroPillarProgress' },
]

export type Headline = 'welcome' | PillarId | null

export type SatelliteId = 'plan' | 'timer' | 'map' | 'visit' | 'report'

export interface SatelliteSpec {
  id: SatelliteId

  pillar: PillarId

  dx: number
  dy: number

  tilt: number

  depth: number
}

export const SATELLITES: SatelliteSpec[] = [
  { id: 'plan', pillar: 'plan', dx: -88, dy: -128, tilt: -4, depth: 1 },
  { id: 'timer', pillar: 'track', dx: 100, dy: -98, tilt: 3, depth: 0.7 },
  { id: 'map', pillar: 'visits', dx: 128, dy: 30, tilt: 5, depth: 0.55 },
  { id: 'visit', pillar: 'visits', dx: -84, dy: 110, tilt: 3, depth: 0.9 },
  { id: 'report', pillar: 'report', dx: 92, dy: 156, tilt: -3, depth: 0.75 },
]

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

  doneAt: 1500,
}

export const BURST_MS = 900

export const BURST_TOTAL_MS =
  BURST_MS + (SATELLITES.length - 1) * INTRO.burstStagger

export const SPLASH_FADE_MS = 450

export const RETURN_MS = 480
export const EXIT_MS = 380

export const WELCOME_HOLD_MS = 2600

export const PILLAR_HOLD_MS = 3000

export const STORY_CYCLES = 2

export const RING_START = 0.08

export const DISPLAY_FONT_SCALE_CAP = 1.4

export const EASE_OUT = Easing.out(Easing.cubic)
export const EASE_IN = Easing.in(Easing.cubic)

export const EASE_COLLAPSE = Easing.bezier(0.6, 0, 0.12, 1)
