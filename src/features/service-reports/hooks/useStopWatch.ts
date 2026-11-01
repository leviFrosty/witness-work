import { analytics } from '@/lib/analytics'
import { splitMinutes } from '@/lib/entryMinutes'
import { localizeAppDigits } from '@/lib/numbers'
import { useEffect, useState, useCallback } from 'react'
import * as Stopwatch from '../../../../modules/stopwatch-bridge'

const padStart = (num: number) => num.toString().padStart(2, '0')

export const formatMs = (ms: number) => {
  let seconds = Math.floor(ms / 1000)
  let minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  seconds = seconds % 60
  minutes = minutes % 60
  return localizeAppDigits(
    `${padStart(hours)}:${padStart(minutes)}:${padStart(seconds)}`
  )
}

export const computeElapsedMs = (
  state: Stopwatch.StopwatchState,
  nowMs: number = Date.now()
): number => {
  if (state.isRunning && state.startedAt != null) {
    return state.accumulatedMs + Math.max(0, nowMs - state.startedAt * 1000)
  }
  return state.accumulatedMs
}

export const sessionStartMs = (
  state: Stopwatch.StopwatchState,
  nowMs: number = Date.now()
): number | null => {
  const elapsed = computeElapsedMs(state, nowMs)
  if (elapsed <= 0) return null
  if (state.isRunning && state.startedAt != null) {
    return state.startedAt * 1000 - state.accumulatedMs
  }

  return state.updatedAt > 0 ? state.updatedAt * 1000 - elapsed : null
}

export const splitElapsed = (ms: number) => splitMinutes(Math.floor(ms / 60000))

export const MIN_MS_TO_SAVE = 60000

export const RESET_CONFIRM_MIN_MS = 60000

const ZERO: Stopwatch.StopwatchState = {
  startedAt: null,
  accumulatedMs: 0,
  isRunning: false,
  updatedAt: 0,
}

type StopwatchAction = 'started' | 'paused' | 'reset'

const runCommand = async (
  action: StopwatchAction,
  cmd: () => Promise<Stopwatch.StopwatchState>
) => {
  try {
    const next = await cmd()
    analytics.capture('timer_action_completed', { action })
    return next
  } catch (err) {
    analytics.capture('timer_action_failed', { action })
    console.warn('[stopwatch] native command failed', err)
    return null
  }
}

const SAME_SESSION_TOLERANCE_MS = 2000

export const isSameSession = (
  expectedStartMs: number,
  currentStartMs: number | null
) =>
  currentStartMs != null &&
  Math.abs(currentStartMs - expectedStartMs) <= SAME_SESSION_TOLERANCE_MS

export const resetStopwatchSession = async (expectedStartMs: number) => {
  const current = sessionStartMs(Stopwatch.getState())
  if (!isSameSession(expectedStartMs, current)) return null
  return runCommand('reset', Stopwatch.reset)
}

export const useElapsedMs = (
  state: Stopwatch.StopwatchState,
  live: boolean
): number => {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const ticking = state.isRunning && live

  useEffect(() => {
    if (!ticking) return
    setNowMs(Date.now())
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [ticking, state])

  return computeElapsedMs(state, nowMs)
}

export const useElapsedReached = (
  state: Stopwatch.StopwatchState,
  thresholdMs: number
): boolean => {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const reached = computeElapsedMs(state, nowMs) >= thresholdMs

  useEffect(() => {
    if (reached || !state.isRunning) return
    const left = thresholdMs - computeElapsedMs(state, Date.now())
    const timer = setTimeout(() => setNowMs(Date.now()), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [reached, state, thresholdMs])

  return reached
}

export const useStopWatch = () => {
  const [state, setState] = useState<Stopwatch.StopwatchState>(() =>
    Stopwatch.isAvailable() ? Stopwatch.getState() : ZERO
  )

  useEffect(() => {
    if (!Stopwatch.isAvailable()) return
    const sub = Stopwatch.onStateChange(setState)
    return () => sub.remove()
  }, [])

  const dispatch = useCallback(
    async (
      action: StopwatchAction,
      cmd: () => Promise<Stopwatch.StopwatchState>
    ) => {
      const next = await runCommand(action, cmd)
      if (next) setState(next)
    },
    []
  )

  const start = useCallback(() => {
    void dispatch('started', Stopwatch.start)
  }, [dispatch])

  const stop = useCallback(() => {
    void dispatch('paused', Stopwatch.pause)
  }, [dispatch])

  const reset = useCallback(() => {
    void dispatch('reset', Stopwatch.reset)
  }, [dispatch])

  return {
    start,
    stop,
    reset,
    state,
    isRunning: state.isRunning,
    hasStarted: state.isRunning || state.accumulatedMs > 0,
  }
}
