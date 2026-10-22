import moment from 'moment'
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
  /** Days that already have time logged, which this step doesn't plan. */
  loggedDays: Set<number>
}

/**
 * The Assistant's recommendation for `target` when the publisher goes out only
 * on `serviceDays` — the same engine and projection as the Schedule screen,
 * spread evenly across the picked days.
 *
 * It plans the whole month, days already gone included: someone who installs
 * late in the month has usually been out already, and can log that time on the
 * planned days instead of cramming the goal into what's left.
 */
const usePlanMonth = (
  target: CalendarMonth,
  serviceDays: readonly number[],
  /** Minutes the publisher set by hand, keyed by day; 0 clears a day. */
  edits: ReadonlyMap<number, number>
): PlanMonth => {
  const { effectiveGoalHours } = useMonthlyGoal(target)
  const { projection, today, loggedDayKeys } = useProjectedTotal(
    { kind: 'month', ...target },
    effectiveGoalHours * 60,
    new Date(target.year, target.month, 1)
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
          // The publisher just picked these days, so give each a similar
          // session instead of filling the fewest days at the stretch cap.
          spreadEvenly: true,
          skipDayKeys: loggedDayKeys,
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
  const loggedDays = new Set<number>()
  for (const key of loggedDayKeys) {
    const date = moment(key, 'YYYY-MM-DD')
    if (date.year() === target.year && date.month() === target.month) {
      loggedDays.add(date.date())
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
    loggedDays,
  }
}

export default usePlanMonth
