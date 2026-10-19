/** Frames per second the pet scenes run at. */
export const PET_FPS = 10

/** How long a scene keeps drawing after a touch when idle frames stop. */
export const IDLE_KEEP_ALIVE_MS = 2_000

type Timers = {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

/**
 * A frame clock on the JS thread. Runs while active; with `idleStops` (Reduce
 * Motion, where nothing moves at rest) it stops once `onFrame` reports nothing
 * animating and no {@link kick} keeps it alive, and a kick starts it again.
 * `onFrame` returns whether something is animating. A frame that throws stops
 * the clock; the next {@link kick} (new input, a touch) tries again. Only the
 * first error goes to `onError` (rethrown without one) until a frame draws
 * again, so a scene that keeps failing reports once.
 */
export function createFrameLoop({
  onFrame,
  onError,
  fps = PET_FPS,
  now = () => performance.now(),
  timers = {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) =>
      clearInterval(handle as ReturnType<typeof setInterval>),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
}: {
  onFrame: (tMs: number) => boolean
  onError?: (error: unknown) => void
  fps?: number
  now?: () => number
  timers?: Timers
}) {
  let handle: unknown = null
  let active = false
  let idleStops = false
  let aliveUntil = 0
  let failed = false
  let reported = false
  let disposed = false
  let soon: unknown = null

  const stop = () => {
    if (soon !== null) timers.clearTimeout(soon)
    soon = null
    if (handle === null) return
    timers.clearInterval(handle)
    handle = null
  }
  const tick = () => {
    const t = now()
    let busy: boolean
    try {
      busy = onFrame(t)
    } catch (error) {
      failed = true
      stop()
      if (!onError) throw error
      if (!reported) onError(error)
      reported = true
      return
    }
    reported = false
    if (idleStops && !busy && t >= aliveUntil) stop()
  }
  // One extra frame once the current task (a render's effects) is done, so new
  // input shows at once instead of on the next tick.
  const drawSoon = () => {
    if (soon !== null) return
    soon = timers.setTimeout(() => {
      soon = null
      if (handle !== null) tick()
    }, 0)
  }
  const start = () => {
    if (disposed || !active || failed || handle !== null) return
    handle = timers.setInterval(tick, 1000 / fps)
    tick()
  }

  return {
    /** Runs or pauses the clock (focus, foreground). */
    setActive(on: boolean) {
      active = on
      if (on) start()
      else stop()
    },
    setIdleStops(on: boolean) {
      idleStops = on
      start()
    },
    /**
     * Draws now (or, while running, right after the current task) and keeps
     * drawing for `ms`, even when idle frames stop.
     */
    kick(ms = IDLE_KEEP_ALIVE_MS) {
      aliveUntil = Math.max(aliveUntil, now() + ms)
      failed = false
      if (handle === null) start()
      else drawSoon()
    },
    isRunning: () => handle !== null,
    /** Stops for good (unmount): later calls don't start it again. */
    dispose() {
      disposed = true
      stop()
    },
  }
}

export type FrameLoop = ReturnType<typeof createFrameLoop>
