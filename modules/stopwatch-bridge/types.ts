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
