import { useEffect, useState, useSyncExternalStore } from 'react'
import { perf } from '@/lib/perf'
import { isLaunching, subscribeLaunched } from '@/app/launch/launchState'

export const LAUNCH_IDLE_TIMEOUT_MS = 1_500

export const UNCOVER_GRACE_MS = 1_000

let covered = false
let heldUntil = 0

export function setFirstScreenCovered(next: boolean) {
  if (covered && !next) heldUntil = Date.now() + UNCOVER_GRACE_MS
  covered = next
}

const heldFor = () => Math.max(0, heldUntil - Date.now())

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

    if (heldFor()) return drainIdleQueue()
    idleQueue.shift()?.begin()

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

export type LaunchStart = 'firstScreen' | 'idle' | number

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
