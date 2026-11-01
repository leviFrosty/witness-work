import { skipRecurringInstancesOnDayPlanDates } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

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
