import { Calendar } from 'react-native-calendars'
import { TimeEntry } from '@/types/timeEntry'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import type { MarkedDates } from 'react-native-calendars/src/types'
import { SelectedDateSheetState } from '@/features/service-reports/components/SelectedDateSheet'
import CalendarDay from '@/components/CalendarDay'
import { useMemo } from 'react'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import type { CalendarViewMode } from '@/components/CalendarHeader'
import useServiceReport from '@/stores/serviceReport'
import { buildMonthCalendarMarkedDates } from '@/features/service-reports/lib/monthCalendarMarkedDates'

type MonthTimeReportsCalendarProps = {
  month: number
  year: number
  monthsReports: TimeEntry[] | null
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  viewMode?: CalendarViewMode
}

const MonthTimeReportsCalendar: React.FC<MonthTimeReportsCalendarProps> = ({
  month,
  year,
  monthsReports,
  setSheet,
  viewMode = 'planned',
}) => {
  const startOfWeek = useStartOfWeek()
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const theme = useTheme()
  const monthToView = moment().month(month).year(year).format('YYYY-MM-DD')

  const markedDates: MarkedDates = useMemo(
    () =>
      buildMonthCalendarMarkedDates({
        month,
        year,
        monthsReports,
        dayPlans,
        recurringPlans,
        reportDotColor: theme.colors.accent,
      }),
    [dayPlans, month, monthsReports, recurringPlans, theme.colors.accent, year]
  )

  return (
    <Calendar
      key={`${monthToView}-${theme.colors.background}`}
      current={monthToView}
      firstDay={startOfWeek}
      disableMonthChange
      hideArrows
      renderHeader={() => null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onDayPress={(day: any) => {
        const date = moment(day.dateString).toDate()
        setSheet({ open: true, date })
      }}
      style={{
        paddingBottom: 0,
        paddingTop: 0,
        paddingLeft: 0,
        paddingRight: 0,
      }}
      markedDates={markedDates}
      markingType='custom'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dayComponent={(props: any) => (
        <CalendarDay
          monthsReports={monthsReports}
          viewMode={viewMode}
          dayPlansOverride={dayPlans}
          recurringPlansOverride={recurringPlans}
          {...props}
        />
      )}
      theme={{
        calendarBackground: 'transparent',
        dayTextColor: theme.colors.text,
        textDisabledColor: theme.colors.textAlt,
        textDayHeaderFontSize: theme.fontSize('md'),
        selectedDayBackgroundColor: theme.colors.accent,
        todayTextColor: theme.colors.text,
        todayBackgroundColor: theme.colors.accentTranslucent,
      }}
    />
  )
}

export default MonthTimeReportsCalendar
