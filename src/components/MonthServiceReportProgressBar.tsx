import { View, ViewProps, Animated } from 'react-native'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { usePreferences } from '../stores/preferences'
import { useServiceReport } from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import {
  adjustedMinutesForSpecificMonth,
  calculateProgress,
  getMonthsReports,
  getTotalMinutesDetailedForSpecificMonth,
} from '../lib/serviceReport'
import Text from './MyText'
import i18n from '../lib/locales'
import Circle from './Circle'

interface ProgressBarSegmentBaseProps extends ViewProps {
  borderRadiusLeft?: boolean
  borderRadiusRight?: boolean
}

const ProgressBarSegment = ({
  style,
  borderRadiusLeft,
  borderRadiusRight,
  ...props
}: ProgressBarSegmentBaseProps) => {
  const theme = useTheme()

  return (
    <View
      style={[
        [
          {
            borderTopLeftRadius: borderRadiusLeft
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomLeftRadius: borderRadiusLeft
              ? theme.numbers.borderRadiusSm
              : 0,
            borderTopRightRadius: borderRadiusRight
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomRightRadius: borderRadiusRight
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
      borderRadiusLeft
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

interface ProgressBarKeyProps {
  color: string
  label: string
}
const ProgressBarKey = ({ color, label }: ProgressBarKeyProps) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Circle color={color} />
      <Text style={{ fontSize: theme.fontSize('sm') }}>{label}</Text>
    </View>
  )
}

interface ProgressBarProps {
  month: number
  year: number
  minimal?: boolean
  /**
   * Enable pulse/shimmer/glow animation effects
   *
   * @default true
   */
  animated?: boolean
  /**
   * Duration of pulse animation in milliseconds
   *
   * @default 2000
   */
  pulseDuration?: number
}

const MonthServiceReportProgressBar = ({
  month,
  year,
  minimal,
  animated = true,
  pulseDuration = 2000,
}: ProgressBarProps) => {
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()

  // Animation setup
  const pulseAnimation = useRef(new Animated.Value(0)).current
  const animationRef = useRef<Animated.CompositeAnimation | null>(null)
  const [shimmerContainerWidth, setShimmerContainerWidth] = useState<number>(0)
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )
  const goalHours = publisherHours[publisher]

  const adjustedMinutes = useMemo(
    () =>
      adjustedMinutesForSpecificMonth(monthReports, month, year, publisher, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }),
    [
      month,
      monthReports,
      year,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const rawProgress = useMemo(
    () => calculateProgress({ minutes: adjustedMinutes.value, goalHours }),
    [adjustedMinutes, goalHours]
  )

  const progress = useMemo(() => Math.min(rawProgress, 1.0), [rawProgress])

  // Calculate scaling factor for individual segments when total exceeds 100%
  const segmentScalingFactor = useMemo(() => {
    return rawProgress > 1.0 ? 1.0 / rawProgress : 1.0
  }, [rawProgress])

  // Animation effect
  useEffect(() => {
    if (!animated || progress === 0 || shimmerContainerWidth === 0) {
      // Stop animation if not animated, no progress, or no measurement yet
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
      pulseAnimation.setValue(0)
      return
    }

    // Create pulse animation that moves from left to right
    const createPulseAnimation = () => {
      pulseAnimation.setValue(0)

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
          // Add a small pause at the end
          Animated.delay(300),
          // Instant reset to avoid jarring flash
          Animated.timing(pulseAnimation, {
            toValue: 0,
            duration: 0, // Instant reset - no visible movement
            useNativeDriver: true,
          }),
          // Small pause before next pulse
          Animated.delay(200),
        ]),
        { iterations: -1 }
      )

      return animation
    }

    // Stop existing animation
    if (animationRef.current) {
      animationRef.current.stop()
    }

    // Start new animation
    animationRef.current = createPulseAnimation()
    animationRef.current.start()

    // Cleanup on unmount or dependency change
    return () => {
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
    }
  }, [animated, progress, pulseDuration, pulseAnimation, shimmerContainerWidth])

  // Calculate pulse position dynamically based on shimmer container width
  // The shimmer should travel across the entire shimmer container (which is already the filled portion)
  const pulseTranslateX = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [
      -60, // Start hidden to the left
      Math.max(200, shimmerContainerWidth + 60), // End past the shimmer container
    ],
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

  const otherColors = useMemo(
    () =>
      minimal
        ? [theme.colors.accent]
        : [
            theme.colors.accent2,
            theme.colors.accent2Alt,
            theme.colors.warn,
            theme.colors.warnAlt,
            theme.colors.accent3,
            theme.colors.accent3Alt,
          ],
    [
      minimal,
      theme.colors.accent,
      theme.colors.accent2,
      theme.colors.accent2Alt,
      theme.colors.accent3,
      theme.colors.accent3Alt,
      theme.colors.warn,
      theme.colors.warnAlt,
    ]
  )

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
          key={`${report.tag}-${index}`}
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

  const renderOtherHoursColorKeys = useCallback(() => {
    let currentIndex = 0
    return minutesDetailed.other.reports.map((report, index) => {
      if (currentIndex > otherColors.length - 1) {
        currentIndex = 0
      }

      const color = otherColors[currentIndex]
      currentIndex += 1

      return (
        <ProgressBarKey
          key={`${report.tag}-${index}`}
          color={color}
          label={report.tag}
        />
      )
    })
  }, [minutesDetailed.other, otherColors])

  return (
    <View
      style={{
        gap: 3,
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusSm,
        padding: 10,
      }}
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
        {/* External glow overlay (behind, not clipped) */}
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 20,
            width: `${progress * 100}%`,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor: hasStandardMinutes
              ? theme.colors.accent
              : hasLdcMinutes
                ? minimal
                  ? theme.colors.accent
                  : theme.colors.accentAlt
                : theme.colors.accent2,
            shadowColor: hasStandardMinutes
              ? theme.colors.accent
              : hasLdcMinutes
                ? minimal
                  ? theme.colors.accent
                  : theme.colors.accentAlt
                : theme.colors.accent2,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: animated && progress > 0 ? 0.85 : 0,
            shadowRadius: 14,
            elevation: animated && progress > 0 ? 12 : 0,
          }}
        />
        <View
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: theme.numbers.borderRadiusSm,
            width: '100%',
            height: 20,
          }}
        >
          {/* Progress segments with enhanced glow effect */}
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
                  (minutesDetailed.standard / adjustedMinutes.value) *
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

          {/* Pulse/Shimmer overlay - only visible when animated and has progress */}
          {animated && progress > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${progress * 100}%`, // Only cover the filled portion
                height: '100%',
                overflow: 'hidden',
                borderRadius: theme.numbers.borderRadiusSm,
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
                  width: 60, // Fixed width shimmer that works with pixel-based transform
                  transform: [{ translateX: pulseTranslateX }],
                }}
              >
                {/* Shimmer gradient effect using multiple overlays */}
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 40,
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                    transform: [{ skewX: '-20deg' }],
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
                    transform: [{ skewX: '-20deg' }],
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
                    transform: [{ skewX: '-20deg' }],
                  }}
                />
              </Animated.View>
            </View>
          )}
        </View>
      </View>
      {!minimal && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            flexWrap: 'wrap',
          }}
        >
          {hasStandardMinutes && (
            <ProgressBarKey
              color={theme.colors.accent}
              label={i18n.t('standard')}
            />
          )}
          {hasLdcMinutes && (
            <ProgressBarKey
              color={theme.colors.accentAlt}
              label={i18n.t('ldc')}
            />
          )}
          {renderOtherHoursColorKeys()}
        </View>
      )}
    </View>
  )
}

export default MonthServiceReportProgressBar
