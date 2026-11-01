import type { MotionTable } from './types'

const SWEEP_MS = 800

const BURST_MS = 1100

export interface WakeTable extends MotionTable {
  readonly sweepMs: number

  readonly burstAtMs: number

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
