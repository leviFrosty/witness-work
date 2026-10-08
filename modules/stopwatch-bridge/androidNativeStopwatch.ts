import { AppState } from 'react-native'
import type { EventSubscription } from 'expo-modules-core'
import { takeLegacyState } from './androidStopwatch'
import type { StopwatchState } from './types'

type AndroidNative = {
  getState(): StopwatchState
  start(): Promise<StopwatchState>
  pause(): Promise<StopwatchState>
  resume(): Promise<StopwatchState>
  stop(): Promise<StopwatchState>
  reset(): Promise<StopwatchState>
  importLegacyState?(json: string): boolean
  addListener(
    eventName: 'onStateChange',
    listener: (state: StopwatchState) => void
  ): EventSubscription
}

/**
 * The native Android store (`android/…/StopwatchStore.kt`), which the Wear OS
 * watch also changes while JS isn't running. The first use takes over the timer
 * JS kept in MMKV before, so a running timer survives the update.
 */
export function androidNativeStopwatch(native: AndroidNative) {
  let migrated = false
  const migrate = () => {
    if (migrated) return
    migrated = true
    const legacy = takeLegacyState()
    if (legacy && legacy.updatedAt > 0) {
      native.importLegacyState?.(JSON.stringify(legacy))
    }
  }
  const command =
    (run: () => Promise<StopwatchState>) =>
    async (): Promise<StopwatchState> => {
      migrate()
      return run()
    }

  return {
    getState: () => {
      migrate()
      return native.getState()
    },
    start: command(() => native.start()),
    resume: command(() => native.resume()),
    pause: command(() => native.pause()),
    stop: command(() => native.stop()),
    reset: command(() => native.reset()),
    /** Also on foreground, like the iOS module, for changes made meanwhile. */
    addListener: (
      eventName: 'onStateChange',
      listener: (state: StopwatchState) => void
    ): EventSubscription => {
      const subscription = native.addListener(eventName, listener)
      const foreground = AppState.addEventListener('change', (state) => {
        if (state === 'active') listener(native.getState())
      })
      return {
        remove: () => {
          subscription.remove()
          foreground.remove()
        },
      }
    },
  }
}
