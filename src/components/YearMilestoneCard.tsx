import { useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import moment from 'moment'
import _ from 'lodash'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useIsFocused } from '@react-navigation/native'
import { faCrown, faStar } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '@/lib/serviceReport'
import {
  getEffectiveMilestones,
  getMilestoneHitState,
  milestoneCelebrationKey,
} from '@/lib/milestones'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  generateServiceReportsHash,
  getAnnualServiceReportCacheKey,
  useTimeCache,
} from '@/stores/timeCache'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import Haptics from '@/lib/haptics'
import useFireworks from '@/hooks/useFireworks'

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
  const { type: publisher, annualGoalHours, creditCapMinutes } = usePublisher()
  const {
    milestoneOverrides,
    timeDisplayFormat,
    celebratedMilestones,
    markMilestoneCelebrated,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const { serviceReports } = useServiceReport()
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()
  const fireworks = useFireworks()
  const isFocused = useIsFocused()

  const serviceYear = year - 1

  const { totalMinutesForServiceYear, cacheKey, reportsHash, needsCache } =
    useMemo(() => {
      const cacheKey = getAnnualServiceReportCacheKey(serviceYear)
      // The total is cap-dependent, so the cache key folds the resolved
      // credit cap in — otherwise a role/override change would keep serving
      // the stale total until the next report edit.
      const reportsHash = `${generateServiceReportsHash(
        serviceReports,
        year - 1
      )}:cap=${creditCapMinutes ?? 'unlimited'}`

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
        serviceYear,
        publisher,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      )

      return {
        totalMinutesForServiceYear: total,
        cacheKey,
        reportsHash,
        needsCache: true,
      }
      // eslint-disable-next-line react-compiler/react-compiler
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      serviceReports,
      serviceYear,
      year,
      publisher,
      creditCapMinutes,
      overrideCreditLimit,
      customCreditLimitHours,
    ])

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

  // One-time crossing celebration. Mirrors MonthReport: pulse a seal, fire a
  // haptic, and (annual-goal only) trigger the fireworks burst — but only the
  // first time the user lands on the Year tab after the milestone was crossed.
  // Persisted via `celebratedMilestones` so re-opening the screen, or switching
  // between Year and other tabs, doesn't re-fire. We celebrate every milestone
  // the user has hit but not yet been shown the animation for; the largest such
  // value drives the inline banner.
  const serviceYearKey = milestoneCelebrationKey(serviceYear)
  const celebratedForYear = celebratedMilestones[serviceYearKey] ?? []
  const justHitMilestones = useMemo(
    () => hitState.hit.filter((m) => !celebratedForYear.includes(m)),
    // celebratedForYear is intentionally read once per render — re-deriving on
    // every prefs write would invalidate the memo every keystroke.
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hitState.hit]
  )
  const justHitTop =
    justHitMilestones.length > 0 ? Math.max(...justHitMilestones) : null
  const isGoalComplete =
    annualGoalHours > 0 && hoursCompleted >= annualGoalHours
  const isJustHitAnnualGoal =
    justHitTop !== null && justHitTop === annualGoalHours

  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))

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

  // Reserve the active crossing animation for the in-progress service year —
  // past years that the user simply met still get the persistent glow + "You
  // did it!" badge below, but no haptic / fireworks burst on visit. Future
  // service years can't have unhit milestones (no reports yet), so they're
  // naturally excluded by `justHitTop === null`.
  useEffect(() => {
    if (!isFocused) return
    if (!isCurrentServiceYear) return
    if (justHitTop === null) return
    sealScale.value = withSequence(
      withTiming(1.3, { duration: 180 }),
      withTiming(1, { duration: 220 })
    )
    if (isJustHitAnnualGoal) {
      Haptics.heavy()
      fireworks.fire()
    } else {
      Haptics.light()
    }
    for (const m of justHitMilestones) {
      markMilestoneCelebrated(serviceYearKey, m)
    }
  }, [
    isFocused,
    isCurrentServiceYear,
    justHitTop,
    isJustHitAnnualGoal,
    justHitMilestones,
    serviceYearKey,
    markMilestoneCelebrated,
    sealScale,
    fireworks,
  ])

  const titleText = `${serviceYear}–${serviceYear + 1}`

  const minutesToGoal = useMemo(
    () =>
      annualGoalHours > 0
        ? Math.max(
            0,
            Math.round(annualGoalHours * 60 - totalMinutesForServiceYear)
          )
        : 0,
    [annualGoalHours, totalMinutesForServiceYear]
  )
  const minutesToGoalDisplay = useFormattedMinutes(minutesToGoal)

  const nextMilestoneRemainingMinutes =
    hitState.next !== null
      ? Math.max(0, Math.round(hitState.next * 60 - totalMinutesForServiceYear))
      : null
  const nextMilestoneRemainingDisplay = useFormattedMinutes(
    nextMilestoneRemainingMinutes ?? 0
  )
  const completedHeroDisplay = useFormattedMinutes(totalMinutesForServiceYear)
  const isDecimal = timeDisplayFormat === 'decimal'

  // Mirror the month card's `record` tier treatment: amber border + translucent
  // supporter background reads as celebratory without overpowering the chart.
  // We apply it for any service year that hit the annual goal — past, present,
  // or future (future can't actually hit goal yet, but the check is safe). The
  // active crossing animation upstream is the gated one.
  const showCompletionTreatment = isGoalComplete && annualGoalHours > 0

  return (
    <Card
      style={{
        flexGrow: 1,
        ...(showCompletionTreatment
          ? {
              borderWidth: 2,
              borderColor: theme.colors.supporter,
              backgroundColor: theme.colors.supporterTranslucent,
            }
          : {}),
      }}
    >
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
        {showCompletionTreatment ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Animated.View style={sealAnimatedStyle}>
              <FontAwesomeIcon
                icon={faCrown}
                color={theme.colors.supporter}
                size={16}
              />
            </Animated.View>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.supporter,
              }}
            >
              {i18n.t('annualGoalCompleteBadge')}
            </Text>
          </View>
        ) : isCurrentServiceYear ? (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {daysRemaining} {i18n.t('daysLeft')}
            {minutesToGoal > 0
              ? ` · ${i18n.t('hoursToGoLabel', { value: minutesToGoalDisplay.formatted })}`
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
            // Drop a tier in "short" mode so "234h 56m / 600 hours" fits the
            // card without auto-shrinking the hero to fine print.
            style={{
              fontSize: isDecimal ? 64 : 40,
              lineHeight: isDecimal ? 68 : 44,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {isDecimal
              ? completedHeroDisplay.decimalHours
              : completedHeroDisplay.formatted}
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

      {/* Transient "just hit a milestone" banner — only renders when the user
        lands on the tab right after crossing a non-final rung. Marked as
        celebrated in the focus effect above so a re-visit drops the banner.
        For the annual goal itself we suppress it (the top-row "You did it!"
        badge already carries that message). */}
      {justHitTop !== null && !isJustHitAnnualGoal ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor: theme.colors.accentTranslucent,
            borderWidth: 1,
            borderColor: theme.colors.accent,
          }}
        >
          <Animated.View style={sealAnimatedStyle}>
            <FontAwesomeIcon
              icon={faStar}
              color={theme.colors.accent}
              size={16}
            />
          </Animated.View>
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('milestoneJustHitBanner', { hours: justHitTop })}
          </Text>
        </View>
      ) : null}

      {showCompletionTreatment ? (
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
              color: theme.colors.supporter,
            }}
          >
            {i18n.t('annualGoalCompleteCongrats')}
          </Text>
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
      ) : hitState.next !== null && nextMilestoneRemainingMinutes !== null ? (
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
                remaining: nextMilestoneRemainingDisplay.formatted,
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
