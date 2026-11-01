import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'

export const PARADISE_ODDS = 20

export const STAR_ODDS = 15
export const TRICK_PATS = 15
export const TRICK_WINDOW_MS = 5_000

type Sky = Pick<ResolvedWindow, 'time' | 'liveTime'>

export const shouldShowParadise = (rng: () => number, sky: Sky): boolean =>
  sky.liveTime && sky.time === 'day' && rng() < 1 / PARADISE_ODDS

export const shouldShowStar = (rng: () => number, sky: Sky): boolean =>
  sky.liveTime && sky.time === 'night' && rng() < 1 / STAR_ODDS

export const shouldShowRainbow = (
  life: { rainbowToday: boolean } | null,
  sky: Pick<ResolvedWindow, 'time'>
): boolean => !!life?.rainbowToday && sky.time !== 'night'

export function createPatCounter({
  pats = TRICK_PATS,
  windowMs = TRICK_WINDOW_MS,
}: { pats?: number; windowMs?: number } = {}) {
  let times: number[] = []
  return {
    pat(nowMs: number = Date.now()): boolean {
      times = times.filter((at) => nowMs - at < windowMs)
      times.push(nowMs)
      if (times.length < pats) return false
      times = []
      return true
    },
    reset(): void {
      times = []
    },
  }
}

export type PatCounter = ReturnType<typeof createPatCounter>
