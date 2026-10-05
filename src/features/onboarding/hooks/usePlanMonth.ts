import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import {
  generateRecommendation,
  proposedPlanLocalDay,
  type Recommendation,
} from '@/lib/assistantRecommendation'
import { projectStandardAddition } from '@/lib/projectedTotal'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { momentStoredDate } from '@/lib/normalizeDate'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useConversations from '@/stores/conversationStore'
import { otherWeekdays } from '@/features/onboarding/lib/planMonth'

export type PlanMonth = {
  goalMinutes: number
  loggedMinutes: number
  /** Plans the publisher already has, plus the proposal. */
  plannedMinutes: number
  projectedMinutes: number
  reachesGoal: boolean
  /** Logged and existing plans already reach the goal. */
  alreadyOnTrack: boolean
  /** `null` until a day is picked, or when there's nothing left to plan. */
  recommendation: Recommendation | null
  /** Saved and proposed minutes keyed by day of the month. */
  minutesByDay: Map<number, number>
}

/**
 * The Assistant's recommendation for `target` when the publisher goes out only
 * on `serviceDays` — the same engine and projection as the Schedule screen, so
 * the onboarding preview matches what they'll see there afterwards.
 */
const usePlanMonth = (
  target: CalendarMonth,
  serviceDays: readonly number[]
): PlanMonth => {
  const { effectiveGoalHours } = useMonthlyGoal(target)
  const { projection, today } = useProjectedTotal(
    { kind: 'month', ...target },
    effectiveGoalHours * 60
  )
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const conversations = useConversations((s) => s.conversations)
  const { meetingDays, assistantHistory } = usePreferences()

  const recommendation =
    serviceDays.length === 0
      ? null
      : generateRecommendation({
          ...target,
          today,
          monthlyGoalHours: effectiveGoalHours,
          standardGapMinutes: projection.standardGapMinutes,
          dayPlans,
          recurringPlans,
          conversations,
          offDays: otherWeekdays(serviceDays),
          meetingDays,
          assistantHistory,
        })

  const minutesByDay = new Map<number, number>()
  const addMinutes = (day: number, minutes: number) =>
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + minutes)
  // Plans already saved (e.g. when coming back to this step) stay visible.
  for (const plan of dayPlans) {
    const date = momentStoredDate(plan.date)
    if (date.year() === target.year && date.month() === target.month) {
      addMinutes(date.date(), plan.minutes)
    }
  }
  let proposedMinutes = 0
  for (const plan of recommendation?.plans ?? []) {
    addMinutes(proposedPlanLocalDay(plan).getDate(), plan.minutes)
    proposedMinutes += plan.minutes
  }

  // Proposed standard time can displace capped credit, so re-run the month's
  // cap formula instead of adding linearly (ADR 0005).
  const projectedMinutes = projectStandardAddition(projection, proposedMinutes)

  return {
    goalMinutes: projection.goalMinutes,
    loggedMinutes: projection.loggedMinutes,
    plannedMinutes: projection.plannedMinutes + proposedMinutes,
    projectedMinutes,
    reachesGoal: projectedMinutes >= projection.goalMinutes,
    alreadyOnTrack: projection.standardGapMinutes <= 0,
    recommendation,
    minutesByDay,
  }
}

export default usePlanMonth
