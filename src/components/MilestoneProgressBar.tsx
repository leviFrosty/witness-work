import { useMemo } from 'react'
import { View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import _ from 'lodash'

import useTheme from '../contexts/theme'
import usePublisher from '../hooks/usePublisher'
import useServiceReport from '../stores/serviceReport'
import { usePreferences } from '../stores/preferences'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '../lib/serviceReport'
import { getEffectiveMilestones, getMilestoneHitState } from '../lib/milestones'
import Text from './MyText'

interface MilestoneProgressBarPreviewProps {
  milestones: number[]
  hoursCompleted: number
  yearGoalHours: number
}

const BAR_HEIGHT = 28
const BAR_RADIUS = 6
const LABEL_MARGIN_TOP = 6

type SegmentState = 'hit' | 'progress' | 'future'

type Segment = {
  start: number
  end: number
  widthFlex: number
  state: SegmentState
  fillRatio: number
}

/**
 * Pure, controlled variant of the milestone progress bar. Takes the milestone
 * ladder, hours completed, and year goal directly — no store access. Used by
 * the Milestone Adjust sheet's live preview as well as by the default
 * (connected) `MilestoneProgressBar` below.
 *
 * Visual:
 *
 * - Bar is split into segments at milestone boundaries, each sized proportionally
 *   to its share of the year goal.
 * - Hit segments render as solid accent green.
 * - The in-progress segment renders the completed portion as solid accent with
 *   the remainder in a lighter pastel accent.
 * - Future segments render as a subdued diagonal cross-hatch pattern.
 * - Milestone values sit under the right edge of each segment; the "next" value
 *   is emphasized in accent.
 */
export const MilestoneProgressBarPreview = ({
  milestones,
  hoursCompleted,
  yearGoalHours,
}: MilestoneProgressBarPreviewProps) => {
  const theme = useTheme()

  const safeGoal = yearGoalHours > 0 ? yearGoalHours : 1

  const { segments, nextMilestone } = useMemo(() => {
    const segs: Segment[] = []
    let prev = 0
    for (const m of milestones) {
      const range = Math.max(0, m - prev)
      const widthFlex = range / safeGoal
      let state: SegmentState
      let fillRatio = 0
      if (hoursCompleted >= m) {
        state = 'hit'
        fillRatio = 1
      } else if (hoursCompleted > prev && range > 0) {
        state = 'progress'
        fillRatio = Math.min(1, (hoursCompleted - prev) / range)
      } else {
        state = 'future'
      }
      segs.push({ start: prev, end: m, widthFlex, state, fillRatio })
      prev = m
    }
    const next = getMilestoneHitState(milestones, hoursCompleted).next
    return { segments: segs, nextMilestone: next }
  }, [milestones, hoursCompleted, safeGoal])

  const separatorColor = theme.colors.background
  const pastelFill = theme.colors.accentTranslucent
  const hatchLineColor = theme.colors.textAlt

  return (
    <View>
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_RADIUS,
          flexDirection: 'row',
          overflow: 'hidden',
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        {segments.map((seg, i) => (
          <View
            key={`${seg.end}-${i}`}
            style={{
              flex: seg.widthFlex,
              height: '100%',
              borderRightWidth: i < segments.length - 1 ? 1 : 0,
              borderRightColor: separatorColor,
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
            {seg.state === 'future' && (
              <HatchBackground color={hatchLineColor} />
            )}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', marginTop: LABEL_MARGIN_TOP }}>
        {segments.map((seg) => {
          const value = seg.end
          const isNext = value === nextMilestone
          return (
            <View
              key={value}
              style={{
                flex: seg.widthFlex,
                alignItems: 'flex-end',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: isNext ? theme.colors.accent : theme.colors.textAlt,
                  fontFamily: isNext ? theme.fonts.bold : theme.fonts.regular,
                }}
              >
                {value}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const HatchBackground = ({ color }: { color: string }) => (
  <Svg
    width='100%'
    height='100%'
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
  >
    <Defs>
      <Pattern
        id='hatch'
        width='6'
        height='6'
        patternUnits='userSpaceOnUse'
        patternTransform='rotate(45)'
      >
        <Line x1='0' y1='0' x2='0' y2='6' stroke={color} strokeWidth='2' />
      </Pattern>
    </Defs>
    <Rect width='100%' height='100%' fill='url(#hatch)' />
  </Svg>
)

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
  const { status: publisher, annualGoalHours } = usePublisher()
  const { milestoneOverrides } = usePreferences()
  const { serviceReports } = useServiceReport()

  const serviceYear = year - 1

  const totalMinutesForServiceYear = useMemo(() => {
    const serviceYearsReports = getServiceYearReports(
      serviceReports,
      serviceYear
    )
    return getTotalMinutesForServiceYear(serviceYearsReports, serviceYear)
  }, [serviceReports, serviceYear])

  const hoursCompleted = useMemo(
    () => _.round(totalMinutesForServiceYear / 60, 1),
    [totalMinutesForServiceYear]
  )

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
      hoursCompleted={hoursCompleted}
      yearGoalHours={annualGoalHours}
    />
  )
}

export default MilestoneProgressBar
