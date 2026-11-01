import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import ContextMenu from '@/components/ui/ContextMenu'
import DayPreview, { dayHasPreview } from '@/components/DayPreview'
import useDayMenuActions from '@/hooks/useDayMenuActions'
import useLocalDay from '@/hooks/useLocalDay'
import useServiceReport from '@/stores/serviceReport'
import moment from 'moment'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { localDayKey, storedDayKey } from '@/lib/normalizeDate'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import {
  RecurringPlan,
  getPlansIntersectingDay,
  getEffectiveNoteForRecurringPlan,
  plannedMinutesForDay,
} from '@/lib/recurrence'
import { usePreferences } from '@/stores/preferences'
import { Theme } from '@/types/theme'
import { formatMinutesCompact, formatMinutesSpoken } from '@/lib/minutes'
import { formatDisplay } from '@/lib/dates'
import { calendarDayAccessibilityLabel } from '@/lib/calendarDayLabel'
import { entryMinutes } from '@/lib/entryMinutes'
import { isCountableEntry } from '@/lib/serviceReport'
import { hasNote as noteExists } from '@/lib/richText/notes'
import { touchTargetFrame } from '@/components/ui/touchTarget'

const boxSize = 40

export type DateData = {
  year: number

  month: number
  day: number
  timestamp: number

  dateString: string
}

type DayProps = {
  date?: DateData | undefined
  state?: 'disabled' | 'today' | ''
  onPress?: (date?: DateData) => void
}

const FONT_SCALE_CAP = 1.15

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
  if (backgroundColor === theme.colors.background) {
    return theme.colors.textAlt
  }

  return theme.colors.textInverse
}

const NonPlannedDay = (
  props: DayProps & {
    serviceReports: TimeEntry[] | undefined
    viewMode?: CalendarViewMode
    height?: number

    today: string
  }
) => {
  const theme = useTheme()
  const minutesForDay =
    props.serviceReports?.reduce(
      (acc, report) => acc + entryMinutes(report),
      0
    ) || 0
  const actualDurationText = formatMinutesCompact(minutesForDay)

  if (!props.date) return null
  const disabled = props.state === 'disabled'
  const isToday = props.date.dateString === props.today
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
        maxFontSizeMultiplier={FONT_SCALE_CAP}
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
          maxFontSizeMultiplier={FONT_SCALE_CAP}
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
  props: DayProps & {
    serviceReports: TimeEntry[] | undefined
    dayPlans?: DayPlan[]
    recurringPlans?: RecurringPlan[]
    viewMode?: CalendarViewMode
    height?: number

    today: string
  }
) => {
  const theme = useTheme()
  const minutesForDay =
    props.serviceReports?.reduce(
      (acc, report) => acc + entryMinutes(report),
      0
    ) || 0

  const disabled = props.state === 'disabled'

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

  const recurringPlanHasNote = props.recurringPlans?.some((plan) => {
    const effectiveNote = getEffectiveNoteForRecurringPlan(
      plan,
      moment(props.date!.dateString).toDate()
    )
    return noteExists(effectiveNote)
  })

  const hasNote = !!(
    props.dayPlans?.some(noteExists) ||
    props.serviceReports?.some(noteExists) ||
    recurringPlanHasNote
  )
  const hitGoal =
    wentInService && plannedMinutes > 0 && minutesForDay >= plannedMinutes
  const dateString = props.date?.dateString ?? props.today
  const dateInPast = dateString <= props.today
  const isToday = dateString === props.today

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
        maxFontSizeMultiplier={FONT_SCALE_CAP}
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
              maxFontSizeMultiplier={FONT_SCALE_CAP}
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
              maxFontSizeMultiplier={FONT_SCALE_CAP}
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
  props: DayProps & {
    monthsReports: TimeEntry[] | null
    viewMode?: CalendarViewMode
    height?: number

    dayPlansOverride?: DayPlan[]
    recurringPlansOverride?: RecurringPlan[]

    overlay?: ReactNode

    overlayAccessibilityLabel?: string

    selected?: boolean
  }
) => {
  const storeDayPlans = useServiceReport((s) => s.dayPlans)
  const storeRecurringPlans = useServiceReport((s) => s.recurringPlans)
  const dayPlans = props.dayPlansOverride ?? storeDayPlans
  const recurringPlans = props.recurringPlansOverride ?? storeRecurringPlans
  const theme = useTheme()
  const today = useLocalDay()

  const dateString = props.date?.dateString
  const dayKey = dateString ? localDayKey(dateString) : undefined
  const reportsForDay =
    dayKey && props.monthsReports
      ? props.monthsReports.filter(
          (report) => storedDayKey(report.date) === dayKey
        )
      : []
  const dayPlansForDay = dateString
    ? dayPlansOnLocalDay(dayPlans, dateString)
    : []
  const recurringPlansForDay = dateString
    ? getPlansIntersectingDay(moment(dateString).toDate(), recurringPlans)
    : []

  const disabled = props.state === 'disabled'
  const localDay = dateString ? moment(dateString).toDate() : undefined

  const menu = useDayMenuActions(disabled ? undefined : localDay)

  if (props.date === undefined || !dateString || !localDay) return null

  const loggedMinutes = reportsForDay.reduce(
    (acc, report) => acc + entryMinutes(report),
    0
  )
  const wentInService = reportsForDay.some(isCountableEntry)
  const accessibilityLabel = calendarDayAccessibilityLabel(
    {
      date: formatDisplay(localDay, 'dddd, LL'),
      isToday: dateString === today,
      isPast: dateString < today,
      wentInService,
      loggedMinutes,
      hasPlan: !!(dayPlansForDay.length || recurringPlansForDay.length),
      plannedMinutes: plannedMinutesForDay(
        localDay,
        dayPlansForDay,
        recurringPlansForDay
      ),
      hasNote:
        reportsForDay.some(noteExists) ||
        dayPlansForDay.some(noteExists) ||
        recurringPlansForDay.some((plan) =>
          noteExists(getEffectiveNoteForRecurringPlan(plan, localDay))
        ),
      extra: props.overlayAccessibilityLabel,
    },
    formatMinutesSpoken
  )

  const frame = touchTargetFrame(boxSize, props.height ?? boxSize)
  const inset = (frame.width as number) / 2 - boxSize / 2

  const previewData = {
    reports: reportsForDay,
    dayPlans: dayPlansForDay,
    recurringPlans: recurringPlansForDay,
  }

  return (
    <ContextMenu
      actions={menu}
      deferHost
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!props.selected }}
      onPress={() => {
        props.onPress?.(props.date)
        const { howToAddPlan, removeHint } = usePreferences.getState()
        if (howToAddPlan) {
          removeHint('howToAddPlan')
        }
      }}
      preview={
        !disabled && dayHasPreview(previewData) ? (
          <DayPreview date={localDay} {...previewData} />
        ) : undefined
      }
      pointerEffect={disabled ? 'none' : 'highlight'}
      hoverRadius={theme.numbers.borderRadiusSm + inset}
      style={{
        opacity: disabled ? 0.4 : 1,
        marginHorizontal: frame.marginHorizontal,
        marginVertical: frame.marginVertical,
      }}
    >
      <View
        style={{
          width: frame.width,
          height: frame.height,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View>
          {dayPlansForDay.length || recurringPlansForDay.length ? (
            <PlannedDay
              {...props}
              serviceReports={reportsForDay}
              dayPlans={dayPlansForDay}
              recurringPlans={recurringPlansForDay}
              today={today}
            />
          ) : (
            <NonPlannedDay
              {...props}
              serviceReports={reportsForDay}
              today={today}
            />
          )}
          {props.overlay ? (
            <View pointerEvents='none' style={StyleSheet.absoluteFill}>
              {props.overlay}
            </View>
          ) : null}
        </View>
      </View>
    </ContextMenu>
  )
}

export default CalendarDay
