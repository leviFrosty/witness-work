import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import StripedFill from '@/components/ui/StripedFill'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'

type Props = {
  /** Logged minutes after the credit cap. */
  loggedMinutes: number
  /** The part of `loggedMinutes` that is Credit Time. */
  creditMinutes?: number
  /** What remaining Plans add. */
  plannedMinutes: number
  /** The goal the marker sits on; 0 draws no marker. */
  goalMinutes: number
  /**
   * What the full width stands for. Bars that sit in a list share one scale so
   * they compare; defaults to the larger of the total and the goal.
   */
  scaleMinutes?: number
  size?: 'sm' | 'md'
  /**
   * Names the goal and the total under the track. Turn off where the numbers
   * already sit beside the bar, and explain the marks once with `GoalBarKey`.
   */
  labels?: boolean
}

const SIZES = {
  sm: { track: 4, marker: 10, font: 'xs', stripe: 4, stripeWidth: 1.5 },
  md: { track: 10, marker: 18, font: 'sm', stripe: 7, stripeWidth: 2 },
} as const
/** Space kept between the goal and total labels before the total gives way. */
const LABEL_GAP = 8

/**
 * Progress toward a goal: standard time, then counted Credit Time, then Plans
 * (striped), with a marker at the goal. Labels under the track name the goal at
 * its marker and the total at the end of the fill; when they would collide, the
 * goal label wins. Decorative — callers show the numbers as text too.
 */
const GoalBar = ({
  loggedMinutes,
  creditMinutes = 0,
  plannedMinutes,
  goalMinutes,
  scaleMinutes,
  size = 'sm',
  labels = true,
}: Props) => {
  const theme = useTheme()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const [trackWidth, setTrackWidth] = useState(0)
  const [labelWidths, setLabelWidths] = useState({ goal: 0, total: 0 })
  const dims = SIZES[size]

  const totalMinutes = loggedMinutes + plannedMinutes
  const scale = scaleMinutes ?? Math.max(totalMinutes, goalMinutes)
  if (scale <= 0) return null

  const percent = (minutes: number) =>
    Math.max(0, Math.min(100, (minutes / scale) * 100))
  const standardPercent = percent(loggedMinutes - creditMinutes)
  const creditPercent = Math.min(100 - standardPercent, percent(creditMinutes))
  const plannedPercent = Math.min(
    100 - standardPercent - creditPercent,
    percent(plannedMinutes)
  )

  // Center a label on its point, kept inside the track.
  const labelLeft = (minutes: number, width: number) =>
    Math.min(
      Math.max((percent(minutes) / 100) * trackWidth - width / 2, 0),
      Math.max(trackWidth - width, 0)
    )
  const goalLeft = labelLeft(goalMinutes, labelWidths.goal)
  const totalLeft = labelLeft(totalMinutes, labelWidths.total)
  const showGoalLabel = goalMinutes > 0
  const showTotalLabel =
    totalMinutes > 0 &&
    (!showGoalLabel ||
      totalLeft + labelWidths.total + LABEL_GAP <= goalLeft ||
      goalLeft + labelWidths.goal + LABEL_GAP <= totalLeft)
  const measured =
    trackWidth > 0 &&
    (!showGoalLabel || labelWidths.goal > 0) &&
    (totalMinutes <= 0 || labelWidths.total > 0)

  const labelStyle = {
    position: 'absolute',
    top: 0,
    fontSize: theme.fontSize(dims.font),
    // Hidden until measured, so a label never flashes off its point.
    opacity: measured ? 1 : 0,
  } as const

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{ gap: 2 }}
    >
      <View style={{ height: dims.marker, justifyContent: 'center' }}>
        <View
          style={{
            height: dims.track,
            borderRadius: dims.track / 2,
            backgroundColor: theme.colors.border,
            overflow: 'hidden',
            flexDirection: 'row',
          }}
        >
          {standardPercent > 0 && (
            <View
              style={{
                width: `${standardPercent}%`,
                backgroundColor: theme.colors.accent,
              }}
            />
          )}
          {creditPercent > 0 && (
            <View
              style={{
                width: `${creditPercent}%`,
                backgroundColor: theme.colors.accentAlt,
              }}
            />
          )}
          {plannedPercent > 0 && (
            <View style={{ width: `${plannedPercent}%`, height: '100%' }}>
              <StripedFill
                // The SVG keeps its first size when the fill grows; remount it
                // so planned time drawn live (e.g. while planning) stays full.
                key={plannedPercent}
                color={theme.colors.accent}
                size={dims.stripe}
                strokeWidth={dims.stripeWidth}
              />
            </View>
          )}
        </View>
        {goalMinutes > 0 && (
          <View
            style={{
              position: 'absolute',
              left: `${percent(goalMinutes)}%`,
              marginLeft: -1,
              width: 2,
              height: dims.marker,
              borderRadius: 1,
              backgroundColor: theme.colors.textAlt,
            }}
          />
        )}
      </View>
      {labels && (
        <View style={{ height: theme.fontSize(dims.font) * 1.4 }}>
          {showGoalLabel && (
            <Text
              numberOfLines={1}
              onLayout={(e) => {
                const goal = e.nativeEvent.layout.width
                setLabelWidths((w) => (w.goal === goal ? w : { ...w, goal }))
              }}
              style={[
                labelStyle,
                { left: goalLeft, color: theme.colors.textAlt },
              ]}
            >
              {i18n.t('projectedTotal.legend.goal', {
                value: formatMinutes(goalMinutes, timeDisplayFormat).formatted,
              })}
            </Text>
          )}
          {totalMinutes > 0 && (
            <Text
              numberOfLines={1}
              onLayout={(e) => {
                const total = e.nativeEvent.layout.width
                setLabelWidths((w) => (w.total === total ? w : { ...w, total }))
              }}
              style={[
                labelStyle,
                {
                  left: totalLeft,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                  // Measured even when it gives way, so it can come back.
                  opacity: measured && showTotalLabel ? 1 : 0,
                },
              ]}
            >
              {formatMinutes(totalMinutes, timeDisplayFormat).formatted}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

type KeyProps = {
  /** Some bar shows counted Credit Time. */
  credit?: boolean
  /** Some bar shows Plans. */
  planned?: boolean
  /** Some bar has a goal marker. */
  goal?: boolean
}

/**
 * Explains the marks of a list of unlabeled `GoalBar`s once, instead of on
 * every bar. Pass only the marks the bars actually show.
 */
export const GoalBarKey = ({ credit, planned, goal }: KeyProps) => {
  const theme = useTheme()
  const swatch = { width: 12, height: 6, borderRadius: 3 } as const
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 12,
        rowGap: 4,
      }}
    >
      <KeyItem label={i18n.t('goalBar.logged')}>
        <View style={[swatch, { backgroundColor: theme.colors.accent }]} />
      </KeyItem>
      {credit && (
        <KeyItem label={i18n.t('goalBar.credit')}>
          <View style={[swatch, { backgroundColor: theme.colors.accentAlt }]} />
        </KeyItem>
      )}
      {planned && (
        <KeyItem label={i18n.t('goalBar.planned')}>
          <View
            style={[
              swatch,
              { backgroundColor: theme.colors.border, overflow: 'hidden' },
            ]}
          >
            <StripedFill
              color={theme.colors.accent}
              size={SIZES.sm.stripe}
              strokeWidth={SIZES.sm.stripeWidth}
            />
          </View>
        </KeyItem>
      )}
      {goal && (
        <KeyItem label={i18n.t('goalBar.goal')}>
          <View
            style={{
              width: 2,
              height: SIZES.sm.marker,
              borderRadius: 1,
              backgroundColor: theme.colors.textAlt,
            }}
          />
        </KeyItem>
      )}
    </View>
  )
}

const KeyItem = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {children}
      <Text
        style={{ fontSize: theme.fontSize('xs'), color: theme.colors.textAlt }}
      >
        {label}
      </Text>
    </View>
  )
}

export default GoalBar
