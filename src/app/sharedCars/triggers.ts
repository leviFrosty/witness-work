import type { SharedCarsStore } from '@/stores/sharedCars'

export const LOCAL_CHANGE_SYNC_DELAY_MS = 2000

export type LocalChangeOptions = {
  delayMs?: number

  isEngineWrite: () => boolean
}

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
