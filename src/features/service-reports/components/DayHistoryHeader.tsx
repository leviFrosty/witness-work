import moment from 'moment'
import { useMemo } from 'react'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import Circle from '@/components/ui/Circle'
import XView from '@/components/ui/layout/XView'
import { getDateStatusColor } from '@/components/CalendarDay'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { entryMinutes } from '@/lib/entryMinutes'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import { isCountableEntry } from '@/lib/serviceReport'
import useServiceReport from '@/stores/serviceReport'
import { TimeEntry } from '@/types/timeEntry'

const DayHistoryHeader = ({
  date,
  serviceReports,
}: {
  date: Date

  serviceReports: TimeEntry[]
}) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()

  const thisDaysReports = useMemo(
    () => serviceReports.filter((r) => isStoredDateOnLocalDay(r.date, date)),
    [date, serviceReports]
  )
  const actualMinutes = thisDaysReports.reduce(
    (acc, report) => acc + entryMinutes(report),
    0
  )

  const dayPlansForToday = useMemo(
    () => dayPlansOnLocalDay(dayPlans, date),
    [dayPlans, date]
  )
  const contributions = resolvePlannedContributionsForDay(
    date,
    dayPlansForToday,
    recurringPlans
  )
  const goalMinutes = contributions.length
    ? contributions.reduce(
        (total, contribution) => total + contribution.minutes,
        0
      )
    : undefined

  const actualDisplay = useFormattedMinutes(actualMinutes)
  const goalDisplay = useFormattedMinutes(goalMinutes ?? 0)

  const wentInService = thisDaysReports.some(isCountableEntry)
  const isToday = moment().isSame(date, 'day')
  const dateInPast = moment(date).isSameOrBefore(moment(), 'day')
  const hitGoal = actualMinutes >= (goalMinutes ?? 0)

  const statusColor = getDateStatusColor(
    theme,
    wentInService,
    isToday,
    dateInPast,
    hitGoal
  )

  return (
    <XView
      style={{
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <WholeWordsText
        accessibilityRole='header'
        style={{
          color: theme.colors.text,
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {formatDate(date)}
      </WholeWordsText>

      <XView style={{ flexShrink: 1 }}>
        {goalMinutes ? (
          <>
            <Circle color={statusColor.bg} />
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('md'),
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('actualOfPlanned', {
                actual: actualDisplay.formatted,
                planned: goalDisplay.formatted,
              })}
            </Text>
          </>
        ) : null}
      </XView>
    </XView>
  )
}

export default DayHistoryHeader
