import AssistantSection from '@/components/AssistantSection'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import { getEffectiveScheduleScreenOrder } from '@/lib/scheduleScreenPreferences'
import { usePreferences } from '@/stores/preferences'

const ScheduleScreenSections = ({
  month,
  year,
}: {
  month: number
  year: number
}) => {
  const preferences = usePreferences()
  return getEffectiveScheduleScreenOrder(
    preferences.scheduleScreenElementsOrder
  ).map((key) => {
    switch (key) {
      case 'assistant':
        return preferences.scheduleScreenElements.assistant ? (
          <MonthAssistantCard key={key} month={month} year={year} />
        ) : null
    }
  })
}

const MonthAssistantCard = ({
  month,
  year,
}: {
  month: number
  year: number
}) => {
  const { set } = usePreferences()
  const { effectiveGoalHours: monthlyGoalHours } = useMonthlyGoal({
    month,
    year,
  })

  const { projection, today } = useProjectedTotal(
    { kind: 'month', month, year },
    monthlyGoalHours * 60
  )

  const tense = getPeriodTense({ kind: 'month', month, year }, today)

  if (monthlyGoalHours <= 0 || tense === 'past') return null

  return (
    <AssistantSection
      year={year}
      month={month}
      today={today}
      monthlyGoalHours={monthlyGoalHours}
      projection={projection}
      standalone
      onDismiss={() =>
        set((state) => ({
          scheduleScreenElements: {
            ...state.scheduleScreenElements,
            assistant: false,
          },
        }))
      }
    />
  )
}

export default ScheduleScreenSections
