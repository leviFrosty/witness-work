import React, { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { DateData } from 'react-native-calendars'
import { DayProps } from 'react-native-calendars/src/calendar/day'
import Text from './MyText'
import useTheme from '../contexts/theme'
import Button from './Button'
import useServiceReport from '../stores/serviceReport'
import moment from 'moment'
import { DayPlan, ServiceReport } from '../types/serviceReport'
import { RecurringPlan, getPlansIntersectingDay } from '../lib/serviceReport'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import IconButton from './IconButton'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons'
import { usePreferences } from '../stores/preferences'
import { Theme } from '../types/theme'
import { useCompactFormattedMinutes } from '../lib/minutes'

const boxSize = 40

export const getDateStatusColor = (
  theme: Theme,
  wentInService: boolean,
  isToday: boolean,
  dateInPast: boolean,
  hitGoal: boolean
): { bg: string; text: string } => {
  if (!dateInPast || (isToday && !wentInService))
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
  props: DayProps & {
    date?: DateData | undefined
    serviceReports: ServiceReport[] | undefined
  }
) => {
  const theme = useTheme()

  if (!props.date) return null
  const disabled = props.state === 'disabled'
  const isToday = moment().isSame(props.date.dateString, 'day')
  const wentInService = !!props.serviceReports?.length
  const hasNote = !!props.serviceReports?.some((report) => report.note)

  const backgroundColor = disabled
    ? undefined
    : wentInService
      ? theme.colors.accent
      : undefined

  return (
    <View
      style={{
        width: boxSize,
        height: boxSize,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
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
    date?: DateData | undefined
    serviceReports: ServiceReport[] | undefined
    dayPlan?: DayPlan
    recurringPlans?: RecurringPlan[]
  }
) => {
  const theme = useTheme()
  const minutesForDay =
    props.serviceReports?.reduce(
      (acc, report) => acc + report.minutes + report.hours * 60,
      0
    ) || 0

  const disabled = props.state === 'disabled'

  const highestRecurringPlanMinutes = props.recurringPlans?.sort(
    (a, b) => b.minutes - a.minutes
  )[0]?.minutes

  const plannedMinutes =
    props.dayPlan?.minutes || highestRecurringPlanMinutes || 0
  const plannedDurationText = useCompactFormattedMinutes(plannedMinutes)

  const wentInService = !!props.serviceReports?.length
  const hasAPlan = !!(props.dayPlan || props.recurringPlans?.length)
  const hasNote = !!(
    props.dayPlan?.note || props.serviceReports?.some((report) => report.note)
  )
  const hitDayPlanGoal =
    wentInService &&
    props.dayPlan?.minutes &&
    minutesForDay >= props.dayPlan?.minutes

  const hitRecurringPlanGoal =
    wentInService &&
    highestRecurringPlanMinutes &&
    minutesForDay >= highestRecurringPlanMinutes

  const hitGoal = props.dayPlan ? !!hitDayPlanGoal : !!hitRecurringPlanGoal
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
        height: boxSize,
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
      {hasAPlan && (
        <Text
          style={{ fontSize: theme.fontSize('xs'), color: statusColor.text }}
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
  props: DayProps & {
    date?: DateData | undefined
    planMode?: boolean
    monthsReports: ServiceReport[] | null
  }
) => {
  const { dayPlans, recurringPlans } = useServiceReport()
  const translateY = useSharedValue(0)
  const theme = useTheme()
  const { howToAddPlan, removeHint } = usePreferences()

  const isToday = moment().isSame(props.date?.dateString, 'day')

  useEffect(() => {
    translateY.value = withRepeat(withTiming(-10, { duration: 600 }), 0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    }
  })

  const reportsForDay = useMemo(() => {
    if (
      props.date === undefined ||
      !props.date?.dateString ||
      !props.monthsReports
    ) {
      return []
    }

    return props.monthsReports.filter((report) =>
      moment(report.date).isSame(props.date?.dateString, 'day')
    )
  }, [props.date, props.monthsReports])

  const dayPlan = useMemo(
    () =>
      props.date?.dateString
        ? dayPlans.find((plan) =>
            moment(plan.date).isSame(props.date?.dateString, 'day')
          )
        : undefined,
    [dayPlans, props.date]
  )

  const recurringPlansForDay = useMemo(() => {
    if (props.date === undefined || !props.date.dateString) return []
    return getPlansIntersectingDay(
      moment(props.date.dateString).toDate(),
      recurringPlans
    )
  }, [props.date, recurringPlans])

  if (props.date === undefined || !props.date.dateString) return null

  return (
    <View style={{ position: 'relative' }}>
      <Button
        onPress={() => {
          props.onPress?.(props.date)
          if (howToAddPlan) {
            removeHint('howToAddPlan')
          }
        }}
        style={{ opacity: props.state === 'disabled' ? 0.4 : 1 }}
      >
        {(dayPlan ?? !!recurringPlansForDay?.length) ? (
          <PlannedDay
            {...props}
            serviceReports={reportsForDay}
            dayPlan={dayPlan}
            recurringPlans={recurringPlansForDay}
          />
        ) : (
          <NonPlannedDay {...props} serviceReports={reportsForDay} />
        )}
      </Button>
      {props.planMode && isToday && howToAddPlan && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: 5,
              bottom: -25,
            },
            animatedStyle,
          ]}
        >
          <IconButton icon={faArrowUp} size={30} color={theme.colors.accent} />
        </Animated.View>
      )}
    </View>
  )
}

export default CalendarDay
