import { useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import moment from 'moment'
import _ from 'lodash'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '@/lib/serviceReport'
import { getEffectiveMilestones, getMilestoneHitState } from '@/lib/milestones'
import {
  generateServiceReportsHash,
  getAnnualServiceReportCacheKey,
  useTimeCache,
} from '@/stores/timeCache'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'

import Card from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import MilestoneProgressBar from '@/components/MilestoneProgressBar'
import Text from '@/components/ui/MyText'

interface YearMilestoneCardProps {
  /**
   * The end year of the service year being displayed. A service year runs Sep 1
   * of `year - 1` to Aug 31 of `year`; passing `2025` renders the 2024–2025
   * service year.
   */
  year: number
  /**
   * Called when the user taps the "adjust milestones" affordance. Passing this
   * prop is what makes the affordance render — HomeScreen omits it so the
   * affordance stays hidden there (milestone editing lives on the Progress
   * screen's Year tab).
   */
  onAdjustMilestones?: () => void
}

/**
 * Year-tab hero card. Shows the service-year span header, days remaining, big
 * hours / goal number, a milestone progress bar (added in Phase 2B),
 * milestones-hit chip, and a "next milestone" hint with an optional "adjust
 * milestones" affordance.
 */
const YearMilestoneCard = ({
  year,
  onAdjustMilestones,
}: YearMilestoneCardProps) => {
  const theme = useTheme()
  const { type: publisher, annualGoalHours } = usePublisher()
  const { milestoneOverrides } = usePreferences()
  const { serviceReports } = useServiceReport()
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()

  const serviceYear = year - 1

  const { totalMinutesForServiceYear, cacheKey, reportsHash, needsCache } =
    useMemo(() => {
      const cacheKey = getAnnualServiceReportCacheKey(serviceYear)
      const reportsHash = generateServiceReportsHash(serviceReports, year - 1)

      const cached = getCachedPlannedMinutes(cacheKey)
      if (cached && cached.planHash === reportsHash) {
        return {
          totalMinutesForServiceYear: cached.plannedMinutes,
          cacheKey,
          reportsHash,
          needsCache: false,
        }
      }

      const serviceYearsReports = getServiceYearReports(
        serviceReports,
        year - 1
      )
      const total = getTotalMinutesForServiceYear(
        serviceYearsReports,
        serviceYear
      )

      return {
        totalMinutesForServiceYear: total,
        cacheKey,
        reportsHash,
        needsCache: true,
      }
      // eslint-disable-next-line react-compiler/react-compiler
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceReports, serviceYear, year])

  useEffect(() => {
    if (needsCache) {
      setCachedPlannedMinutes(cacheKey, totalMinutesForServiceYear, reportsHash)
      logger.log('[YearMilestoneCard] Cached result for future use')
    }
  }, [
    needsCache,
    cacheKey,
    totalMinutesForServiceYear,
    reportsHash,
    setCachedPlannedMinutes,
  ])

  const hoursCompleted = useMemo(
    () => _.round(totalMinutesForServiceYear / 60, 1),
    [totalMinutesForServiceYear]
  )

  const milestones = useMemo(
    () =>
      getEffectiveMilestones(publisher, milestoneOverrides, annualGoalHours),
    [publisher, milestoneOverrides, annualGoalHours]
  )
  const hitState = useMemo(
    () => getMilestoneHitState(milestones, hoursCompleted),
    [milestones, hoursCompleted]
  )

  // Service-year span: Sep 1 of `serviceYear` → Aug 31 of `serviceYear + 1`.
  const serviceYearStart = useMemo(
    () => moment().month(8).year(serviceYear).startOf('month'),
    [serviceYear]
  )
  const serviceYearEnd = useMemo(
    () =>
      moment()
        .month(7)
        .year(serviceYear + 1)
        .endOf('month'),
    [serviceYear]
  )

  const now = moment()
  const isCurrentServiceYear = now.isBetween(
    serviceYearStart,
    serviceYearEnd,
    'day',
    '[]'
  )
  const isPastServiceYear = now.isAfter(serviceYearEnd, 'day')
  const daysRemaining = isCurrentServiceYear
    ? Math.max(0, serviceYearEnd.diff(now, 'days'))
    : isPastServiceYear
      ? 0
      : Math.max(0, serviceYearEnd.diff(serviceYearStart, 'days'))

  const titleText = `${serviceYear}–${serviceYear + 1}`

  const hoursToGoal = useMemo(
    () =>
      annualGoalHours > 0
        ? _.round(Math.max(0, annualGoalHours - hoursCompleted), 1)
        : 0,
    [annualGoalHours, hoursCompleted]
  )

  const nextMilestoneRemaining =
    hitState.next !== null
      ? _.round(Math.max(0, hitState.next - hoursCompleted), 1)
      : null

  return (
    <Card style={{ flexGrow: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            letterSpacing: 0.5,
          }}
        >
          {titleText}
        </Text>
        {isCurrentServiceYear ? (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {daysRemaining} {i18n.t('daysLeft')}
            {hoursToGoal > 0
              ? ` · ${i18n.t('hoursToGoLabel', { hours: hoursToGoal })}`
              : ''}
          </Text>
        ) : null}
      </View>

      {/* Hero number + milestones chip share a tight inner rhythm — matches
        the month card's GoalProgressStats inner gap so the chip reads as
        sub-info to the hero rather than a sibling section. */}
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Text
            style={{
              fontSize: 64,
              lineHeight: 68,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {hoursCompleted}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textAlt,
            }}
          >
            / {annualGoalHours} {i18n.t('hours_lowercase')}
          </Text>
        </View>

        {hitState.total > 0 ? (
          <View style={{ flexDirection: 'row', marginLeft: -10 }}>
            <Chip
              icon='✓'
              tone={
                hitState.totalHit === hitState.total ? 'positive' : 'neutral'
              }
              label={i18n.t('milestonesHitChip', {
                hit: hitState.totalHit,
                total: hitState.total,
              })}
            />
          </View>
        ) : null}
      </View>

      <MilestoneProgressBar year={year} />

      {hitState.next !== null && nextMilestoneRemaining !== null ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('nextMilestoneLabel', {
                hours: hitState.next,
                remaining: nextMilestoneRemaining,
              })}
            </Text>
          </View>
          {onAdjustMilestones ? (
            <Pressable
              onPress={onAdjustMilestones}
              accessibilityRole='button'
              hitSlop={8}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('adjustMilestones')} ›
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : onAdjustMilestones ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={onAdjustMilestones}
            accessibilityRole='button'
            hitSlop={8}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('adjustMilestones')} ›
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  )
}

export default YearMilestoneCard
