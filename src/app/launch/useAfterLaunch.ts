import { useEffect, useState, useSyncExternalStore } from 'react'
import { perf } from '@/lib/perf'
import { isLaunching, subscribeLaunched } from '@/app/launch/launchState'

/** Longest launch work waits for the JS thread to go idle. */
export const LAUNCH_IDLE_TIMEOUT_MS = 1_500

/** How long launch work waits after App Lock uncovers the first screen. */
export const UNCOVER_GRACE_MS = 1_000

let covered = false
let heldUntil = 0

/**
 * While App Lock covers the first screen, nothing under it can stutter, so
 * idle-stage work runs one piece after another without waiting for idle
 * periods. Once it's uncovered, launch work waits `UNCOVER_GRACE_MS`, so the
 * screen being revealed and its first taps don't compete with it. Later locks
 * and unlocks come through here too; by then launch work is done.
 */
export function setFirstScreenCovered(next: boolean) {
  if (covered && !next) heldUntil = Date.now() + UNCOVER_GRACE_MS
  covered = next
}

const heldFor = () => Math.max(0, heldUntil - Date.now())

/**
 * Idle-stage work starts one piece per idle period, in the order it was asked
 * for, so launch jobs never pile into one long block after the first screen.
 */
const idleQueue: { begin: () => void }[] = []
let draining = false

function drainIdleQueue() {
  if (!idleQueue.length) {
    draining = false
    return
  }
  draining = true
  const held = heldFor()
  if (held) {
    setTimeout(drainIdleQueue, held)
    return
  }
  let started = false
  const start = () => {
    if (started) return
    started = true
    // Uncovered while this piece waited.
    if (heldFor()) return drainIdleQueue()
    idleQueue.shift()?.begin()
    // Let React commit this piece's work before starting the next.
    setTimeout(drainIdleQueue, 0)
  }
  if (covered) setTimeout(start, 0)
  else requestIdleCallback(start, { timeout: LAUNCH_IDLE_TIMEOUT_MS })
}

function enqueueIdle(begin: () => void): () => void {
  const entry = { begin }
  idleQueue.push(entry)
  if (!draining) drainIdleQueue()
  return () => {
    const index = idleQueue.indexOf(entry)
    if (index >= 0) idleQueue.splice(index, 1)
  }
}

/**
 * When launch work may start: `'firstScreen'` as soon as the first screen is
 * up, `'idle'` once the JS thread is next idle after that (or
 * `LAUNCH_IDLE_TIMEOUT_MS`), or a number of ms after the first screen.
 */
export type LaunchStart = 'firstScreen' | 'idle' | number

/**
 * False until launch work at `start` may begin, then true for good. Keeps work
 * that isn't needed for the first screen out of its way while the splash hands
 * over. Background launches mount the app too, so this still comes true there.
 */
export function useAfterLaunch(start: LaunchStart): boolean {
  const launched = !useSyncExternalStore(subscribeLaunched, isLaunching)
  const [due, setDue] = useState(start === 'firstScreen')
  useEffect(() => {
    if (!launched || due) return
    const begin = () => {
      perf.mark(`launchWork:${start}`)
      setDue(true)
    }
    if (typeof start === 'number') {
      // Comes due during the grace after App Lock: waits it out.
      const fire = () => {
        const held = heldFor()
        if (held) timer = setTimeout(fire, held)
        else begin()
      }
      let timer = setTimeout(fire, start)
      return () => clearTimeout(timer)
    }
    return enqueueIdle(begin)
  }, [launched, due, start])
  return launched && due
}
