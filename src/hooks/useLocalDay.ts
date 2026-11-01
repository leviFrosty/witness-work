import { useSyncExternalStore } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { refreshLocalTimeOffset } from '@/lib/deviceTimeZone'

const readLocalDay = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

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

function scheduleMidnight() {
  clearTimeout(midnight)
  const next = new Date()
  next.setHours(24, 0, 1, 0)
  midnight = setTimeout(() => {
    refreshLocalTimeOffset()
    update()
  }, next.getTime() - Date.now())
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    current = readLocalDay()
    scheduleMidnight()

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

export default function useLocalDay(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}
