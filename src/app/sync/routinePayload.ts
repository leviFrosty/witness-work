import type { SyncPayload } from '@/app/sync/payload'
import type {
  ReadingPlanRun,
  RoutineEntry,
  RoutineSnapshot,
} from '@/types/routine'

export function routineFromPayload(payload: SyncPayload): RoutineSnapshot {
  const slice = payload.routineStore
  return {
    routineEntries: (slice?.routineEntries ?? []) as RoutineEntry[],
    readingPlans: (slice?.readingPlans ?? []) as ReadingPlanRun[],
    deletedRoutineRecords: slice?.deletedRoutineRecords ?? [],
  }
}
