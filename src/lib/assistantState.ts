import type { AssistantEvent } from '@/types/assistant'
import type { Category } from '@/types/category'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import { momentStoredDate } from '@/lib/normalizeDate'
import { isPlanCreditTime } from '@/lib/serviceReportCategory'

export type RecommendationInputsHashInput = {
  loggedAdjustedMinutes: number
  monthlyGoalMinutes: number
  dayPlanFingerprints: string[]
  recurringPlanFingerprints: string[]
  conversationDayKeys: string[]
  offDays: number[]
  meetingDays?: number[]
}

const dayKey = (d: Date) => momentStoredDate(d).format('YYYY-MM-DD')

/**
 * Per-plan fingerprint for the dismissal hash. Lives here, next to the hash
 * version tag, so a format change and its version bump are the same edit.
 * Credit-ness is resolved from the plan's Category (Plan Type) because it moves
 * the projection.
 */
export const dayPlanFingerprint = (
  plan: DayPlan,
  categories: Category[]
): string =>
  `${dayKey(plan.date)}:${plan.minutes}:${
    isPlanCreditTime(plan, categories) ? 'c' : 's'
  }`

/**
 * Recurring-plan fingerprint — covers the full recurrence pattern plus
 * per-instance overrides and deleted dates, all of which change the planned
 * minutes the engine projects against.
 */
export const recurringPlanFingerprint = (
  plan: RecurringPlan,
  categories: Category[]
): string => {
  const r = plan.recurrence
  const overrides = (plan.overrides ?? [])
    .map((o) => `${dayKey(o.date)}=${o.minutes}`)
    .sort()
    .join(';')
  const deleted = (plan.deletedDates ?? []).map(dayKey).sort().join(';')
  return [
    plan.id,
    dayKey(plan.startDate),
    plan.minutes,
    isPlanCreditTime(plan, categories) ? 'c' : 's',
    r.frequency,
    r.interval,
    r.endDate ? dayKey(r.endDate) : '-',
    overrides,
    deleted,
  ].join(':')
}

/**
 * Cheap deterministic fingerprint of every input that should re-arm the
 * Assistant after the user dismissed a recommendation. Two identical input
 * states must produce the same hash regardless of array order — so we sort the
 * set-like fields before stringifying.
 *
 * V3: includes the effective Monthly Goal so a one-month goal change re-arms a
 * previously dismissed recommendation.
 *
 * V2: plan fingerprints carry the plan's resolved credit-ness (Plan Type) —
 * re-typing a plan or flipping its Category's credit setting moves the
 * projection, so it must re-arm — plus the recurring pattern's recurrence,
 * overrides, and deleted dates.
 */
export const computeRecommendationInputsHash = (
  input: RecommendationInputsHashInput
): string => {
  const parts: (string | number)[] = [
    'v3',
    input.loggedAdjustedMinutes,
    input.monthlyGoalMinutes,
    input.dayPlanFingerprints.slice().sort().join('|'),
    input.recurringPlanFingerprints.slice().sort().join('|'),
    input.conversationDayKeys.slice().sort().join('|'),
    input.offDays
      .slice()
      .sort((a, b) => a - b)
      .join(','),
    (input.meetingDays ?? [])
      .slice()
      .sort((a, b) => a - b)
      .join(','),
  ]
  return parts.join('::')
}

/**
 * Append a new assistant event to history, dropping the oldest entry when the
 * FIFO would exceed `cap`. Pure — caller writes the result back to the
 * preferences store.
 */
export const appendAssistantEventCapped = (
  history: AssistantEvent[],
  next: AssistantEvent,
  cap: number
): AssistantEvent[] => {
  const appended = [...history, next]
  if (appended.length <= cap) return appended
  return appended.slice(appended.length - cap)
}
