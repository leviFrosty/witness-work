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

export const dayPlanFingerprint = (
  plan: DayPlan,
  categories: Category[]
): string =>
  `${dayKey(plan.date)}:${plan.minutes}:${
    isPlanCreditTime(plan, categories) ? 'c' : 's'
  }`

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

export const appendAssistantEventCapped = (
  history: AssistantEvent[],
  next: AssistantEvent,
  cap: number
): AssistantEvent[] => {
  const appended = [...history, next]
  if (appended.length <= cap) return appended
  return appended.slice(appended.length - cap)
}
