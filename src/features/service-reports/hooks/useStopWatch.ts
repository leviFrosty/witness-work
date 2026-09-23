import { analytics } from '@/lib/analytics'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as Stopwatch from '../../../../modules/stopwatch-bridge'

const padStart = (num: number) => num.toString().padStart(2, '0')

export const formatMs = (ms: number) => {
  let seconds = Math.floor(ms / 1000)
  let minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  seconds = seconds % 60
  minutes = minutes % 60
  return `${padStart(hours)}:${padStart(minutes)}:${padStart(seconds)}`
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

const ZERO: Stopwatch.StopwatchState = {
  startedAt: null,
  accumulatedMs: 0,
  isRunning: false,
  updatedAt: 0,
}

/**
 * The bridge owns persisted timestamp state: Swift/App Group UserDefaults on
 * iOS, MMKV on Android. iOS Live Activities can also change it through App
 * Intents. Both implementations rehydrate on foreground; this hook renders
 * elapsed time and dispatches commands through the same interface.
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
      action: 'started' | 'paused' | 'reset',
      cmd: () => Promise<Stopwatch.StopwatchState>
    ) => {
      try {
        const next = await cmd()
        analytics.capture('timer_action_completed', { action })
        setState(next)
        setNowMs(Date.now())
      } catch (err) {
        analytics.capture('timer_action_failed', { action })
        console.warn('[stopwatch] native command failed', err)
      }
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
  }
}
