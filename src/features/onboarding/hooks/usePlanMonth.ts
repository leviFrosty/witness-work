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

  plannedMinutes: number
  projectedMinutes: number
  reachesGoal: boolean

  alreadyOnTrack: boolean

  recommendation: Recommendation | null

  plans: { day: number; minutes: number; fromAssistant: boolean }[]

  minutesByDay: Map<number, number>

  savedDays: Set<number>

  loggedDays: Set<number>
}

const usePlanMonth = (
  target: CalendarMonth,
  serviceDays: readonly number[],

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

          spreadEvenly: true,
          skipDayKeys: loggedDayKeys,
        })

  const minutesByDay = new Map<number, number>()
  const savedDays = new Set<number>()
  const addMinutes = (day: number, minutes: number) =>
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + minutes)

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
