import { AppState } from 'react-native'

const pending = new Set<symbol>()
const listeners = new Set<() => void>()

/** Register startup work before starting it; always release it in finally. */
export function beginStartupWork(): () => void {
  const id = Symbol('startup')
  pending.add(id)
  listeners.forEach((listener) => listener())
  return () => {
    if (!pending.delete(id)) return
    listeners.forEach((listener) => listener())
  }
}

/**
 * Best-effort foreground work after rendering and registered startup work.
 * React Native's idle callback alone does not wait for async initialization. A
 * busy/hung launch skips optional work after 30 seconds instead of forcing it
 * into a frame. The caller owns errors and cancellation of an in-flight task.
 */
export function deferUntilNotBlocking(
  task: () => void,
  { signal }: { signal?: AbortSignal } = {}
): () => void {
  if (signal?.aborted) return () => {}
  let stopped = false
  let frame: number | undefined
  let idle: number | undefined
  let quiet: ReturnType<typeof setTimeout> | undefined

  const cancelScheduled = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    if (idle !== undefined) cancelIdleCallback(idle)
    if (quiet !== undefined) clearTimeout(quiet)
    frame = idle = quiet = undefined
  }
  const eligible = () =>
    pending.size === 0 && AppState.currentState === 'active'
  const cleanup = () => {
    if (stopped) return
    stopped = true
    cancelScheduled()
    clearTimeout(deadline)
    listeners.delete(schedule)
    subscription.remove()
    signal?.removeEventListener('abort', cleanup)
  }
  const schedule = () => {
    cancelScheduled()
    if (stopped || !eligible()) return
    // Let React effects and follow-up startup tasks settle, then yield two
    // frames before requesting idle time. Never give the idle callback a
    // timeout: that would force optional work during a busy frame.
    quiet = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          idle = requestIdleCallback(() => {
            if (!eligible() || signal?.aborted) return schedule()
            cleanup()
            task()
          })
        })
      })
    }, 1_000)
  }
  const subscription = AppState.addEventListener('change', schedule)
  const deadline = setTimeout(cleanup, 30_000)
  listeners.add(schedule)
  signal?.addEventListener('abort', cleanup, { once: true })
  schedule()
  return cleanup
}
