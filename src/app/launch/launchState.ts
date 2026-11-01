let launching = true
const listeners = new Set<() => void>()

export const isLaunching = () => launching

export const markLaunched = () => {
  if (!launching) return
  launching = false
  listeners.forEach((listener) => listener())
}

export const subscribeLaunched = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
