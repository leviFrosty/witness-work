import { Calendar } from 'react-native-calendars'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'
import useTheme from '../contexts/theme'
import { MarkedDates } from 'react-native-calendars/src/types'
import { SelectedDateSheetState } from './SelectedDateSheet'
import CalendarDay from './CalendarDay'
import { useMemo } from 'react'
import { usePreferences } from '../stores/preferences'

type MonthTimeReportsCalendarProps = {
  month: number
  year: number
  monthsReports: ServiceReport[] | null
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
}

const MonthTimeReportsCalendar: React.FC<MonthTimeReportsCalendarProps> = ({
  month,
  year,
  monthsReports,
  setSheet,
}) => {
  const { startOfWeek } = usePreferences()
  const theme = useTheme()
  const monthToView = moment().month(month).year(year).format('YYYY-MM-DD')

  const markedDates: MarkedDates = useMemo(() => {
    if (monthsReports === null) {
      return {}
    }

    const markedDates: MarkedDates = {}

    monthsReports.forEach((report) => {
      const date = moment(report.date).format('YYYY-MM-DD')
      markedDates[date] = { marked: true, dotColor: theme.colors.accent }
    })

    return markedDates
  }, [monthsReports, theme.colors.accent])

  return (
    <Calendar
      key={monthToView}
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
        <CalendarDay monthsReports={monthsReports} {...props} />
      )}
      theme={{
        calendarBackground: theme.colors.card,
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
