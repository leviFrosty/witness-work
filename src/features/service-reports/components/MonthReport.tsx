import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import MonthServiceReportProgressBar from '@/features/service-reports/components/MonthServiceReportProgressBar'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import ViewReportButton from '@/features/service-reports/components/ViewReportButton'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  ldcMinutesForSpecificMonth,
  otherMinutesForSpecificMonth,
  plannedMinutesToCurrentDayForMonth,
  standardMinutesForSpecificMonth,
} from '@/lib/serviceReport'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import useTheme from '@/contexts/theme'
import { TimeEntry } from '@/types/timeEntry'
import { CategorySegment } from '@/features/service-reports/components/CategorySegmentBar'
import CategoriesSection from '@/features/service-reports/components/CategoriesSection'
import { usePreferences } from '@/stores/preferences'
import { formatMinutes } from '@/lib/minutes'
import Card from '@/components/ui/Card'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Chip from '@/components/ui/Chip'
import CreditInfoSheet from '@/features/service-reports/components/CreditInfoSheet'
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native'
import moment from 'moment'
import GoalProgressStats from '@/features/service-reports/components/GoalProgressStats'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'
import {
  isPersonalBest12mo,
  monthCelebrationKey,
  resolveTier,
} from '@/lib/achievementTier'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import { faRightLeft } from '@fortawesome/free-solid-svg-icons'
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Haptics from '@/lib/haptics'
import useCelebrationQueue from '@/features/service-reports/stores/celebrationQueue'
import {
  CONFETTI_DELAY_MS,
  CONFETTI_DURATION,
} from '@/providers/AnimationViewProvider'
import useFireworks from '@/hooks/useFireworks'
import { FIREWORKS_AFTER_LOTTIE_BUFFER_MS } from '@/providers/ConfettiProvider'
import { formatMonthDayCompact } from '@/lib/dates'

interface MonthReportProps {
  monthsReports: TimeEntry[] | null
  month: number
  year: number
  /** Show the report-view trigger icon. */
  showReportButton?: boolean
  title?: string
  hideTitle?: boolean
  noDetails?: boolean
  highlightAsCurrentMonth?: boolean
}

const MonthReport = ({
  monthsReports,
  month,
  year,
  showReportButton,
  title,
  hideTitle,
  noDetails,
  highlightAsCurrentMonth,
}: MonthReportProps) => {
  const theme = useTheme()
  const {
    role,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
    celebratedTiers,
    markTierCelebrated,
    timeDisplayFormat,
  } = usePreferences()
  const { categories } = useCategories()
  const goalHours = publisherHours[role]
  const navigation = useNavigation<RootStackNavigation>()
  const tabNavigation = useNavigation<HomeTabStackNavigation>()
  const rollover = useRollover()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, role, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

  const currentDay = moment()
  const selectedMonth = moment().month(month).year(year)
  const isCurrentMonth = currentDay.isSame(selectedMonth, 'month')
  const isPastMonth = currentDay.isAfter(selectedMonth, 'month')
  const monthInFuture = currentDay.isBefore(selectedMonth, 'month')

  const daysInMonth = selectedMonth.daysInMonth()
  const daysRemaining = isCurrentMonth
    ? Math.max(0, daysInMonth - currentDay.date())
    : 0

  const hoursCompleted = adjustedMinutes.value / 60
  const hasMetGoal = hoursCompleted >= goalHours && goalHours > 0

  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const prevMonth = month === 0 ? 11 : month - 1
  const prevMonthYear = month === 0 ? year - 1 : year
  const lastMonthMinutes = useMemo(() => {
    const reports = getMonthsReports(serviceReports, prevMonth, prevMonthYear)
    if (!reports.length) return null
    return adjustedMinutesForSpecificMonth(
      reports,
      prevMonth,
      prevMonthYear,
      role,
      {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }
    ).value
  }, [
    serviceReports,
    prevMonth,
    prevMonthYear,
    role,
    overrideCreditLimit,
    customCreditLimitHours,
  ])
  const momDeltaMinutes =
    lastMonthMinutes !== null && (isCurrentMonth || isPastMonth)
      ? adjustedMinutes.value - lastMonthMinutes
      : null
  const momDeltaDisplay =
    momDeltaMinutes !== null
      ? formatMinutes(Math.abs(momDeltaMinutes), timeDisplayFormat).formatted
      : null
  const bothMonthsMetGoal =
    hasMetGoal &&
    lastMonthMinutes !== null &&
    lastMonthMinutes / 60 >= goalHours

  // Pace vs plan — mirrors the widget's ahead/behind calc. Compares logged
  // (credit-capped) minutes against the sum of day + recurring plans up to
  // today. Hidden when there's no plan to compare against, or when viewing a
  // non-current month (the concept of "month-to-date" only applies now).
  const plannedMinutesToCurrentDay = useMemo(
    () =>
      isCurrentMonth
        ? plannedMinutesToCurrentDayForMonth(
            month,
            year,
            dayPlans,
            recurringPlans
          )
        : 0,
    [isCurrentMonth, month, year, dayPlans, recurringPlans]
  )
  const aheadBehindMinutes =
    isCurrentMonth && plannedMinutesToCurrentDay > 0
      ? adjustedMinutes.value - plannedMinutesToCurrentDay
      : null
  const aheadBehindDisplay =
    aheadBehindMinutes !== null
      ? formatMinutes(Math.abs(aheadBehindMinutes), timeDisplayFormat).formatted
      : null

  const lastLoggedDate = useMemo(() => {
    if (!monthsReports || monthsReports.length === 0) return null
    const latest = monthsReports.reduce((prev, curr) =>
      moment(curr.date).isAfter(prev.date) ? curr : prev
    )
    return moment(latest.date)
  }, [monthsReports])

  const ldcMinutes = useMemo(
    () =>
      monthsReports
        ? ldcMinutesForSpecificMonth(monthsReports, month, year)
        : 0,
    [month, monthsReports, year]
  )

  const standardMinutes = useMemo(
    () =>
      monthsReports
        ? standardMinutesForSpecificMonth(monthsReports, month, year)
        : 0,
    [month, monthsReports, year]
  )

  const otherMinutes = useMemo(
    () =>
      monthsReports
        ? otherMinutesForSpecificMonth(monthsReports, month, year)
        : null,
    [month, monthsReports, year]
  )

  // Must stay in sync with MonthServiceReportProgressBar's palette — the
  // categories sheet and the progress bar render side-by-side and need to
  // tell the same color story.
  const otherSegmentPalette = [
    theme.colors.accent2,
    theme.colors.accent2Alt,
    theme.colors.warn,
    theme.colors.warnAlt,
    theme.colors.accent3,
    theme.colors.accent3Alt,
  ]
  const categorySegments: CategorySegment[] = [
    {
      title: i18n.t('standard'),
      minutes: standardMinutes,
      color: theme.colors.accent,
    },
    {
      title: i18n.t('ldc'),
      minutes: ldcMinutes,
      color: theme.colors.accentAlt,
      credit: true,
    },
    ...(otherMinutes ?? []).map((report, i) => {
      // Resolve the user-visible label live from the Categories store so a
      // rename propagates without re-running the month aggregation.
      const liveCategory = report.categoryId
        ? categories.find((c) => c.id === report.categoryId)
        : undefined
      const title = liveCategory?.name ?? report.tag
      return {
        title,
        minutes: report.minutes,
        color: otherSegmentPalette[i % otherSegmentPalette.length],
        credit: report.credit,
      }
    }),
  ]
  const hasCategorySegments = categorySegments.some((s) => s.minutes > 0)

  const percentOfGoal = goalHours > 0 ? (hoursCompleted / goalHours) * 100 : 0
  const isPersonalBest = useMemo(() => {
    if (!hasMetGoal || !isCurrentMonth) return false
    return isPersonalBest12mo(
      serviceReports,
      month,
      year,
      hoursCompleted,
      role,
      {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }
    )
  }, [
    hasMetGoal,
    isCurrentMonth,
    serviceReports,
    month,
    year,
    hoursCompleted,
    role,
    overrideCreditLimit,
    customCreditLimitHours,
  ])
  const tier = hasMetGoal ? resolveTier(percentOfGoal, isPersonalBest) : null
  // Past/future months: suppress the celebration palette. See
  // GoalProgressStats + the UX rationale in the plan doc.
  const celebratingTier = isCurrentMonth ? tier : null
  // Amber is the personal-best palette — reserve it for `record` so a
  // high-percent month that *isn't* a 12-month best (e.g. 286% behind a
  // bigger prior month) doesn't masquerade as one.
  const cardTone = celebratingTier === 'record' ? 'amber' : 'default'

  // One-time crossing animation: scale/glow pulse on the seal, a haptic, and
  // (record-only) confetti. Persisted per-month-per-tier so re-opening the
  // screen doesn't re-fire.
  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))
  const monthKey = monthCelebrationKey(month, year)
  const alreadyCelebrated =
    celebratingTier !== null &&
    (celebratedTiers[monthKey] ?? []).includes(celebratingTier)
  const shouldCelebrate = celebratingTier !== null && !alreadyCelebrated
  const fireworks = useFireworks()
  // Tab preloading mounts this screen before the user navigates to it. Gate
  // the celebration burst on actual focus so haptics/fireworks don't fire
  // (and get marked as celebrated) while the tab is sitting offscreen.
  const isFocused = useIsFocused()

  // Track scheduled fireworks timers so a quick unmount (tab swap, screen
  // pop) doesn't leave them firing into a torn-down Skia canvas.
  const pendingFireworksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  useEffect(() => {
    return () => {
      if (pendingFireworksTimerRef.current !== null) {
        clearTimeout(pendingFireworksTimerRef.current)
        pendingFireworksTimerRef.current = null
      }
    }
  }, [])

  const fireFireworks = useCallback(() => {
    fireworks.fire()
  }, [fireworks])

  useEffect(() => {
    if (!isFocused) return
    if (!shouldCelebrate || !celebratingTier) return
    sealScale.value = withSequence(
      withTiming(1.3, { duration: 180 }),
      withTiming(1, { duration: 220 })
    )
    if (celebratingTier === 'record') {
      Haptics.heavy()
      fireFireworks()
    } else if (celebratingTier === 'crushed') {
      Haptics.medium()
    } else {
      Haptics.light()
    }
    markTierCelebrated(monthKey, celebratingTier)
  }, [
    isFocused,
    shouldCelebrate,
    celebratingTier,
    monthKey,
    markTierCelebrated,
    sealScale,
    fireFireworks,
  ])

  // Pop any pending fireworks queued by AddTimeScreen.submit() for THIS
  // specific month/year. The queue is keyed per-month so adding time that
  // crosses March's goal doesn't fire on April — the fireworks wait until
  // the user actually navigates to March. If the user submitted from this
  // very screen, the global Lottie + chime is mid-play — delay the Skia
  // bursts until after it finishes so the two celebrations don't visually
  // overlap.
  useFocusEffect(
    useCallback(() => {
      const queuedAt = useCelebrationQueue.getState().consume(month, year)
      if (queuedAt === null) return
      const elapsed = Date.now() - queuedAt
      const lottieTotalMs =
        CONFETTI_DELAY_MS + CONFETTI_DURATION + FIREWORKS_AFTER_LOTTIE_BUFFER_MS
      const delay = Math.max(0, lottieTotalMs - elapsed)
      pendingFireworksTimerRef.current = setTimeout(() => {
        pendingFireworksTimerRef.current = null
        fireFireworks()
      }, delay)
      return () => {
        if (pendingFireworksTimerRef.current !== null) {
          clearTimeout(pendingFireworksTimerRef.current)
          pendingFireworksTimerRef.current = null
        }
      }
    }, [fireFireworks, month, year])
  )

  if (!monthsReports) {
    return (
      <View>
        <Card>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('noTimeReports')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              marginTop: 6,
              marginBottom: 12,
            }}
          >
            {i18n.t('noTimeReports_description')}
          </Text>
          {monthInFuture ? (
            <ActionButton
              onPress={() =>
                tabNavigation.navigate('Schedule', { month, year })
              }
            >
              {i18n.t('createPlan')}
            </ActionButton>
          ) : (
            <ActionButton
              onPress={() =>
                navigation.navigate('Add Time', {
                  date: moment().month(month).year(year).toISOString(),
                })
              }
            >
              {i18n.t('addTime')}
            </ActionButton>
          )}
        </Card>
      </View>
    )
  }

  return (
    <View>
      <Card
        style={{
          gap: 0,
          paddingVertical: noDetails ? 14 : 20,
          paddingHorizontal: noDetails ? 14 : 20,
          ...(cardTone === 'amber' && !noDetails
            ? {
                borderWidth: 2,
                borderColor: theme.colors.supporter,
                backgroundColor: theme.colors.supporterTranslucent,
              }
            : highlightAsCurrentMonth
              ? { borderWidth: 2, borderColor: theme.colors.accent }
              : {}),
        }}
      >
        <View style={{ gap: noDetails ? 10 : 15 }}>
          {/* Title row — when the parent provides section context
            (e.g. Progress screen header + eyebrow already name the month),
            the title is suppressed and the export icon rides in the hero
            row instead. */}
          {!hideTitle && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('xl'),
                }}
              >
                {title ?? moment().month(month).year(year).format('MMMM YYYY')}
              </Text>
              {showReportButton && (
                <ViewReportButton month={month} year={year} />
              )}
            </View>
          )}

          {/* Hero + secondary line. When the parent suppressed the title row
            the report-export affordance is passed into GoalProgressStats'
            header slot so it sits to the right of the tier badge (or alone
            on the trailing edge when no tier is celebrated). */}
          {!noDetails && (
            <GoalProgressStats
              hoursCompleted={hoursCompleted}
              goalHours={goalHours}
              hasMetGoal={hasMetGoal}
              periodState={
                isCurrentMonth ? 'current' : isPastMonth ? 'past' : 'future'
              }
              remainingLabel={`${daysRemaining} ${i18n.t('daysLeft')}`}
              totalLabel={`${daysInMonth} ${i18n.t('days_lowercase')}`}
              achievementTier={celebratingTier}
              sealAnimatedStyle={sealAnimatedStyle}
              headerRightSlot={
                hideTitle && showReportButton ? (
                  <ViewReportButton month={month} year={year} />
                ) : undefined
              }
            />
          )}

          {/* Category breakdown header — tap to open detailed sheet.
            Sits directly above the progress bar since the bar itself
            now carries the category colors + legend. */}
          {!noDetails && hasCategorySegments && (
            <CategoriesSection segments={categorySegments} />
          )}

          {/* Progress bar — detailed view: each category is its own
            colored segment, with a legend rendered below the bar. */}
          <MonthServiceReportProgressBar month={month} year={year} />

          {/* Context chips */}
          {!noDetails && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {aheadBehindMinutes !== null && aheadBehindMinutes !== 0 && (
                <Chip
                  label={`${aheadBehindMinutes > 0 ? '↑' : '↓'} ${i18n.t(
                    aheadBehindMinutes > 0 ? 'aheadShort' : 'behindShort',
                    { value: aheadBehindDisplay }
                  )}`}
                  tone={aheadBehindMinutes > 0 ? 'positive' : 'neutral'}
                />
              )}
              {momDeltaMinutes !== null && momDeltaMinutes !== 0 && (
                <Chip
                  label={`${momDeltaMinutes > 0 ? '↑' : '↓'} ${momDeltaDisplay} ${i18n.t('vsLastMonth')}`}
                  tone={
                    // When both months cleared goal, a downward delta isn't a
                    // warning — it just means a very strong prior month. Keep
                    // tone neutral so the celebration card stays coherent.
                    bothMonthsMetGoal
                      ? 'neutral'
                      : momDeltaMinutes > 0
                        ? 'positive'
                        : 'warn'
                  }
                />
              )}
              <CreditInfoSheet
                creditOverageMinutes={adjustedMinutes.creditOverage}
              />
              {lastLoggedDate && (
                <Chip
                  label={i18n.t('lastLoggedOn', {
                    date: formatMonthDayCompact(lastLoggedDate),
                  })}
                  tone='neutral'
                />
              )}
              {isCurrentMonth && !lastLoggedDate && hoursCompleted === 0 && (
                <Chip label={i18n.t('nothingLoggedYet')} tone='warn' />
              )}
            </View>
          )}
        </View>

        {/* Tertiary action — progress/breakdown is the primary focus; the
          global "+" tab-bar pill is the primary path to logging, so this
          button is kept subdued. */}
        {!noDetails && (
          <View
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              alignItems: 'flex-start',
            }}
          >
            <Button
              onPress={() =>
                monthInFuture
                  ? tabNavigation.navigate('Schedule', { month, year })
                  : navigation.navigate('Add Time', {
                      date: moment().month(month).year(year).toISOString(),
                    })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 6,
              }}
              noTransform
            >
              <FontAwesomeIcon
                icon={faPlus}
                size={11}
                style={{ color: theme.colors.accent }}
              />
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t(monthInFuture ? 'createPlan' : 'addTime')}
              </Text>
            </Button>
          </View>
        )}
      </Card>

      {/* Inline rollover affordance: shown only when (a) viewing the current
        month, (b) there's a fractional source month available, and (c) the
        parent isn't asking for the compact `noDetails` layout. Stays subdued
        on purpose — the takeover screen is the primary path; this is a
        recovery surface for users who pressed "Not now" or deleted the
        rollover pair. */}
      {isCurrentMonth && !noDetails && rollover.availablePending.length > 0 && (
        <Button
          onPress={() => navigation.navigate('Rollover')}
          style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor: theme.colors.backgroundLighter,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
          }}
        >
          <FontAwesomeIcon
            icon={faRightLeft}
            size={12}
            style={{ color: theme.colors.textAlt }}
          />
          <Text
            style={{
              flex: 1,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
            numberOfLines={1}
          >
            {i18n.t('timeRollover_inlineCard', {
              minutes: rollover.availablePending[0].minutes,
              from: moment({
                year: rollover.availablePending[0].sourceYear,
                month: rollover.availablePending[0].sourceMonth,
              }).format('MMMM'),
            })}
          </Text>
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('timeRollover_inlineCard_action')}
          </Text>
        </Button>
      )}
    </View>
  )
}

export default MonthReport
