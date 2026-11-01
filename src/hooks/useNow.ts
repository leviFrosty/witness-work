import { useSyncExternalStore } from 'react'
import { AppState, type NativeEventSubscription } from 'react-native'

const TICK_MS = 60 * 1000

const listeners = new Set<() => void>()
let now = Date.now()
let interval: ReturnType<typeof setInterval> | undefined
let appState: NativeEventSubscription | undefined
let away = false

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
    away = AppState.currentState === 'background'
    run(!away)
    appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        away = true
        run(false)
      } else if (state === 'active' && away) {
        away = false
        tick()
        run(true)
      }
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

const getSnapshot = () => {
  if (!listeners.size && Math.abs(Date.now() - now) >= 1000) now = Date.now()
  return now
}

export default function useNow() {
  return { now: useSyncExternalStore(subscribe, getSnapshot), refresh: tick }
}
