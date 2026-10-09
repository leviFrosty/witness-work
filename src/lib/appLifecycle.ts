import { AppState, type AppStateStatus } from 'react-native'

type Listener = () => void
type Entry = { listener: Listener; minIntervalMs: number; lastRunAt: number }

const foreground = new Set<Entry>()
const background = new Set<Listener>()
let backgrounded = AppState.currentState === 'background'
let subscribed = false
/** Launch counts as coming back. */
let lastForeground = Date.now()

function onChange(state: AppStateStatus) {
  if (state === 'background') {
    backgrounded = true
    background.forEach((listener) => listener())
    return
  }
  // iOS passes through `inactive` for Control Center, Notification Center,
  // Face ID, permission alerts and system sheets. The app never left, so only
  // a return from `background` counts as coming back.
  if (state !== 'active' || !backgrounded) return
  backgrounded = false
  const at = Date.now()
  lastForeground = at
  foreground.forEach((entry) => {
    if (at - entry.lastRunAt < entry.minIntervalMs) return
    entry.lastRunAt = at
    entry.listener()
  })
}

function subscribe() {
  if (subscribed) return
  subscribed = true
  AppState.addEventListener('change', onChange)
}

/**
 * Runs when the user comes back to the app from the background. Brief
 * `inactive` interruptions don't count. `minIntervalMs` skips returns that come
 * sooner than that after the listener last ran.
 */
export function addForegroundListener(
  listener: Listener,
  { minIntervalMs = 0 }: { minIntervalMs?: number } = {}
): { remove: () => void } {
  subscribe()
  const entry: Entry = { listener, minIntervalMs, lastRunAt: 0 }
  foreground.add(entry)
  return { remove: () => foreground.delete(entry) }
}

/** When the app launched or last came back from the background (epoch ms). */
export function lastForegroundAt(): number {
  subscribe()
  return lastForeground
}

/** Runs when the app moves to the background. */
export function addBackgroundListener(listener: Listener): {
  remove: () => void
} {
  subscribe()
  background.add(listener)
  return { remove: () => background.delete(listener) }
}
