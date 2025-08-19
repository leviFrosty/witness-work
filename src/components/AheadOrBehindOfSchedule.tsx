import { useMemo } from 'react'
import useTheme from '../contexts/theme'
import Text from './MyText'
import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  plannedMinutesToCurrentDayForMonth,
  totalMinutesForSpecificMonthUpToDayOfMonth,
} from '../lib/serviceReport'
import useServiceReport from '../stores/serviceReport'
import { usePreferences } from '../stores/preferences'
import i18n from '../lib/locales'
import { ThemeSizes } from '../types/theme'
import { useFormattedMinutes } from '../lib/minutes'

type AheadOrBehindOfMonthScheduleProps = {
  month: number
  year: number
  fontSize?: ThemeSizes
}

export default function AheadOrBehindOfMonthSchedule(
  props: AheadOrBehindOfMonthScheduleProps
) {
  const { month, year } = props
  const theme = useTheme()
  const { publisher, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const { dayPlans, recurringPlans, serviceReports } = useServiceReport()

  const plannedMinutesToCurrentDay = useMemo(() => {
    return plannedMinutesToCurrentDayForMonth(
      month,
      year,
      dayPlans,
      recurringPlans
    )
  }, [dayPlans, month, recurringPlans, year])

  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year) ?? [],
    [month, serviceReports, year]
  )

  const actualMinutesToCurrentDay = useMemo(() => {
    const selectedMonth = moment().month(month).year(year)

    const dayOfMonth = selectedMonth.isBefore(moment(), 'month')
      ? selectedMonth.daysInMonth()
      : moment().date()

    return totalMinutesForSpecificMonthUpToDayOfMonth(
      monthReports,
      dayOfMonth,
      month,
      year
    )
  }, [month, monthReports, year])

  const adjustedMinutesForMonth = useMemo(() => {
    return adjustedMinutesForSpecificMonth(
      monthReports,
      month,
      year,
      publisher,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
  }, [
    month,
    monthReports,
    year,
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const minutesDiffToSchedule = useMemo(() => {
    const minutesForMonth =
      adjustedMinutesForMonth.value < actualMinutesToCurrentDay
        ? adjustedMinutesForMonth.value
        : actualMinutesToCurrentDay
    return minutesForMonth - plannedMinutesToCurrentDay
  }, [
    actualMinutesToCurrentDay,
    adjustedMinutesForMonth.value,
    plannedMinutesToCurrentDay,
  ])

  const formattedTimeDiff = useFormattedMinutes(Math.abs(minutesDiffToSchedule))

  /** Previous month has no plans or the */
  if (plannedMinutesToCurrentDay === 0) {
    return null
  }

  if (minutesDiffToSchedule === 0) {
    return (
      <Text
        style={{
          color:
            minutesDiffToSchedule >= 0
              ? theme.colors.accent
              : theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize(props.fontSize ?? 'md'),
        }}
      >
        {i18n.t('onSchedule')}
      </Text>
    )
  }

  return (
    <Text
      style={{
        color:
          minutesDiffToSchedule >= 0 ? theme.colors.accent : theme.colors.error,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize(props.fontSize ?? 'md'),
        textTransform: 'lowercase',
      }}
    >
      {`${formattedTimeDiff.formatted} ${minutesDiffToSchedule > 0 ? i18n.t('aheadOfSchedule') : i18n.t('behindSchedule')}`}
    </Text>
  )
}
