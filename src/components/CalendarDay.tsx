import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { DateData } from 'react-native-calendars'
import { DayProps } from 'react-native-calendars/src/calendar/day'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import ContextMenu from '@/components/ui/ContextMenu'
import DayPreview, { dayHasPreview } from '@/components/DayPreview'
import useDayMenuActions from '@/hooks/useDayMenuActions'
import useServiceReport from '@/stores/serviceReport'
import moment from 'moment'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import {
  RecurringPlan,
  getPlansIntersectingDay,
  getEffectiveNoteForRecurringPlan,
  plannedMinutesForDay,
} from '@/lib/recurrence'
import { usePreferences } from '@/stores/preferences'
import { Theme } from '@/types/theme'
import { formatMinutesCompact } from '@/lib/minutes'
import { isCountableEntry } from '@/lib/serviceReport'

const boxSize = 40

/**
 * What a day's square counts: its Plans, the time logged, or (`auto`) the time
 * logged once there is some and the Plans until then.
 */
export type CalendarViewMode = 'planned' | 'actual' | 'auto'

export const getDateStatusColor = (
  theme: Theme,
  wentInService: boolean,
  isToday: boolean,
  dateInPast: boolean,
  hitGoal: boolean
): { bg: string; text: string } => {
  if (!wentInService && (!dateInPast || isToday))
    return {
      bg: theme.colors.background,
      text: theme.colors.text,
    }
  if (!wentInService)
    return {
      bg: theme.colors.error,
      text: theme.colors.textInverse,
    }
  if (hitGoal)
    return {
      bg: theme.colors.accent,
      text: theme.colors.textInverse,
    }
  return {
    bg: theme.colors.warn,
    text: theme.colors.textInverse,
  }
}

const getNoteIndicatorColor = (
  theme: Theme,
  backgroundColor: string
): string => {
  // For light backgrounds (planned/background), use dark indicator
  if (backgroundColor === theme.colors.background) {
    return theme.colors.textAlt
  }
  // For dark/colored backgrounds (error, warn, accent), use light indicator
  return theme.colors.textInverse
}

const NonPlannedDay = (
  props: Omit<DayProps, 'date'> & {
    date?: DateData | undefined
    serviceReports: TimeEntry[] | undefined
    viewMode?: CalendarViewMode
    height?: number
  }
) => {
  const theme = useTheme()
  const minutesForDay =
    props.serviceReports?.reduce(
      (acc, report) => acc + report.minutes + report.hours * 60,
      0
    ) || 0
  const actualDurationText = formatMinutesCompact(minutesForDay)

  if (!props.date) return null
  const disabled = props.state === 'disabled'
  const isToday = moment().isSame(props.date.dateString, 'day')
  const wentInService = !!props.serviceReports?.some(isCountableEntry)
  const hasNote = !!props.serviceReports?.some((report) => report.note)
  const showActualTime =
    (props.viewMode === 'actual' || props.viewMode === 'auto') &&
    wentInService &&
    !disabled

  const backgroundColor = disabled
    ? undefined
    : wentInService
      ? theme.colors.accent
      : undefined

  return (
    <View
      style={{
        width: boxSize,
        height: props.height ?? boxSize,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 2,
        borderRadius: theme.numbers.borderRadiusSm,
        borderWidth: isToday ? 3 : 0,
        borderColor: theme.colors.text,
        backgroundColor: backgroundColor,
        position: 'relative',
      }}
    >
      <Text
        style={{
          color: disabled
            ? theme.colors.textAlt
            : wentInService
              ? theme.colors.textInverse
              : theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {props.date?.day}
      </Text>
      {showActualTime && (
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textInverse,
          }}
          numberOfLines={1}
          ellipsizeMode='tail'
        >
          {actualDurationText}
        </Text>
      )}
      {hasNote && (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: getNoteIndicatorColor(
              theme,
              backgroundColor || theme.colors.background
            ),
          }}
        />
      )}
    </View>
  )
}

const PlannedDay = (
  props: Omit<DayProps, 'date'> & {
    date?: DateData | undefined
    serviceReports: TimeEntry[] | undefined
    dayPlans?: DayPlan[]
    recurringPlans?: RecurringPlan[]
    viewMode?: CalendarViewMode
    height?: number
  }
) => {
  const theme = useTheme()
  const minutesForDay =
    props.serviceReports?.reduce(
      (acc, report) => acc + report.minutes + report.hours * 60,
      0
    ) || 0

  const disabled = props.state === 'disabled'
  // Every Plan on the day adds up: each Day Plan and each recurring instance
  // (with its override for the day).
  const hasDayPlans = !!props.dayPlans?.length
  const plannedMinutes = plannedMinutesForDay(
    moment(props.date!.dateString).toDate(),
    props.dayPlans ?? [],
    props.recurringPlans ?? []
  )
  const plannedDurationText = formatMinutesCompact(plannedMinutes)
  const actualDurationText = formatMinutesCompact(minutesForDay)
  const wentInService = !!props.serviceReports?.some(isCountableEntry)
  const showActual =
    props.viewMode === 'actual' || (props.viewMode === 'auto' && wentInService)

  const hasAPlan = hasDayPlans || !!props.recurringPlans?.length

  // Check for notes from day plans, service reports, and recurring plans (with overrides)
  const recurringPlanHasNote = props.recurringPlans?.some((plan) => {
    const effectiveNote = getEffectiveNoteForRecurringPlan(
      plan,
      moment(props.date!.dateString).toDate()
    )
    return !!effectiveNote
  })

  const hasNote = !!(
    props.dayPlans?.some((plan) => plan.note) ||
    props.serviceReports?.some((report) => report.note) ||
    recurringPlanHasNote
  )
  const hitGoal =
    wentInService && plannedMinutes > 0 && minutesForDay >= plannedMinutes
  const dateInPast = moment(props.date?.dateString).isSameOrBefore(
    moment(),
    'day'
  )
  const isToday = moment().isSame(props.date?.dateString, 'day')

  const statusColor = disabled
    ? {
        bg: undefined,
        text: theme.colors.textAlt,
      }
    : getDateStatusColor(theme, wentInService, isToday, dateInPast, hitGoal)

  const noteIndicatorColor = getNoteIndicatorColor(
    theme,
    statusColor.bg || theme.colors.background
  )

  return (
    <View
      style={{
        width: boxSize,
        height: props.height ?? boxSize,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 2,
        borderRadius: theme.numbers.borderRadiusSm,
        borderWidth: isToday ? 3 : 0,
        borderColor: theme.colors.text,
        backgroundColor: statusColor.bg,
        position: 'relative',
      }}
    >
      <Text
        style={{
          color: disabled ? theme.colors.textAlt : statusColor.text,
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {props.date?.day}
      </Text>
      {showActual
        ? wentInService && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: statusColor.text,
              }}
              numberOfLines={1}
              ellipsizeMode='tail'
            >
              {actualDurationText}
            </Text>
          )
        : hasAPlan && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: statusColor.text,
              }}
              numberOfLines={1}
              ellipsizeMode='tail'
            >
              {plannedDurationText}
            </Text>
          )}
      {hasNote && (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: noteIndicatorColor,
          }}
        />
      )}
    </View>
  )
}

const CalendarDay = (
  props: Omit<DayProps, 'date'> & {
    date?: DateData | undefined
    monthsReports: TimeEntry[] | null
    viewMode?: CalendarViewMode
    height?: number
    /**
     * When provided, used in place of the live store. Lets non-app surfaces
     * (onboarding previews, screenshots) show a planned day without writing to
     * the user's actual schedule.
     */
    dayPlansOverride?: DayPlan[]
    recurringPlansOverride?: RecurringPlan[]
    /**
     * Drawn over the cell, positioned within its box, e.g. who a Plan is with.
     * Read by VoiceOver along with the day.
     */
    overlay?: ReactNode
  }
) => {
  // Only the slices a day reads: the Schedule keeps hundreds of days mounted,
  // and a whole-store subscription re-renders every one on any change.
  const storeDayPlans = useServiceReport((s) => s.dayPlans)
  const storeRecurringPlans = useServiceReport((s) => s.recurringPlans)
  const dayPlans = props.dayPlansOverride ?? storeDayPlans
  const recurringPlans = props.recurringPlansOverride ?? storeRecurringPlans
  const theme = useTheme()

  const dateString = props.date?.dateString
  const reportsForDay =
    dateString && props.monthsReports
      ? props.monthsReports.filter((report) =>
          isStoredDateOnLocalDay(report.date, dateString)
        )
      : []
  const dayPlansForDay = dateString
    ? dayPlans.filter((plan) => isStoredDateOnLocalDay(plan.date, dateString))
    : []
  const recurringPlansForDay = dateString
    ? getPlansIntersectingDay(moment(dateString).toDate(), recurringPlans)
    : []

  const disabled = props.state === 'disabled'
  const localDay = dateString ? moment(dateString).toDate() : undefined
  // Adjacent-month cells aren't selectable, so they get no menu either.
  const menu = useDayMenuActions(disabled ? undefined : localDay)

  if (props.date === undefined || !dateString || !localDay) return null

  const previewData = {
    reports: reportsForDay,
    dayPlans: dayPlansForDay,
    recurringPlans: recurringPlansForDay,
  }

  return (
    <ContextMenu
      actions={menu}
      onPress={() => {
        props.onPress?.(props.date)
        const { howToAddPlan, removeHint } = usePreferences.getState()
        if (howToAddPlan) {
          removeHint('howToAddPlan')
        }
      }}
      // The square only shows totals; the preview lists the day's entries.
      preview={
        !disabled && dayHasPreview(previewData) ? (
          <DayPreview date={localDay} {...previewData} />
        ) : undefined
      }
      pointerEffect={disabled ? 'none' : 'highlight'}
      hoverRadius={theme.numbers.borderRadiusSm}
      style={{
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {/* The overlay sits inside the trigger so VoiceOver reads it with its day. */}
      <View>
        {dayPlansForDay.length || recurringPlansForDay.length ? (
          <PlannedDay
            {...props}
            serviceReports={reportsForDay}
            dayPlans={dayPlansForDay}
            recurringPlans={recurringPlansForDay}
          />
        ) : (
          <NonPlannedDay {...props} serviceReports={reportsForDay} />
        )}
        {props.overlay ? (
          <View pointerEvents='none' style={StyleSheet.absoluteFill}>
            {props.overlay}
          </View>
        ) : null}
      </View>
    </ContextMenu>
  )
}

export default CalendarDay
