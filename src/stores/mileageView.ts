import { useSyncExternalStore } from 'react'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { buildMileageView } from '@/lib/mileage/view'
import type { MileageView } from '@/types/mileage'

/**
 * The one view of mileage: the User's own cars and every Shared Car, in the
 * collections the app already reads (`@/lib/mileage/view`). Every mileage
 * reader goes through it; writes go through `@/stores/mileageWrites`. Lives
 * beside the stores because it reads both.
 */

/** The view now, for code outside React (watch snapshot, Siri, reports). */
export function getMileageView(): MileageView {
  return buildMileageView(useMileage.getState(), useSharedCars.getState().cars)
}

/**
 * Calls `listener` whenever the view changes, not on writes that leave it as it
 * was (a Shared Car's sync bookkeeping). Returns a function that stops.
 */
export function subscribeMileageView(
  listener: (view: MileageView) => void
): () => void {
  let current = getMileageView()
  const check = () => {
    const next = getMileageView()
    if (next === current) return
    current = next
    listener(next)
  }
  const unsubscribes = [
    useMileage.subscribe(check),
    useSharedCars.subscribe(check),
  ]
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe()
  }
}

/**
 * The view, or a slice of it, re-rendering when that changes. Like a zustand
 * selector, `selector` returns a part of the view or a value compared by
 * identity (a count, a flag), never a new object or array.
 */
export function useMileageView(): MileageView
export function useMileageView<T>(selector: (view: MileageView) => T): T
export function useMileageView<T>(
  selector?: (view: MileageView) => T
): T | MileageView {
  return useSyncExternalStore(subscribeMileageView, () =>
    selector ? selector(getMileageView()) : getMileageView()
  )
}
