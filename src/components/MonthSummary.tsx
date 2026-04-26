import { View, Dimensions } from 'react-native'
import Text from './MyText'
import i18n from '../lib/locales'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { faArrowUpFromBracket, faPlus } from '@fortawesome/free-solid-svg-icons'
import IconButton from './IconButton'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  ldcMinutesForSpecificMonth,
  otherMinutesForSpecificMonth,
  standardMinutesForSpecificMonth,
} from '../lib/serviceReport'
import useServiceReport from '../stores/serviceReport'
import { useEffect, useMemo } from 'react'
import useTheme from '../contexts/theme'
import { ExportTimeSheetState } from './ExportTimeSheet'
import { ServiceReport } from '../types/serviceReport'
import { CategorySegment } from './CategorySegmentBar'
import CategoriesSection from './CategoriesSection'
import { usePreferences } from '../stores/preferences'
import GlassCard from './GlassCard'
import ActionButton from './ActionButton'
import Button from './Button'
import Chip from './Chip'
import CreditInfoSheet from './CreditInfoSheet'
import { useNavigation } from '@react-navigation/native'
import _ from 'lodash'
import moment from 'moment'
import GoalProgressStats from './GoalProgressStats'
import { RootStackNavigation } from '../types/rootStack'
import {
  isPersonalBest12mo,
  monthCelebrationKey,
  resolveTier,
} from '../lib/achievementTier'
import { useRollover } from '../hooks/useRollover'
import { faRightLeft } from '@fortawesome/free-solid-svg-icons'
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Haptics from '../lib/haptics'
import ConfettiCannon from '../vendor/ConfettiCannon'

interface MonthSummaryProps {
  monthsReports: ServiceReport[] | null
  month: number
  year: number
  setSheet?: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
  title?: string
  hideTitle?: boolean
  noDetails?: boolean
  highlightAsCurrentMonth?: boolean
}

const MonthSummary = ({
  monthsReports,
  month,
  year,
  setSheet,
  title,
  hideTitle,
  noDetails,
  highlightAsCurrentMonth,
}: MonthSummaryProps) => {
  const theme = useTheme()
  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
    celebratedTiers,
    markTierCelebrated,
  } = usePreferences()
  const goalHours = publisherHours[publisher]
  const navigation = useNavigation<RootStackNavigation>()
  const rollover = useRollover()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, publisher, {
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

  const { serviceReports } = useServiceReport()
  const prevMonth = month === 0 ? 11 : month - 1
  const prevMonthYear = month === 0 ? year - 1 : year
  const lastMonthHours = useMemo(() => {
    const reports = getMonthsReports(serviceReports, prevMonth, prevMonthYear)
    if (!reports.length) return null
    return (
      adjustedMinutesForSpecificMonth(
        reports,
        prevMonth,
        prevMonthYear,
        publisher,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ).value / 60
    )
  }, [
    serviceReports,
    prevMonth,
    prevMonthYear,
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
  ])
  const momDelta =
    lastMonthHours !== null && (isCurrentMonth || isPastMonth)
      ? _.round(hoursCompleted - lastMonthHours, 1)
      : null
  const bothMonthsMetGoal =
    hasMetGoal && lastMonthHours !== null && lastMonthHours >= goalHours

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
    ...(otherMinutes ?? []).map((report, i) => ({
      title: report.tag,
      minutes: report.minutes,
      color: otherSegmentPalette[i % otherSegmentPalette.length],
      credit: report.credit,
    })),
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
      publisher,
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
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
  ])
  const tier = hasMetGoal ? resolveTier(percentOfGoal, isPersonalBest) : null
  // Past/future months: suppress the celebration palette. See
  // GoalProgressStats + the UX rationale in the plan doc.
  const celebratingTier = isCurrentMonth ? tier : null
  const cardTone =
    celebratingTier === 'crushed' || celebratingTier === 'record'
      ? 'amber'
      : 'default'

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

  useEffect(() => {
    if (!shouldCelebrate || !celebratingTier) return
    sealScale.value = withSequence(
      withTiming(1.3, { duration: 180 }),
      withTiming(1, { duration: 220 })
    )
    // Confetti auto-starts on its own mount; this effect only owns the
    // haptic + "mark as celebrated" side effects.
    if (celebratingTier === 'record') {
      Haptics.heavy()
    } else if (celebratingTier === 'crushed') {
      Haptics.medium()
    } else {
      Haptics.light()
    }
    markTierCelebrated(monthKey, celebratingTier)
  }, [
    shouldCelebrate,
    celebratingTier,
    monthKey,
    markTierCelebrated,
    sealScale,
  ])

  if (!monthsReports) {
    return (
      <GlassCard>
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
            onPress={() => navigation.navigate('PlanSchedule', { month, year })}
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
      </GlassCard>
    )
  }

  return (
    <View>
      <GlassCard
        highlighted={highlightAsCurrentMonth}
        padding={noDetails ? 14 : 20}
        tone={noDetails ? 'default' : cardTone}
        style={{ gap: 0 }}
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
              {setSheet !== undefined && (
                <IconButton
                  iconStyle={{ color: theme.colors.textAlt }}
                  onPress={() =>
                    setSheet({
                      open: true,
                      month: month,
                      year,
                    })
                  }
                  icon={faArrowUpFromBracket}
                />
              )}
            </View>
          )}

          {/* Hero + secondary line */}
          {!noDetails && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
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
                />
              </View>
              {hideTitle && setSheet !== undefined && (
                <IconButton
                  iconStyle={{ color: theme.colors.textAlt }}
                  onPress={() =>
                    setSheet({
                      open: true,
                      month: month,
                      year,
                    })
                  }
                  icon={faArrowUpFromBracket}
                />
              )}
            </View>
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
              {momDelta !== null && momDelta !== 0 && (
                <Chip
                  label={`${momDelta > 0 ? '↑' : '↓'} ${Math.abs(momDelta)} ${i18n.t('vsLastMonth')}`}
                  tone={
                    // When both months cleared goal, a downward delta isn't a
                    // warning — it just means a very strong prior month. Keep
                    // tone neutral so the celebration card stays coherent.
                    bothMonthsMetGoal
                      ? 'neutral'
                      : momDelta > 0
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
                    date: lastLoggedDate.format('MMM D'),
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
                  ? navigation.navigate('PlanSchedule', { month, year })
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
      </GlassCard>

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

      {shouldCelebrate && celebratingTier === 'record' && (
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
          <ConfettiCannon
            count={80}
            origin={{ x: Dimensions.get('window').width / 2, y: 0 }}
            fadeOut
            autoStart
            colors={[
              theme.colors.supporter,
              theme.colors.accent,
              theme.colors.accent3,
              theme.colors.pink,
              theme.colors.teal,
            ]}
          />
        </View>
      )}
    </View>
  )
}

export default MonthSummary
