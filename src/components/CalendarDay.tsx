import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import ContextMenu from '@/components/ui/ContextMenu'
import DayPreview, { dayHasPreview } from '@/components/DayPreview'
import useDayMenuActions from '@/hooks/useDayMenuActions'
import useLocalDay from '@/hooks/useLocalDay'
import useServiceReport from '@/stores/serviceReport'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { localDayKey, storedDayKey } from '@/lib/normalizeDate'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import type { RecurringPlan } from '@/lib/recurrence'
import { usePreferences } from '@/stores/preferences'
import { Theme } from '@/types/theme'
import {
  buildCalendarDayModel,
  calendarDayModelLabel,
  type CalendarDayModel,
} from '@/components/calendarDayModel'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import { perf } from '@/lib/perf'

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

type DayViewProps = {
  model: CalendarDayModel
  state?: 'disabled' | 'today' | ''
  viewMode?: CalendarViewMode
  height?: number

  today: string
}

const NonPlannedDay = ({
  model,
  state,
  viewMode,
  height,
  today,
}: DayViewProps) => {
  const theme = useTheme()
  const disabled = state === 'disabled'
  const isToday = model.dateString === today
  const { wentInService } = model
  const showActualTime =
    (viewMode === 'actual' || viewMode === 'auto') && wentInService && !disabled

  const backgroundColor = disabled
    ? undefined
    : wentInService
      ? theme.colors.accent
      : undefined

  return (
    <View
      style={{
        width: boxSize,
        height: height ?? boxSize,
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
        {model.localDay.getDate()}
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
          {model.loggedText}
        </Text>
      )}
      {model.noteDot && (
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

const PlannedDay = ({
  model,
  state,
  viewMode,
  height,
  today,
}: DayViewProps) => {
  const theme = useTheme()
  const disabled = state === 'disabled'
  const { wentInService, plannedMinutes, loggedMinutes } = model
  const showActual =
    viewMode === 'actual' || (viewMode === 'auto' && wentInService)

  const hitGoal =
    wentInService && plannedMinutes > 0 && loggedMinutes >= plannedMinutes
  const dateString = model.dateString
  const dateInPast = dateString <= today
  const isToday = dateString === today

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
        height: height ?? boxSize,
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
        {model.localDay.getDate()}
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
              {model.loggedText}
            </Text>
          )
        : model.planned && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: statusColor.text,
              }}
              numberOfLines={1}
              ellipsizeMode='tail'
              maxFontSizeMultiplier={FONT_SCALE_CAP}
            >
              {model.plannedText}
            </Text>
          )}
      {model.noteDot && (
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

type CellProps = {
  model: CalendarDayModel
  state?: 'disabled' | 'today' | ''
  onPress?: (date: Date) => void
  viewMode?: CalendarViewMode
  height?: number

  today: string

  overlay?: ReactNode

  overlayAccessibilityLabel?: string

  selected?: boolean
}

export const CalendarDayCell = ({
  model,
  state,
  onPress,
  viewMode,
  height,
  today,
  overlay,
  overlayAccessibilityLabel,
  selected,
}: CellProps) => {
  perf.count('render:CalendarDay')
  const theme = useTheme()
  const disabled = state === 'disabled'
  const { localDay } = model

  const menu = useDayMenuActions(disabled ? undefined : localDay)

  const accessibilityLabel = calendarDayModelLabel(
    model,
    today,
    overlayAccessibilityLabel
  )

  const frame = touchTargetFrame(boxSize, height ?? boxSize)
  const inset = (frame.width as number) / 2 - boxSize / 2

  const previewData = {
    reports: model.reports,
    dayPlans: model.dayPlans,
    recurringPlans: model.recurringPlans,
  }
  const dayProps = { model, state, viewMode, height, today }

  return (
    <ContextMenu
      actions={menu}
      deferHost
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        onPress?.(localDay)
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
          {model.planned ? (
            <PlannedDay {...dayProps} />
          ) : (
            <NonPlannedDay {...dayProps} />
          )}
          {overlay ? (
            <View pointerEvents='none' style={StyleSheet.absoluteFill}>
              {overlay}
            </View>
          ) : null}
        </View>
      </View>
    </ContextMenu>
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
  const today = useLocalDay()

  const dateString = props.date?.dateString
  if (props.date === undefined || !dateString) return null
  const dayKey = localDayKey(dateString)
  const model = buildCalendarDayModel({
    dateString,
    reports: props.monthsReports
      ? props.monthsReports.filter(
          (report) => storedDayKey(report.date) === dayKey
        )
      : [],
    dayPlans: dayPlansOnLocalDay(dayPlans, dateString),
    recurringPlans,
  })
  const date = props.date

  return (
    <CalendarDayCell
      model={model}
      state={props.state}
      onPress={props.onPress ? () => props.onPress?.(date) : undefined}
      viewMode={props.viewMode}
      height={props.height}
      today={today}
      overlay={props.overlay}
      overlayAccessibilityLabel={props.overlayAccessibilityLabel}
      selected={props.selected}
    />
  )
}

export default CalendarDay
