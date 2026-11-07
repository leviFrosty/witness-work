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
