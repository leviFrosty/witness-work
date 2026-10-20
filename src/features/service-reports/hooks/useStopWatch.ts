import { analytics } from '@/lib/analytics'
import { splitMinutes } from '@/lib/entryMinutes'
import { localizeAppDigits } from '@/lib/numbers'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as Stopwatch from '../../../../modules/stopwatch-bridge'

const padStart = (num: number) => num.toString().padStart(2, '0')

/** `01:02:03` for display, in the app Language's digits. */
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

/**
 * Computes elapsed ms from the native authoritative state. When running, total
 * = accumulated + (now − startedAt). Paused/idle uses `accumulatedMs`
 * directly.
 */
export const computeElapsedMs = (
  state: Stopwatch.StopwatchState,
  nowMs: number = Date.now()
): number => {
  if (state.isRunning && state.startedAt != null) {
    return state.accumulatedMs + Math.max(0, nowMs - state.startedAt * 1000)
  }
  return state.accumulatedMs
}

/**
 * When the session began, in ms: the last moment it ran minus its elapsed time.
 * Exact without pauses; a pause makes it later than the real start. `null` for
 * an empty timer, or state too old to say.
 */
export const sessionStartMs = (
  state: Stopwatch.StopwatchState,
  nowMs: number = Date.now()
): number | null => {
  const elapsed = computeElapsedMs(state, nowMs)
  if (elapsed <= 0) return null
  if (state.isRunning && state.startedAt != null) {
    return state.startedAt * 1000 - state.accumulatedMs
  }
  // Paused: the last pause is the latest command.
  return state.updatedAt > 0 ? state.updatedAt * 1000 - elapsed : null
}

/** Elapsed time as Add Time's Hours and Minutes. */
export const splitElapsed = (ms: number) => splitMinutes(Math.floor(ms / 60000))

/** Save needs a whole minute, the least a time entry can hold. */
export const MIN_MS_TO_SAVE = 60000

/** Resetting a session at least this long asks first. */
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

/** Starts this close are one session; the bridge stores seconds as doubles. */
const SAME_SESSION_TOLERANCE_MS = 2000

/**
 * Whether the timer still holds the session that began at `expectedStartMs`.
 * Pausing keeps its start; a pause and resume moves it later, which reads as
 * another session, so the timer is left for the user to clear.
 */
export const isSameSession = (
  expectedStartMs: number,
  currentStartMs: number | null
) =>
  currentStartMs != null &&
  Math.abs(currentStartMs - expectedStartMs) <= SAME_SESSION_TOLERANCE_MS

/**
 * Clears the timer once Add Time saves its session, unless the timer has moved
 * on since, e.g. reset and restarted from a Live Activity or watch. The bridge
 * broadcasts the change, so a mounted timer updates too.
 */
export const resetStopwatchSession = async (expectedStartMs: number) => {
  const current = sessionStartMs(Stopwatch.getState())
  if (!isSameSession(expectedStartMs, current)) return null
  return runCommand('reset', Stopwatch.reset)
}

/**
 * The bridge owns persisted timestamp state: Swift/App Group UserDefaults on
 * iOS, `StopwatchStore.kt` on Android. iOS Live Activities can also change it
 * through App Intents, and either watch through the watch bridge. Both
 * implementations rehydrate on foreground; this hook renders elapsed time and
 * dispatches commands through the same interface.
 */
export const useStopWatch = () => {
  const [state, setState] = useState<Stopwatch.StopwatchState>(() =>
    Stopwatch.isAvailable() ? Stopwatch.getState() : ZERO
  )
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!Stopwatch.isAvailable()) return
    const sub = Stopwatch.onStateChange(setState)
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (state.isRunning) {
      intervalRef.current = setInterval(() => setNowMs(Date.now()), 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [state.isRunning])

  const dispatch = useCallback(
    async (
      action: StopwatchAction,
      cmd: () => Promise<Stopwatch.StopwatchState>
    ) => {
      const next = await runCommand(action, cmd)
      if (!next) return
      setState(next)
      setNowMs(Date.now())
    },
    []
  )

  const start = useCallback(() => {
    void dispatch('started', Stopwatch.start)
  }, [dispatch])

  const stop = useCallback(() => {
    // Preserves legacy semantic: "stop" = pause (keeps accumulated time).
    void dispatch('paused', Stopwatch.pause)
  }, [dispatch])

  const reset = useCallback(() => {
    void dispatch('reset', Stopwatch.reset)
  }, [dispatch])

  const ms = computeElapsedMs(state, nowMs)

  return {
    start,
    stop,
    reset,
    isRunning: state.isRunning,
    time: formatMs(ms),
    hasStarted: ms > 0,
    ms,
    sessionStartedAt: sessionStartMs(state, nowMs),
  }
}
