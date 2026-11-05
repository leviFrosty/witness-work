import useRoutine from '@/stores/routine'
import type { RoutineSnapshot } from '@/types/routine'

export function localRoutineSnapshot(): RoutineSnapshot {
  const { routineEntries, readingPlans, deletedRoutineRecords } =
    useRoutine.getState()
  return { routineEntries, readingPlans, deletedRoutineRecords }
}

export function applyRoutineSnapshot(snapshot: RoutineSnapshot): void {
  useRoutine.setState({
    routineEntries: snapshot.routineEntries,
    readingPlans: snapshot.readingPlans,
    deletedRoutineRecords: snapshot.deletedRoutineRecords,
  })
}

export function hasRoutineData(): boolean {
  return Object.values(localRoutineSnapshot()).some((list) => list.length > 0)
}
