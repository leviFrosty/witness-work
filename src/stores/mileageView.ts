import { useSyncExternalStore } from 'react'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { buildMileageView } from '@/lib/mileage/view'
import type { MileageView } from '@/types/mileage'

export function getMileageView(): MileageView {
  return buildMileageView(useMileage.getState(), useSharedCars.getState().cars)
}

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

export function useMileageView(): MileageView
export function useMileageView<T>(selector: (view: MileageView) => T): T
export function useMileageView<T>(
  selector?: (view: MileageView) => T
): T | MileageView {
  return useSyncExternalStore(subscribeMileageView, () =>
    selector ? selector(getMileageView()) : getMileageView()
  )
}
