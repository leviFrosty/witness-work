import moment from 'moment'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import i18n from '@/lib/locales'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import { plannedMinutesThroughDayForMonth } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import GoalMeterCard from '@/features/plans/components/GoalMeterCard'

type Props = CalendarMonth & {
  onPress: () => void
  /** Long-press shortcut; absent when the month's goal can't change. */
  onEditGoal?: () => void
}

/**
 * The focused month's goal at a glance above the Schedule's calendar: logged
 * time and the month's Plans against the Monthly Goal, and whether logged time
 * keeps up with the Plans so far, which the day colors show too.
 */
export default function MonthGoalMeter({
  year,
  month,
  onPress,
  onEditGoal,
}: Props) {
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const { projection, today } = useProjectedTotal(
    { kind: 'month', month, year },
    goalMinutes
  )
  const schedule = useScheduleStatus({ month, year })
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  // Unlike the Projected Total elsewhere, Schedule shows every Plan in the
  // month, including days already past.
  const plannedMinutes = plannedMinutesThroughDayForMonth(
    month,
    year,
    moment({ year, month, day: 1 }).daysInMonth(),
    dayPlans,
    recurringPlans
  )

  return (
    <GoalMeterCard
      title={moment({ year, month, day: 1 }).format(
        year === today.getFullYear() ? 'MMMM' : 'MMM YYYY'
      )}
      goalMinutes={goalMinutes}
      loggedMinutes={projection.loggedMinutes}
      plannedMinutes={plannedMinutes}
      tense={getPeriodTense({ kind: 'month', month, year }, today)}
      schedule={schedule}
      onPress={onPress}
      editGoal={
        onEditGoal && {
          title: i18n.t('scheduleCalendar.editMonthlyGoal'),
          onPress: onEditGoal,
        }
      }
    />
  )
}
