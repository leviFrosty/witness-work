import {
  Platform,
  requireOptionalNativeModule,
  EventSubscription,
} from 'expo-modules-core'
import { androidStopwatch } from './androidStopwatch'
import { ZERO_STATE, type StopwatchState } from './types'

export type { StopwatchState } from './types'

type StopwatchBridgeNative = {
  start(): Promise<StopwatchState>
  pause(): Promise<StopwatchState>
  resume(): Promise<StopwatchState>
  stop(): Promise<StopwatchState>
  reset(): Promise<StopwatchState>
  getState(): StopwatchState
  areLiveActivitiesEnabled(): boolean
  addListener(
    eventName: 'onStateChange',
    listener: (state: StopwatchState) => void
  ): EventSubscription
}

const native =
  requireOptionalNativeModule<StopwatchBridgeNative>('StopwatchBridge')

const stopwatch =
  Platform.OS === 'android'
    ? androidStopwatch
    : Platform.OS === 'ios'
      ? native
      : null

/** Whether this platform has a working stopwatch implementation. */
export function isAvailable(): boolean {
  return stopwatch != null
}

export function getState(): StopwatchState {
  return stopwatch?.getState() ?? ZERO_STATE
}

export function areLiveActivitiesEnabled(): boolean {
  return Platform.OS === 'ios' && native != null
    ? native.areLiveActivitiesEnabled()
    : false
}

export async function start(): Promise<StopwatchState> {
  return stopwatch?.start() ?? ZERO_STATE
}

export async function pause(): Promise<StopwatchState> {
  return stopwatch?.pause() ?? ZERO_STATE
}

export async function resume(): Promise<StopwatchState> {
  return stopwatch?.resume() ?? ZERO_STATE
}

export async function stop(): Promise<StopwatchState> {
  return stopwatch?.stop() ?? ZERO_STATE
}

export async function reset(): Promise<StopwatchState> {
  return stopwatch?.reset() ?? ZERO_STATE
}

/**
 * Subscribe to commands and foreground refreshes. On iOS this also receives
 * lock-screen changes made through App Intents while JS was suspended.
 */
export function onStateChange(
  listener: (state: StopwatchState) => void
): EventSubscription {
  return (
    stopwatch?.addListener('onStateChange', listener) ?? { remove: () => {} }
  )
}
