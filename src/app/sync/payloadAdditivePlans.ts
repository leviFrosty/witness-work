import { skipRecurringInstancesOnDayPlanDates } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

/**
 * Sync-time translation for payloads written before Plans on one day added up.
 * Those builds let a Day Plan hide every recurring instance on its date; this
 * skips those instances so the forecast reads the same here. It's the read-time
 * twin of the store's v4 → v5 migration, for peers and backups that haven't
 * updated.
 *
 * Runs inside `parsePayload`, per payload, before any merge. Only payloads
 * without the `additivePlans` marker are touched. `updatedAt` is left alone:
 * the stale peer holds the same timestamp, so last-writer-wins ties resolve to
 * each side's own copy and nothing flaps.
 *
 * Kept store-free (like `payloadFollowUps.ts`) so it stays cheap to test.
 */
export function normalizeLegacyPlans(d: Record<string, unknown>): void {
  const store = d.serviceReportStore as
    | { dayPlans?: unknown; recurringPlans?: unknown; additivePlans?: unknown }
    | null
    | undefined
  if (!store || typeof store !== 'object') return
  if (store.additivePlans === true) return
  if (!Array.isArray(store.dayPlans) || !Array.isArray(store.recurringPlans))
    return
  store.recurringPlans = skipRecurringInstancesOnDayPlanDates(
    store.dayPlans as DayPlan[],
    store.recurringPlans as RecurringPlan[]
  )
}
