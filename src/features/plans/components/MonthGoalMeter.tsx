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
import { formatDisplay } from '@/lib/dates'

type Props = CalendarMonth & {
  onPress: () => void

  onEditGoal?: () => void
}

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

  const plannedMinutes = plannedMinutesThroughDayForMonth(
    month,
    year,
    moment({ year, month, day: 1 }).daysInMonth(),
    dayPlans,
    recurringPlans
  )

  return (
    <GoalMeterCard
      title={formatDisplay(
        { year, month, day: 1 },
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
