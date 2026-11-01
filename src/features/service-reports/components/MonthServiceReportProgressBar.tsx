import { View, ViewProps, Animated, StyleProp, ViewStyle } from 'react-native'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import { useServiceReport } from '@/stores/serviceReport'
import { getCategorySegmentColors } from '@/features/service-reports/lib/categorySegmentColors'
import useTheme from '@/contexts/theme'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getTotalMinutesDetailedForSpecificMonth,
} from '@/lib/serviceReport'
import { goalProgress } from '@/lib/goalProgress'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import usePublisher from '@/hooks/usePublisher'
import useAppActive from '@/hooks/useAppActive'
import useShownInTab from '@/hooks/useShownInTab'
import { forwardSign } from '@/lib/direction'

interface ProgressBarSegmentBaseProps extends ViewProps {
  borderRadiusStart?: boolean
  borderRadiusEnd?: boolean
}

const ProgressBarSegment = ({
  style,
  borderRadiusStart,
  borderRadiusEnd,
  ...props
}: ProgressBarSegmentBaseProps) => {
  const theme = useTheme()

  return (
    <View
      style={[
        [
          {
            borderTopStartRadius: borderRadiusStart
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomStartRadius: borderRadiusStart
              ? theme.numbers.borderRadiusSm
              : 0,
            borderTopEndRadius: borderRadiusEnd
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomEndRadius: borderRadiusEnd
              ? theme.numbers.borderRadiusSm
              : 0,
            height: 20,
          },
        ],
        [style],
      ]}
      {...props}
    />
  )
}

type ProgressBarSegmentProps = {
  percentage: number
  color?: string
}

const StandardHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
      borderRadiusStart
    />
  )
}

const LdcHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
    />
  )
}
const OtherHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
    />
  )
}

interface ProgressBarProps {
  month: number
  year: number
  minimal?: boolean

  animated?: boolean

  pulseDuration?: number
  style?: StyleProp<ViewStyle>
}

const MonthServiceReportProgressBar = ({
  month,
  year,
  minimal,
  animated = true,
  pulseDuration = 2000,
  style,
}: ProgressBarProps) => {
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { type: role } = usePublisher({ month, year })
  const { effectiveGoalHours: goalHours } = useMonthlyGoal({ month, year })

  const shown = useShownInTab()
  const appActive = useAppActive()
  const pulsing = animated && shown && appActive
  const pulseAnimation = useRef(new Animated.Value(0)).current
  const animationRef = useRef<Animated.CompositeAnimation | null>(null)
  const [shimmerContainerWidth, setShimmerContainerWidth] = useState<number>(0)
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )
  const adjustedMinutes = useMemo(
    () =>
      adjustedMinutesForSpecificMonth(monthReports, month, year, role, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }),
    [
      month,
      monthReports,
      year,
      role,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const rawProgress = useMemo(
    () =>
      goalProgress({
        minutes: adjustedMinutes.value,
        goalMinutes: goalHours * 60,
      }).fraction,
    [adjustedMinutes, goalHours]
  )

  const progress = useMemo(() => Math.min(rawProgress, 1.0), [rawProgress])

  const segmentScalingFactor = useMemo(() => {
    return rawProgress > 1.0 ? 1.0 / rawProgress : 1.0
  }, [rawProgress])

  useEffect(() => {
    if (!pulsing || progress === 0 || shimmerContainerWidth === 0) {
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
      pulseAnimation.setValue(0)
      return
    }

    const createPulseAnimation = () => {
      pulseAnimation.setValue(0)

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),

          Animated.delay(300),

          Animated.timing(pulseAnimation, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),

          Animated.delay(200),
        ]),
        { iterations: -1 }
      )

      return animation
    }

    if (animationRef.current) {
      animationRef.current.stop()
    }

    animationRef.current = createPulseAnimation()
    animationRef.current.start()

    return () => {
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
    }
  }, [pulsing, progress, pulseDuration, pulseAnimation, shimmerContainerWidth])

  const sign = forwardSign()
  const pulseTranslateX = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [sign * -60, sign * Math.max(200, shimmerContainerWidth + 60)],
  })

  const minutesDetailed = useMemo(
    () => getTotalMinutesDetailedForSpecificMonth(monthReports, month, year),
    [month, monthReports, year]
  )

  const hasStandardMinutes = useMemo(
    () => minutesDetailed.standardWithoutOtherMinutes > 0,
    [minutesDetailed.standardWithoutOtherMinutes]
  )
  const hasLdcMinutes = useMemo(
    () => minutesDetailed.ldc > 0,
    [minutesDetailed.ldc]
  )

  const otherColors = getCategorySegmentColors(theme.colors, minimal)

  const renderOtherHours = useCallback(() => {
    let currentIndex = 0
    return minutesDetailed.other.reports.map((report, index) => {
      if (currentIndex > otherColors.length - 1) {
        currentIndex = 0
      }

      const color = otherColors[currentIndex]
      currentIndex += 1

      return (
        <OtherHours
          key={`${report.categoryId ?? report.tag}-${index}`}
          color={color}
          percentage={
            (report.minutes / adjustedMinutes.value) * segmentScalingFactor
          }
        />
      )
    })
  }, [
    minutesDetailed.other,
    otherColors,
    adjustedMinutes.value,
    segmentScalingFactor,
  ])

  if (goalHours <= 0) return null

  return (
    <View
      style={[
        {
          gap: 3,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 2,
          position: 'relative',
          width: '100%',
          height: 20,
          backgroundColor: theme.colors.background,
          borderRadius: theme.numbers.borderRadiusSm,
          overflow: 'visible',
        }}
      >
        <View
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: theme.numbers.borderRadiusSm,
            width: '100%',
            height: 20,
          }}
        >
          {}
          <View
            style={{
              width: `${progress * 100}%`,
              flexDirection: 'row',
              alignItems: 'center',
              height: '100%',
            }}
          >
            {hasStandardMinutes && (
              <StandardHours
                percentage={
                  (minutesDetailed.standardWithoutOtherMinutes /
                    adjustedMinutes.value) *
                  segmentScalingFactor
                }
                color={theme.colors.accent}
              />
            )}
            {hasLdcMinutes && (
              <LdcHours
                percentage={
                  (minutesDetailed.ldc / adjustedMinutes.value) *
                  segmentScalingFactor
                }
                color={minimal ? theme.colors.accent : theme.colors.accentAlt}
              />
            )}
            {renderOtherHours()}
          </View>

          {}
          {animated && progress > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${progress * 100}%`,
                height: '100%',
                overflow: 'hidden',
              }}
              onLayout={(event) => {
                const { width: layoutWidth } = event.nativeEvent.layout
                setShimmerContainerWidth(layoutWidth)
              }}
            >
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 0,
                  height: '100%',
                  width: 60,
                  transform: [{ translateX: pulseTranslateX }],
                }}
              >
                {}
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 40,
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                    transform: [{ skewX: `${sign * -20}deg` }],
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 10,
                    width: 30,
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    transform: [{ skewX: `${sign * -20}deg` }],
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 20,
                    width: 15,
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    transform: [{ skewX: `${sign * -20}deg` }],
                  }}
                />
              </Animated.View>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

export default MonthServiceReportProgressBar
