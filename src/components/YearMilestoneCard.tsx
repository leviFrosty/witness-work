import { Crown as CrownIcon, Star as StarIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import moment from 'moment'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useIsFocused } from '@react-navigation/native'

import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import usePublisher from '@/hooks/usePublisher'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports, serviceYearBounds } from '@/lib/serviceYear'
import {
  getEffectiveMilestones,
  getMilestoneHitState,
  milestoneCelebrationKey,
} from '@/lib/milestones'
import { formatMinutesSpoken, useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import Haptics from '@/lib/haptics'
import useFireworks from '@/hooks/useFireworks'

import Card from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import MilestoneProgressBar from '@/components/MilestoneProgressBar'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import ContextMenu from '@/components/ui/ContextMenu'
import { useShallow } from 'zustand/react/shallow'
import { tracking } from '@/lib/tracking'

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
  /**
   * Opens this service year on Progress. With `onAdjustMilestones`, it's
   * offered in the hero's long-press menu.
   */
  onViewYear?: () => void
  /** Optional category details row between the annual total and progress bar. */
  categoriesSlot?: ReactNode
  /** Show milestone details in a second card on the Year screen. */
  separateMilestones?: boolean
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
  onViewYear,
  categoriesSlot,
  separateMilestones = false,
}: YearMilestoneCardProps) => {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  const serviceYear = year - 1
  const { type: publisher, annualGoalHours } = usePublisher(
    serviceYearFocusMonth(serviceYear)
  )
  const roleFor = useRoleForMonth()
  const {
    milestoneOverrides,
    timeDisplayFormat,
    celebratedMilestones,
    markMilestoneCelebrated,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences(
    useShallow((s) => ({
      milestoneOverrides: s.milestoneOverrides,
      timeDisplayFormat: s.timeDisplayFormat,
      celebratedMilestones: s.celebratedMilestones,
      markMilestoneCelebrated: s.markMilestoneCelebrated,
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { serviceReports } = useServiceReport()
  const fireworks = useFireworks()
  const isFocused = useIsFocused()

  const totalMinutesForServiceYear = useMemo(
    () =>
      getTotalMinutesForServiceYear(
        getServiceYearReports(serviceReports, serviceYear),
        serviceYear,
        roleFor,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ),
    [
      serviceReports,
      serviceYear,
      roleFor,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const milestones = useMemo(
    () =>
      getEffectiveMilestones(publisher, milestoneOverrides, annualGoalHours),
    [publisher, milestoneOverrides, annualGoalHours]
  )
  const hitState = useMemo(
    () => getMilestoneHitState(milestones, totalMinutesForServiceYear),
    [milestones, totalMinutesForServiceYear]
  )

  // One-time crossing celebration. Mirrors MonthReport: pulse a seal, fire a
  // haptic, and (annual-goal only) trigger the fireworks burst — but only the
  // first time the user lands on the Year tab after the milestone was crossed.
  // Persisted via `celebratedMilestones` so re-opening the screen, or switching
  // between Year and other tabs, doesn't re-fire. We celebrate every milestone
  // the user has hit but not yet been shown the animation for. Derived from the
  // live preference so a refocus after marking finds nothing left to celebrate.
  const serviceYearKey = milestoneCelebrationKey(serviceYear)
  const celebratedForYear = celebratedMilestones[serviceYearKey] ?? []
  const justHitMilestones = hitState.hit.filter(
    (m) => !celebratedForYear.includes(m)
  )
  const justHitTop =
    justHitMilestones.length > 0 ? Math.max(...justHitMilestones) : null
  const isGoalComplete =
    annualGoalHours > 0 && totalMinutesForServiceYear >= annualGoalHours * 60
  const isJustHitAnnualGoal =
    justHitTop !== null && justHitTop === annualGoalHours
  // The largest milestone this visit celebrated drives the inline banner. Held
  // in state because marking it celebrated clears `justHitTop` straight away;
  // dropped on blur so a re-visit no longer shows it.
  const [bannerMilestone, setBannerMilestone] = useState<number | null>(null)

  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))

  // Service-year span: Sep 1 of `serviceYear` → Aug 31 of `serviceYear + 1`.
  const { start: serviceYearStart, end: serviceYearEnd } = useMemo(
    () => serviceYearBounds(serviceYear),
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
    if (!isFocused) {
      setBannerMilestone(null)
      return
    }
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
      setBannerMilestone(justHitTop)
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

  const titleText = i18n.t('scheduleCalendar.serviceYearSpan', {
    start: formatPlainNumber(serviceYear),
    end: formatPlainNumber(serviceYear + 1),
  })

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
  // Read as one phrase ("43 hours 30 minutes of 600 hours"), not "43.5, / 600
  // hours".
  const heroSpoken =
    annualGoalHours > 0
      ? i18n.t('durationSpoken.ofGoal', {
          value: formatMinutesSpoken(totalMinutesForServiceYear),
          goal: formatMinutesSpoken(annualGoalHours * 60),
        })
      : formatMinutesSpoken(totalMinutesForServiceYear)

  // Mirror the month card's `record` tier treatment: amber border + translucent
  // supporter background reads as celebratory without overpowering the chart.
  // We apply it for any service year that hit the annual goal — past, present,
  // or future (future can't actually hit goal yet, but the check is safe). The
  // active crossing animation upstream is the gated one.
  const showCompletionTreatment = isGoalComplete && annualGoalHours > 0

  const milestoneCount =
    hitState.total > 0 ? (
      <View style={{ flexDirection: 'row', marginLeft: -10 }}>
        <Chip
          icon='✓'
          tone={hitState.totalHit === hitState.total ? 'positive' : 'neutral'}
          label={i18n.t('milestonesHitChip', {
            hit: hitState.totalHit,
            total: hitState.total,
          })}
        />
      </View>
    ) : null

  // Keeps the link at the trailing edge, also when a long translation wraps it
  // below the text beside it.
  const adjustLink = onAdjustMilestones ? (
    <View style={{ flexGrow: 1, alignItems: 'flex-end' }}>
      <PointerHover effect='highlight'>
        <Pressable
          onPress={onAdjustMilestones}
          accessibilityRole='button'
          hitSlop={8}
          // Room for the pointer highlight; the margin keeps the layout.
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginHorizontal: -6,
            marginVertical: -2,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('adjustMilestones')}
          </Text>
          <LucideIcon
            icon={ChevronForwardIcon}
            size={14}
            color={theme.colors.accent}
          />
        </Pressable>
      </PointerHover>
    </View>
  ) : null

  const milestoneDetails = (
    <>
      <MilestoneProgressBar year={year} />

      {/* Transient "just hit a milestone" banner — only renders when the user
        lands on the tab right after crossing a non-final rung. Marked as
        celebrated in the focus effect above, which also drops the banner on
        blur. For the annual goal itself we suppress it (the top-row "You did
        it!" badge already carries that message). */}
      {bannerMilestone !== null ? (
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
            <LucideIcon icon={StarIcon} color={theme.colors.accent} size={16} />
          </Animated.View>
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('milestoneJustHitBanner', { hours: bannerMilestone })}
          </Text>
        </View>
      ) : null}

      {showCompletionTreatment ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.supporterText,
            }}
          >
            {i18n.t('annualGoalCompleteCongrats')}
          </Text>
          {adjustLink}
        </View>
      ) : hitState.next !== null && nextMilestoneRemainingMinutes !== null ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View
            style={{
              flexShrink: 1,
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
          {adjustLink}
        </View>
      ) : onAdjustMilestones ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {adjustLink}
        </View>
      ) : null}
    </>
  )

  const hero = (
    <View style={{ gap: 15 }}>
      {/* The days left wrap under the Service Year when they don't fit beside
          it, as at large text sizes. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
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
            letterSpacing: tracking(0.5),
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
              <LucideIcon
                icon={CrownIcon}
                color={theme.colors.supporter}
                size={16}
              />
            </Animated.View>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.supporterText,
              }}
            >
              {i18n.t('annualGoalCompleteBadge')}
            </Text>
          </View>
        ) : isCurrentServiceYear ? (
          <Text
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('daysLeftCount', { count: daysRemaining })
            }
            {minutesToGoal > 0
              ? ` · ${i18n.t('hoursToGoLabel', { value: minutesToGoalDisplay.formatted })}`
              : ''}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <View
          accessibilityLabel={heroSpoken}
          // A label alone doesn't keep the view, and the card reads its label.
          collapsable={false}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Text
            // At accessibility sizes the figure shrinks onto one line rather
            // than breaking between its digits.
            {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
            // Drop a tier in "short" mode so "234h 56m / 600 hours" fits the
            // card without auto-shrinking the hero to fine print.
            style={{
              fontSize: isDecimal ? 64 : 40,
              // A fixed line height would keep the full-size line around a
              // shrunk figure.
              lineHeight:
                largeText && isDecimal ? undefined : isDecimal ? 68 : 44,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {isDecimal
              ? formatPlainNumber(completedHeroDisplay.decimalHours)
              : completedHeroDisplay.formatted}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textAlt,
            }}
          >
            {/* @ts-expect-error TranslationKey doesn't handle keys that contain objects. */}
            {i18n.t('goalHoursSuffix', { count: annualGoalHours })}
          </Text>
        </View>

        {!separateMilestones && milestoneCount}
      </View>
    </View>
  )

  const card = (
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
      {/* The hero long-presses for the year's actions where the card has
          them (Progress); both stay reachable from the visible links. */}
      {onAdjustMilestones ? (
        <ContextMenu
          actions={[
            {
              id: 'adjust_milestones',
              title: i18n.t('adjustMilestonesEllipsis'),
              systemImage: 'flag',
              onPress: onAdjustMilestones,
            },
            onViewYear && {
              id: 'view_year',
              title: i18n.t('viewYear'),
              systemImage: 'calendar',
              onPress: onViewYear,
            },
          ]}
        >
          {hero}
        </ContextMenu>
      ) : (
        hero
      )}

      {categoriesSlot}

      {!separateMilestones && milestoneDetails}
    </Card>
  )

  if (!separateMilestones) return card

  // Its own View: a fragment's two cards would sit flush wherever a wrapper
  // (Progress's RestWhileEditing) keeps the parent's gap from reaching them.
  return (
    <View style={{ gap: 12 }}>
      {card}
      <Card>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: tracking(0.5),
          }}
        >
          {i18n.t('milestones')}
        </Text>
        {milestoneCount}
        {milestoneDetails}
      </Card>
    </View>
  )
}

export default YearMilestoneCard
