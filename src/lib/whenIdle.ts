/**
 * Runs `work` once the app is idle, through `requestIdleCallback` where the
 * platform has it: React Native provides it on iOS and Android, and Chrome and
 * Firefox have it. Safari doesn't, so there `work` runs after the current task
 * instead. Returns a function that cancels it.
 */
export function whenIdle(
  work: () => void,
  options?: { timeout?: number }
): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = requestIdleCallback(() => work(), options)
    return () => cancelIdleCallback(handle)
  }
  const timer = setTimeout(work, 0)
  return () => clearTimeout(timer)
}
