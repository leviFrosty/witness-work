import {
  Platform,
  requireOptionalNativeModule,
  EventSubscription,
} from 'expo-modules-core'

/**
 * Authoritative stopwatch state. Mirrors `StopwatchAttributes.ContentState` in
 * Swift. `startedAt` / `updatedAt` are Unix seconds (epoch). `accumulatedMs`
 * holds elapsed time from all prior start/pause segments.
 */
export type StopwatchState = {
  startedAt: number | null
  accumulatedMs: number
  isRunning: boolean
  updatedAt: number
}

type StopwatchBridgeNative = {
  start(): Promise<StopwatchState>
  pause(): Promise<StopwatchState>
  resume(): Promise<StopwatchState>
  stop(): Promise<StopwatchState>
  reset(): Promise<StopwatchState>
  getState(): StopwatchState
  areLiveActivitiesEnabled(): boolean
  addListener(eventName: string): void
  removeListeners(count: number): void
}

const native =
  requireOptionalNativeModule<StopwatchBridgeNative>('StopwatchBridge')

const ZERO_STATE: StopwatchState = {
  startedAt: null,
  accumulatedMs: 0,
  isRunning: false,
  updatedAt: 0,
}

/** Whether the native stopwatch module is linked and iOS. */
export function isAvailable(): boolean {
  return Platform.OS === 'ios' && native != null
}

export function getState(): StopwatchState {
  if (!isAvailable()) return ZERO_STATE
  return native!.getState()
}

export function areLiveActivitiesEnabled(): boolean {
  if (!isAvailable()) return false
  return native!.areLiveActivitiesEnabled()
}

export async function start(): Promise<StopwatchState> {
  if (!isAvailable()) return ZERO_STATE
  return native!.start()
}

export async function pause(): Promise<StopwatchState> {
  if (!isAvailable()) return ZERO_STATE
  return native!.pause()
}

export async function resume(): Promise<StopwatchState> {
  if (!isAvailable()) return ZERO_STATE
  return native!.resume()
}

export async function stop(): Promise<StopwatchState> {
  if (!isAvailable()) return ZERO_STATE
  return native!.stop()
}

export async function reset(): Promise<StopwatchState> {
  if (!isAvailable()) return ZERO_STATE
  return native!.reset()
}

/**
 * Subscribe to state mutations — including ones from lock-screen buttons. The
 * native module emits on every command and on app foreground (to pick up
 * changes from App Intents that ran while JS was suspended).
 */
export function onStateChange(
  listener: (state: StopwatchState) => void
): EventSubscription {
  if (!isAvailable()) {
    return { remove: () => {} } as EventSubscription
  }
  // Expo module event emitter surface — `addListener` is injected by Expo.
  const emitter = native as unknown as {
    addListener: (
      name: string,
      cb: (s: StopwatchState) => void
    ) => EventSubscription
  }
  return emitter.addListener('onStateChange', listener)
}
