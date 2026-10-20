/**
 * The scratch twirl (hidden moment: a long, unbroken scrub on the pet), the
 * same for every species: a little crouch, a hop with three quick turns in
 * place, a landing, then it's happy with a burst of hearts.
 */
import type { MotionTable } from './types'

/** End of the crouch. */
const CROUCH_MS = 200
/** The turns, one flip per frame of the 10 fps clock. */
const SPIN_MS = 600
const FLIP_MS = 100
/** When it lands and the hearts burst. */
const LAND_MS = CROUCH_MS + SPIN_MS

export const TWIRL: MotionTable = {
  durationMs: 1300,
  sayAtMs: LAND_MS,
  sayMoment: 'happy',
  pose(u) {
    if (u < CROUCH_MS) return { bobAdd: 1, mood: 'wide' }
    if (u < LAND_MS) {
      const k = (u - CROUCH_MS) / SPIN_MS
      return {
        dy: -Math.sin(Math.PI * k) * 6,
        flip: Math.floor((u - CROUCH_MS) / FLIP_MS) % 2 === 1,
        mood: 'joy',
      }
    }
    if (u < LAND_MS + FLIP_MS) return { land: true, bobAdd: 1, mood: 'joy' }
    return { mood: 'joy' }
  },
}
