import { useMemo } from 'react'
import { useWindowDimensions, View, ViewStyle } from 'react-native'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import {
  getEffectiveMilestones,
  getMilestoneHitState,
  milestoneLabelRows,
} from '@/lib/milestones'
import StripedFill from '@/components/ui/StripedFill'
import Text from '@/components/ui/MyText'
import { useShallow } from 'zustand/react/shallow'

interface MilestoneProgressBarPreviewProps {
  milestones: number[]
  /** Unrounded service-year total; milestones are compared in minutes. */
  minutesCompleted: number
  annualGoalHours: number
}

const BAR_HEIGHT = 28
const BAR_RADIUS = 6
const LABEL_MARGIN_TOP = 6
const LABEL_WIDTH = 40
const LABEL_ROW_HEIGHT = 8
const LABEL_ROW_GAP = 2
// Min gap (as fraction of bar width) between labels on the same row before we
// drop the next one to a second row. ~7% comfortably clears a 4-digit label at
// xs font on a typical card-width bar.
const LABEL_MIN_GAP_RATIO = 0.06
/** A value's line height per point of font size, roughly. */
const LINE_HEIGHT = 1.25

type SegmentState = 'hit' | 'progress' | 'future'

type Segment = {
  start: number
  end: number
  widthFlex: number
  state: SegmentState
  fillRatio: number
}

type LabelLayout = {
  value: number
  position: number
  row: number
  isNext: boolean
  state: SegmentState
}

/**
 * Pure, controlled variant of the milestone progress bar. Takes the milestone
 * ladder, minutes completed, and annual goal directly — no store access. Used
 * by the Milestone Adjust sheet's live preview as well as by the default
 * (connected) `MilestoneProgressBar` below.
 *
 * Visual:
 *
 * - Bar is split into segments at milestone boundaries, each sized proportionally
 *   to its share of the annual goal.
 * - Hit segments render as solid accent green.
 * - The in-progress segment renders the completed portion as solid accent with
 *   the remainder in a lighter pastel accent.
 * - Future segments render with the shared `StripedFill` diagonal pattern,
 *   matching the planned portion of the projected-total bar.
 * - Milestone values are centered beneath their divider line; labels that would
 *   crowd a neighbor drop to a second row, and are left out when that row is
 *   crowded too. The "next" value is emphasized in accent.
 */
export const MilestoneProgressBarPreview = ({
  milestones,
  minutesCompleted,
  annualGoalHours,
}: MilestoneProgressBarPreviewProps) => {
  const theme = useTheme()
  // Larger text makes the values taller and wider: the rows grow by the extra
  // line height, and values need more room before they drop to a second row,
  // so neither row covers the other or the content below.
  const textScale = Math.max(1, useWindowDimensions().fontScale)
  const labelWidth = LABEL_WIDTH * textScale
  const rowHeight =
    LABEL_ROW_HEIGHT + (textScale - 1) * theme.fontSize('xs') * LINE_HEIGHT
  const rowGap = LABEL_ROW_GAP * textScale
  const minGapRatio = LABEL_MIN_GAP_RATIO * textScale

  const safeGoal = annualGoalHours > 0 ? annualGoalHours : 1

  const { segments, labels, labelsHeight } = useMemo(() => {
    const segs: Segment[] = []
    let prev = 0
    for (const m of milestones) {
      const range = Math.max(0, m - prev)
      const widthFlex = range / safeGoal
      let state: SegmentState
      let fillRatio = 0
      if (minutesCompleted >= m * 60) {
        state = 'hit'
        fillRatio = 1
      } else if (minutesCompleted >= prev * 60 && range > 0) {
        state = 'progress'
        fillRatio = Math.min(
          1,
          Math.max(0, (minutesCompleted - prev * 60) / (range * 60))
        )
      } else {
        state = 'future'
      }
      segs.push({ start: prev, end: m, widthFlex, state, fillRatio })
      prev = m
    }
    const next = getMilestoneHitState(milestones, minutesCompleted).next

    // Lay out labels centered on each milestone divider. When two milestones
    // sit closer than the minimum gap, the second label drops to a second row,
    // or is left out when it would crowd that row too, so values never
    // collide or wrap inside a too-narrow segment.
    const positions: number[] = []
    let cumulative = 0
    for (const seg of segs) {
      cumulative += seg.widthFlex
      positions.push(cumulative)
    }
    const rows = milestoneLabelRows(positions, minGapRatio)
    const labelLayout: LabelLayout[] = segs.flatMap((seg, i) => {
      const row = rows[i]
      if (row === null) return []
      return [
        {
          value: seg.end,
          position: positions[i],
          row,
          isNext: seg.end === next,
          state: seg.state,
        },
      ]
    })
    const hasSecondRow = labelLayout.some((l) => l.row === 1)
    const height = hasSecondRow ? rowHeight * 2 + rowGap : rowHeight

    return { segments: segs, labels: labelLayout, labelsHeight: height }
  }, [milestones, minutesCompleted, safeGoal, minGapRatio, rowHeight, rowGap])

  const separatorColor = theme.colors.text
  const pastelFill = theme.colors.accentTranslucent

  return (
    <View>
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_RADIUS,
          overflow: 'hidden',
          backgroundColor: theme.colors.background,
        }}
      >
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <StripedFill
            color={theme.colors.textAlt}
            opacity={0.35}
            strokeWidth={1.5}
          />
        </View>
        <View style={{ flexDirection: 'row', height: '100%' }}>
          {segments.map((seg, i) => (
            <View
              key={`${seg.end}-${i}`}
              style={{
                flex: seg.widthFlex,
                height: '100%',
                borderEndWidth: i < segments.length - 1 ? 1 : 0,
                borderEndColor: separatorColor,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {seg.state === 'hit' && (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              )}
              {seg.state === 'progress' && (
                <>
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: theme.colors.background,
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: pastelFill,
                    }}
                  />
                  <View
                    style={{
                      width: `${seg.fillRatio * 100}%`,
                      height: '100%',
                      backgroundColor: theme.colors.accent,
                    }}
                  />
                </>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* The values under the ticks read as loose numbers ("30, 50, 100");
          the card says how many are hit and how far the next one is. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        style={{
          marginTop: LABEL_MARGIN_TOP,
          height: labelsHeight,
          position: 'relative',
        }}
      >
        {labels.map((label) => {
          // Anchor edge labels to the bar edge instead of centering them on it,
          // so the rightmost label (annual goal) isn't half-clipped by ancestor
          // scroll views that don't honor `overflow: visible`.
          const isRightEdge = label.position >= 0.999
          const isLeftEdge = label.position <= 0.001
          const positionStyle: ViewStyle = isRightEdge
            ? { right: 0, alignItems: 'flex-end' }
            : isLeftEdge
              ? { left: 0, alignItems: 'flex-start' }
              : {
                  left: `${label.position * 100}%`,
                  width: labelWidth,
                  marginLeft: -labelWidth / 2,
                  alignItems: 'center',
                }
          return (
            <View
              key={label.value}
              style={{
                position: 'absolute',
                top: label.row * (rowHeight + rowGap),
                ...positionStyle,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: theme.fontSize('xs'),
                  color:
                    label.state === 'hit'
                      ? theme.colors.accent
                      : label.isNext
                        ? theme.colors.text
                        : theme.colors.textAlt,
                  fontFamily: label.isNext
                    ? theme.fonts.bold
                    : theme.fonts.regular,
                }}
              >
                {label.value}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

interface MilestoneProgressBarProps {
  /**
   * End year of the service year being displayed (Sep 1 of `year - 1` → Aug 31
   * of `year`). Passing `2025` means the 2024–2025 service year.
   */
  year: number
}

/**
 * Connected variant — reads `serviceReports`, publisher prefs, and
 * `milestoneOverrides` from stores and renders a proportional milestone
 * progress bar for the given service year.
 */
const MilestoneProgressBar = ({ year }: MilestoneProgressBarProps) => {
  const serviceYear = year - 1
  const { type: publisher, annualGoalHours } = usePublisher(
    serviceYearFocusMonth(serviceYear)
  )
  const roleFor = useRoleForMonth()
  const { milestoneOverrides, overrideCreditLimit, customCreditLimitHours } =
    usePreferences(
      useShallow((s) => ({
        milestoneOverrides: s.milestoneOverrides,
        overrideCreditLimit: s.overrideCreditLimit,
        customCreditLimitHours: s.customCreditLimitHours,
      }))
    )
  const { serviceReports } = useServiceReport()

  const totalMinutesForServiceYear = useMemo(() => {
    const serviceYearsReports = getServiceYearReports(
      serviceReports,
      serviceYear
    )
    return getTotalMinutesForServiceYear(
      serviceYearsReports,
      serviceYear,
      roleFor,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
  }, [
    serviceReports,
    serviceYear,
    roleFor,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const milestones = useMemo(
    () =>
      getEffectiveMilestones(publisher, milestoneOverrides, annualGoalHours),
    [publisher, milestoneOverrides, annualGoalHours]
  )

  if (milestones.length === 0 || annualGoalHours <= 0) {
    return null
  }

  return (
    <MilestoneProgressBarPreview
      milestones={milestones}
      minutesCompleted={totalMinutesForServiceYear}
      annualGoalHours={annualGoalHours}
    />
  )
}

export default MilestoneProgressBar
