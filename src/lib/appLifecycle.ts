import { AppState, type AppStateStatus } from 'react-native'
import { refreshLocalTimeOffset } from '@/lib/deviceTimeZone'

type Listener = () => void
type Entry = { listener: Listener; minIntervalMs: number; lastRunAt: number }

const foreground = new Set<Entry>()
const background = new Set<Listener>()
let backgrounded = AppState.currentState === 'background'
let subscribed = false

let lastForeground = Date.now()

function onChange(state: AppStateStatus) {
  if (state === 'background') {
    backgrounded = true
    background.forEach((listener) => listener())
    return
  }

  if (state !== 'active' || !backgrounded) return
  backgrounded = false

  refreshLocalTimeOffset()
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

export function addForegroundListener(
  listener: Listener,
  { minIntervalMs = 0 }: { minIntervalMs?: number } = {}
): { remove: () => void } {
  subscribe()
  const entry: Entry = { listener, minIntervalMs, lastRunAt: 0 }
  foreground.add(entry)
  return { remove: () => foreground.delete(entry) }
}

export function lastForegroundAt(): number {
  subscribe()
  return lastForeground
}

export function addBackgroundListener(listener: Listener): {
  remove: () => void
} {
  subscribe()
  background.add(listener)
  return { remove: () => background.delete(listener) }
}
