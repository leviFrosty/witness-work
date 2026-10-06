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
import {
  applyDayEdits,
  otherWeekdays,
} from '@/features/onboarding/lib/planMonth'

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
  /** The plans to add: the Assistant's proposal with the publisher's edits. */
  plans: { day: number; minutes: number; fromAssistant: boolean }[]
  /** Saved and proposed minutes keyed by day of the month. */
  minutesByDay: Map<number, number>
  /** Days that already have a saved plan, which this step leaves alone. */
  savedDays: Set<number>
}

/**
 * The Assistant's recommendation for `target` when the publisher goes out only
 * on `serviceDays` — the same engine and projection as the Schedule screen, so
 * the onboarding preview matches what they'll see there afterwards.
 */
const usePlanMonth = (
  target: CalendarMonth,
  serviceDays: readonly number[],
  /** Minutes the publisher set by hand, keyed by day; 0 clears a day. */
  edits: ReadonlyMap<number, number>
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
  const savedDays = new Set<number>()
  const addMinutes = (day: number, minutes: number) =>
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + minutes)
  // Plans already saved (e.g. when coming back to this step) stay visible.
  for (const plan of dayPlans) {
    const date = momentStoredDate(plan.date)
    if (date.year() === target.year && date.month() === target.month) {
      addMinutes(date.date(), plan.minutes)
      savedDays.add(date.date())
    }
  }
  const plans = applyDayEdits(
    (recommendation?.plans ?? []).map((plan) => ({
      day: proposedPlanLocalDay(plan).getDate(),
      minutes: plan.minutes,
    })),
    edits
  )
  let proposedMinutes = 0
  for (const plan of plans) {
    addMinutes(plan.day, plan.minutes)
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
    plans,
    minutesByDay,
    savedDays,
  }
}

export default usePlanMonth
