/**
 * Waking a pet that died (2 s): colour washes back over the lying pet from the
 * feet up (0–800 ms), it pops up surprised (800–1100 ms), then it says hello
 * with a burst of hearts and stays joyful until the end.
 */
import type { MotionTable } from './types'

/** Length of the colour sweep. */
const SWEEP_MS = 800
/** When the pet lands and the hearts burst. */
const BURST_MS = 1100

/** The wake timeline, with the colour sweep. */
export interface WakeTable extends MotionTable {
  readonly sweepMs: number
  /** When the heart burst plays (same instant as the sound). */
  readonly burstAtMs: number
  /**
   * During the sweep, the first sprite row (0–31) that is back in colour; rows
   * above it are still grey. `null` once the sweep is over.
   */
  colorFromRow(u: number): number | null
}

export const WAKE: WakeTable = {
  durationMs: 2000,
  sayAtMs: BURST_MS,
  sayMoment: 'hi',
  sweepMs: SWEEP_MS,
  burstAtMs: BURST_MS,
  pose(u) {
    if (u < SWEEP_MS) return { mood: 'dead' }
    if (u < BURST_MS)
      return {
        mood: 'wide',
        dy: -Math.sin((Math.PI * (u - SWEEP_MS)) / 300) * 7,
      }
    return { mood: 'joy' }
  },
  colorFromRow(u) {
    if (u >= SWEEP_MS) return null
    return 31 - Math.floor((Math.max(0, u) / SWEEP_MS) * 32)
  },
}
