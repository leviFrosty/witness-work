/**
 * Mirrors the iOS StopwatchAttributes.ContentState. Timestamps are Unix
 * seconds; accumulatedMs contains completed running segments only.
 */
export type StopwatchState = {
  startedAt: number | null
  accumulatedMs: number
  isRunning: boolean
  updatedAt: number
}

export const ZERO_STATE: StopwatchState = {
  startedAt: null,
  accumulatedMs: 0,
  isRunning: false,
  updatedAt: 0,
}
