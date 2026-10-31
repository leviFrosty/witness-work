import type { SharedCarsStore } from '@/stores/sharedCars'

/** A local change syncs its car this long after the last one. */
export const LOCAL_CHANGE_SYNC_DELAY_MS = 2000

export type LocalChangeOptions = {
  delayMs?: number
  /** The engine is writing the store itself (a sync, not the User's change). */
  isEngineWrite: () => boolean
}

/**
 * Calls `onChange(spaceId)` once a car has gone `delayMs` without a local
 * change: a change made on this device (a trip logged, a car renamed) that left
 * records waiting to be put. Changes the engine makes as it syncs don't count.
 * Returns the stop function, which drops the changes still waiting.
 */
export function watchLocalChanges(
  store: Pick<SharedCarsStore, 'subscribe'>,
  onChange: (spaceId: string) => void,
  { delayMs = LOCAL_CHANGE_SYNC_DELAY_MS, isEngineWrite }: LocalChangeOptions
): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const schedule = (spaceId: string) => {
    const waiting = timers.get(spaceId)
    if (waiting) clearTimeout(waiting)
    timers.set(
      spaceId,
      setTimeout(() => {
        timers.delete(spaceId)
        onChange(spaceId)
      }, delayMs)
    )
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.cars === previous.cars || isEngineWrite()) return
    for (const [spaceId, car] of Object.entries(state.cars)) {
      const before = previous.cars[spaceId]
      if (
        car !== before &&
        car.pendingPuts.length > 0 &&
        car.pendingPuts !== before?.pendingPuts
      )
        schedule(spaceId)
    }
  })
  return () => {
    unsubscribe()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
}
