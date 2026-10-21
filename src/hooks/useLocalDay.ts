import { useSyncExternalStore } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { refreshLocalTimeOffset } from '@/lib/deviceTimeZone'

const readLocalDay = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// One clock for every screen: a single midnight timer and foreground listener,
// however many days on screen ask whether they're today.
const listeners = new Set<() => void>()
let current = readLocalDay()
let midnight: ReturnType<typeof setTimeout> | undefined
let foreground: { remove: () => void } | undefined

const update = () => {
  scheduleMidnight()
  const next = readLocalDay()
  if (next === current) return
  current = next
  listeners.forEach((listener) => listener())
}

// Also re-set on each return to the app: after travel, midnight in the new
// zone comes at a different moment.
function scheduleMidnight() {
  clearTimeout(midnight)
  const next = new Date()
  next.setHours(24, 0, 1, 0)
  midnight = setTimeout(() => {
    // The zone may have changed while the app stayed open.
    refreshLocalTimeOffset()
    update()
  }, next.getTime() - Date.now())
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    current = readLocalDay()
    scheduleMidnight()
    // Coming back already refreshed the zone (see `appLifecycle`).
    foreground = addForegroundListener(update)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    clearTimeout(midnight)
    foreground?.remove()
  }
}

const getSnapshot = () => (listeners.size ? current : readLocalDay())

/**
 * Today's local date (`YYYY-MM-DD`), changing at midnight and when the app
 * comes back on a new day, including a new day in another time zone. Derive
 * "today" values from it so React Compiler recomputes them then, instead of
 * keeping a `moment()` from an earlier day.
 */
export default function useLocalDay(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}
