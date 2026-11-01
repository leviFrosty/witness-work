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
  year: number

  onAdjustMilestones?: () => void

  onViewYear?: () => void

  categoriesSlot?: ReactNode

  separateMilestones?: boolean
}

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

  const [bannerMilestone, setBannerMilestone] = useState<number | null>(null)

  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))

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

  const heroSpoken =
    annualGoalHours > 0
      ? i18n.t('durationSpoken.ofGoal', {
          value: formatMinutesSpoken(totalMinutesForServiceYear),
          goal: formatMinutesSpoken(annualGoalHours * 60),
        })
      : formatMinutesSpoken(totalMinutesForServiceYear)

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

  const adjustLink = onAdjustMilestones ? (
    <View style={{ flexGrow: 1, alignItems: 'flex-end' }}>
      <PointerHover effect='highlight'>
        <Pressable
          onPress={onAdjustMilestones}
          accessibilityRole='button'
          hitSlop={8}
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

      {}
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
      {}
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
            {i18n.t('daysLeftCount', { count: daysRemaining })}
            {minutesToGoal > 0
              ? ` · ${i18n.t('hoursToGoLabel', { value: minutesToGoalDisplay.formatted })}`
              : ''}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <View
          accessibilityLabel={heroSpoken}
          collapsable={false}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Text
            {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
            style={{
              fontSize: isDecimal ? 64 : 40,

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
            {}
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
      {}
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
