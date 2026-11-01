import type { MotionTable } from './types'

const CROUCH_MS = 200

const SPIN_MS = 600
const FLIP_MS = 100

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
