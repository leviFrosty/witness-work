import { Calendar, LocaleConfig } from 'react-native-calendars'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'
import useTheme from '../contexts/theme'
import { MarkedDates } from 'react-native-calendars/src/types'
import { SelectedDateSheetState } from './SelectedDateSheet'
import CalendarDay from './CalendarDay'
import CalendarKey from './CalendarKey'

type MonthTimeReportsCalendarProps = {
  month: number
  year: number
  monthsReports: ServiceReport[] | null
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
}

LocaleConfig.locales['default'] = {
  monthNames: moment.months(),
  monthNamesShort: moment.monthsShort(),
  dayNames: moment.weekdays(),
  dayNamesShort: moment.weekdaysShort(),
}

LocaleConfig.defaultLocale = 'default'

const MonthTimeReportsCalendar: React.FC<MonthTimeReportsCalendarProps> = ({
  month,
  year,
  monthsReports,
  setSheet,
}) => {
  const theme = useTheme()
  const monthToView = moment().month(month).year(year).format('YYYY-MM-DD')

  const markedDates: MarkedDates = (() => {
    if (monthsReports === null) {
      return {}
    }

    const markedDates: MarkedDates = {}

    monthsReports.forEach((report) => {
      const date = moment(report.date).format('YYYY-MM-DD')
      markedDates[date] = { marked: true, dotColor: theme.colors.accent }
    })

    return markedDates
  })()

  return (
    <Calendar
      key={monthToView}
      current={monthToView}
      disableMonthChange
      hideArrows
      renderHeader={() => <CalendarKey showPlanSchedule={{ month, year }} />}
      onDayPress={(day) => {
        const date = moment(day.dateString).toDate()
        setSheet({ open: true, date })
      }}
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        paddingBottom: 10,
        paddingTop: 10,
        paddingLeft: 10,
        paddingRight: 10,
      }}
      markedDates={markedDates}
      markingType='custom'
      dayComponent={(props) => <CalendarDay {...props} />}
      theme={{
        backgroundColor: theme.colors.card,
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
