import React, { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { DateData } from 'react-native-calendars'
import { DayProps } from 'react-native-calendars/src/calendar/day'
import Text from './MyText'
import useTheme from '../contexts/theme'
import Button from './Button'
import useServiceReport, { DayPlan } from '../stores/serviceReport'
import moment from 'moment'
import { ServiceReport } from '../types/serviceReport'
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

const boxSize = 40

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

  return (
    <View
      style={{
        width: boxSize,
        height: boxSize,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.numbers.borderRadiusSm,
        borderWidth: isToday ? 1 : 0,
        borderColor: theme.colors.accent,
        backgroundColor: props.serviceReports?.length
          ? theme.colors.accentTranslucent
          : undefined,
      }}
    >
      <Text
        style={{
          color: disabled ? theme.colors.textAlt : theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {props.date?.day}
      </Text>
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

  const plannedDurationText = `${moment
    .duration(props.dayPlan?.minutes || highestRecurringPlanMinutes, 'minutes')
    .humanize()}`

  const wentInService = !!props.serviceReports?.length
  const hasAPlan = !!(props.dayPlan || props.recurringPlans?.length)
  const hitDayPlanGoal =
    wentInService &&
    props.dayPlan?.minutes &&
    minutesForDay >= props.dayPlan?.minutes

  const hitRecurringPlanGoal =
    wentInService &&
    highestRecurringPlanMinutes &&
    minutesForDay >= highestRecurringPlanMinutes

  const hitGoal = !!hitDayPlanGoal || !!hitRecurringPlanGoal
  const dateInPast = moment(props.date?.dateString).isBefore(moment(), 'day')
  const isToday = moment().isSame(props.date?.dateString, 'day')

  const backgroundColor = (() => {
    if (!dateInPast) return theme.colors.backgroundLighter
    if (!wentInService) return theme.colors.errorTranslucent
    if (hitGoal) return theme.colors.accentTranslucent
    return theme.colors.warnTranslucent
  })()

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
        borderWidth: isToday ? 1 : 0,
        borderColor: theme.colors.accent,
        backgroundColor,
      }}
    >
      <Text
        style={{
          color: disabled ? theme.colors.textAlt : theme.colors.text,
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {props.date?.day}
      </Text>
      {hasAPlan && (
        <Text
          style={{ fontSize: theme.fontSize('xs') }}
          numberOfLines={1}
          ellipsizeMode='tail'
        >
          {plannedDurationText}
        </Text>
      )}
    </View>
  )
}

const CalendarDay = (
  props: DayProps & {
    date?: DateData | undefined
    planMode?: boolean
  }
) => {
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const translateY = useSharedValue(0)
  const theme = useTheme()
  const { howToAddPlan, removeHint } = usePreferences()

  const isToday = moment().isSame(props.date?.dateString, 'day')

  useEffect(() => {
    translateY.value = withRepeat(withTiming(-15, { duration: 500 }), -1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    }
  })

  const reportsForDay = useMemo(() => {
    if (props.date === undefined || !props.date?.dateString) {
      return []
    }

    return serviceReports.filter((report) =>
      moment(report.date).isSame(props.date?.dateString, 'day')
    )
  }, [props.date, serviceReports])

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
          if (props.planMode && moment().isAfter(props.date?.dateString, 'day'))
            return
          props.onPress?.(props.date)
          if (howToAddPlan) {
            removeHint('howToAddPlan')
          }
        }}
        style={{ opacity: props.state === 'disabled' ? 0.4 : 1 }}
      >
        {dayPlan ?? !!recurringPlansForDay?.length ? (
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
              bottom: -35,
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
