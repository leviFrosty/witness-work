import { useSyncExternalStore } from 'react'
import { AppState, type NativeEventSubscription } from 'react-native'

const TICK_MS = 60 * 1000

// One clock for every screen: a single minute timer and AppState listener,
// however many components ask what time it is. It stops in the background,
// where nothing shows, and catches up on return.
const listeners = new Set<() => void>()
let now = Date.now()
let interval: ReturnType<typeof setInterval> | undefined
let appState: NativeEventSubscription | undefined

const tick = () => {
  now = Date.now()
  listeners.forEach((listener) => listener())
}

const run = (on: boolean) => {
  clearInterval(interval)
  interval = on ? setInterval(tick, TICK_MS) : undefined
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    run(AppState.currentState !== 'background')
    appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tick()
        run(true)
      } else if (state === 'background') run(false)
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    run(false)
    appState?.remove()
  }
}

// Stopped while nobody reads it: a first reader gets the time now.
const getSnapshot = () => {
  if (!listeners.size && Math.abs(Date.now() - now) >= 1000) now = Date.now()
  return now
}

/**
 * The current time for deriving what's due, refreshed every minute and on
 * returning to the app, so a Follow-up that just passed (or a cutoff that just
 * closed) shows without a relaunch. `refresh` forces an update, e.g. when the
 * tray opens.
 */
export default function useNow() {
  return { now: useSyncExternalStore(subscribe, getSnapshot), refresh: tick }
}
