import { AppState } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import { ZERO_STATE, type StopwatchState } from './types'

let storage: MMKV | undefined
const getStorage = () => (storage ??= new MMKV({ id: 'stopwatch' }))
const listeners = new Set<(state: StopwatchState) => void>()

const isState = (value: unknown): value is StopwatchState => {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<StopwatchState>
  return (
    typeof state.isRunning === 'boolean' &&
    (state.startedAt === null ||
      (typeof state.startedAt === 'number' &&
        Number.isFinite(state.startedAt) &&
        state.startedAt >= 0)) &&
    (!state.isRunning || state.startedAt !== null) &&
    typeof state.accumulatedMs === 'number' &&
    Number.isFinite(state.accumulatedMs) &&
    state.accumulatedMs >= 0 &&
    typeof state.updatedAt === 'number' &&
    Number.isFinite(state.updatedAt) &&
    state.updatedAt >= 0
  )
}

const getState = (): StopwatchState => {
  const encoded = getStorage().getString('state')
  if (!encoded) return ZERO_STATE
  try {
    const state: unknown = JSON.parse(encoded)
    return isState(state) ? state : ZERO_STATE
  } catch {
    return ZERO_STATE
  }
}

const save = (state: StopwatchState): StopwatchState => {
  getStorage().set('state', JSON.stringify(state))
  for (const listener of listeners) listener(state)
  return state
}

const start = (): StopwatchState => {
  const current = getState()
  if (current.isRunning) return current
  const now = Date.now() / 1000
  return save({
    startedAt: now,
    accumulatedMs: current.accumulatedMs,
    isRunning: true,
    updatedAt: now,
  })
}

const pause = (): StopwatchState => {
  const current = getState()
  if (!current.isRunning || current.startedAt === null) return current
  const nowMs = Date.now()
  return save({
    startedAt: null,
    accumulatedMs:
      current.accumulatedMs + Math.max(0, nowMs - current.startedAt * 1000),
    isRunning: false,
    updatedAt: nowMs / 1000,
  })
}

/**
 * The persisted timestamp is the clock, so process termination and Android
 * suspending JS do not lose time. No background task or interval is needed.
 */
export const androidStopwatch = {
  getState,
  start,
  resume: start,
  pause,
  stop: pause,
  reset: () => save({ ...ZERO_STATE, updatedAt: Date.now() / 1000 }),
  addListener: (
    _eventName: 'onStateChange',
    listener: (state: StopwatchState) => void
  ) => {
    listeners.add(listener)
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') listener(getState())
    })
    return {
      remove: () => {
        listeners.delete(listener)
        foreground.remove()
      },
    }
  },
}
