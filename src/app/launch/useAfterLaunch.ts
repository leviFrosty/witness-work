import { useEffect, useState, useSyncExternalStore } from 'react'
import { perf } from '@/lib/perf'
import { isLaunching, subscribeLaunched } from '@/app/launch/launchState'

/** Longest launch work waits for the JS thread to go idle. */
export const LAUNCH_IDLE_TIMEOUT_MS = 1_500

/**
 * Idle-stage work starts one piece per idle period, in the order it was asked
 * for, so launch jobs never pile into one long block after the first screen.
 */
const idleQueue: { begin: () => void }[] = []
let draining = false

function drainIdleQueue() {
  const next = idleQueue.shift()
  if (!next) {
    draining = false
    return
  }
  draining = true
  requestIdleCallback(
    () => {
      next.begin()
      // Let React commit this piece's work before waiting for the next idle
      // period.
      setTimeout(drainIdleQueue, 0)
    },
    { timeout: LAUNCH_IDLE_TIMEOUT_MS }
  )
}

function enqueueIdle(begin: () => void): () => void {
  const entry = { begin }
  idleQueue.push(entry)
  if (!draining) drainIdleQueue()
  return () => {
    const index = idleQueue.indexOf(entry)
    if (index >= 0) idleQueue.splice(index, 1)
    else entry.begin = () => {}
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
      const timer = setTimeout(begin, start)
      return () => clearTimeout(timer)
    }
    return enqueueIdle(begin)
  }, [launched, due, start])
  return launched && due
}
