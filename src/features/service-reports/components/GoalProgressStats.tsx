import LucideIcon from '@/components/ui/LucideIcon'
import { ReactNode } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import { AchievementTier, tierColor } from '@/lib/achievementTier'
import { goalProgress } from '@/lib/goalProgress'
import { useFormattedMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { tierIcon } from '@/features/service-reports/lib/achievementTierIcon'

export type PeriodState = 'current' | 'past' | 'future'

type GoalProgressStatsProps = {
  hoursCompleted: number
  goalHours: number
  hasMetGoal: boolean
  periodState: PeriodState
  remainingLabel?: string
  totalLabel?: string
  /**
   * When provided and periodState is 'current', a small tier seal renders above
   * the hero (icon + accent palette by default; gold/amber reserved for the
   * `record` personal-best tier). Past/future months ignore this prop and keep
   * the subdued historical rendering — see docs/month-year-analytics-plan.md
   * for rationale.
   */
  achievementTier?: AchievementTier | null
  /**
   * Reanimated style applied to the achievement seal icon. Exposed so the
   * parent can orchestrate a one-time scale/glow pulse when a new tier is
   * crossed without pushing animation state down into this component.
   */
  sealAnimatedStyle?: Parameters<typeof Animated.View>[0]['style']
  /** Rendered between the hero and the meta line (the progress bar). */
  bar?: ReactNode
  /**
   * Trailing edge of the meta line under the bar — pace and month-over-month
   * deltas ride here so remaining and pace read as one line.
   */
  metaTrailing?: ReactNode
}

const tierCopyKey = (tier: AchievementTier) => {
  switch (tier) {
    case 'reached':
      return 'goalReached' as const
    case 'exceeded':
      return 'goalExceeded' as const
    case 'crushed':
      return 'goalCrushed' as const
    case 'record':
      return 'goalRecord' as const
  }
}

const GoalProgressStats = ({
  hoursCompleted,
  goalHours,
  hasMetGoal,
  periodState,
  remainingLabel,
  totalLabel,
  achievementTier,
  sealAnimatedStyle,
  bar,
  metaTrailing,
}: GoalProgressStatsProps) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const completedMinutes = Math.round(hoursCompleted * 60)
  const goalMinutes = Math.round(goalHours * 60)
  const { remaining: remainingMinutes, over: beyondMinutes } = goalProgress({
    minutes: completedMinutes,
    goalMinutes,
  })
  const completedDisplay = useFormattedMinutes(completedMinutes)
  const goalDisplay = useFormattedMinutes(goalMinutes)
  const remainingDisplay = useFormattedMinutes(remainingMinutes)
  const beyondDisplay = useFormattedMinutes(beyondMinutes)

  // No goal to measure against (e.g. a Regular Publisher who opted into Hours
  // Logging without setting a Monthly Goal). Still surface the logged total —
  // just without the goal-relative pill, suffix, or celebration palette. A
  // future month has nothing logged and no goal to preview, so stay hidden.
  const hasGoal = goalHours > 0
  if (!hasGoal && periodState === 'future') return null

  const tier =
    hasMetGoal && periodState === 'current' && achievementTier
      ? achievementTier
      : null

  const heroColor = tier
    ? tierColor(tier, theme)
    : hasMetGoal
      ? theme.colors.accent
      : periodState === 'future'
        ? theme.colors.textAlt
        : theme.colors.text

  // iOS Health-style hero split: gigantic numeric headline + small suffix
  // baseline-aligned. With a goal the suffix carries it ("/ 30 hours",
  // matching the Service Year card), so the goal never needs its own label.
  // For decimal preference the headline is a bare number; for short
  // preference the formatter already emits "Xh Ym".
  const isDecimal = timeDisplayFormat === 'decimal'
  const showsGoalInHero = hasGoal && periodState !== 'future'
  const heroSource = periodState === 'future' ? goalDisplay : completedDisplay
  const heroBig = isDecimal
    ? String(heroSource.decimalHours)
    : heroSource.formatted
  // Goal hours are user-entered, so they render verbatim (as the year card's
  // Annual Goal does) rather than through the minutes formatter.
  const heroSuffix = showsGoalInHero
    ? `/ ${goalHours} ${i18n.t('hours_lowercase')}`
    : isDecimal
      ? i18n.t('hours_lowercase')
      : ''

  // Meta line under the bar: the actionable figure (left/short) leads in the
  // primary color, the calendar context trails in the secondary color.
  let metaLead: string | null = null
  let metaContext: string | null = null
  if (!hasGoal) {
    if (periodState === 'current' && remainingLabel)
      metaContext = remainingLabel
  } else if (hasMetGoal && beyondMinutes > 0) {
    metaContext = i18n.t('beyondGoalShort', { value: beyondDisplay.formatted })
  } else if (hasMetGoal) {
    metaContext = i18n.t('goalAchieved')
  } else if (periodState === 'current') {
    metaLead = `${remainingDisplay.formatted} ${i18n.t('hoursLeft')}`
    metaContext = remainingLabel ?? null
  } else if (periodState === 'past') {
    metaLead = i18n.t('hrsShort', { value: remainingDisplay.formatted })
  } else if (periodState === 'future' && totalLabel) {
    metaContext = totalLabel
  }

  const tierBadge = tier ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Animated.View style={sealAnimatedStyle}>
        <LucideIcon icon={tierIcon(tier)} color={heroColor} size={18} />
      </Animated.View>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          color: heroColor,
        }}
      >
        {i18n.t(tierCopyKey(tier))}
      </Text>
    </View>
  ) : null

  return (
    <View style={{ gap: 10 }}>
      {tierBadge}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: showsGoalInHero ? 2 : 8,
        }}
      >
        <Text
          // Short preference renders "0 Hrs 10 Mins" — three tokens that
          // don't fit at 64pt on a single card row. Drop one size class so
          // the line wraps gracefully (or stays single-line) without the
          // auto-shrink turning the hero into fine print.
          style={{
            fontSize: isDecimal ? 64 : 40,
            lineHeight: isDecimal ? 68 : 44,
            fontFamily: theme.fonts.bold,
            color: heroColor,
          }}
        >
          {heroBig}
        </Text>
        {!!heroSuffix && (
          <Text
            style={
              showsGoalInHero
                ? {
                    fontSize: theme.fontSize('lg'),
                    color: theme.colors.textAlt,
                  }
                : {
                    fontSize: theme.fontSize('xl'),
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }
            }
          >
            {heroSuffix}
          </Text>
        )}
      </View>
      {bar}
      {(metaLead || metaContext || metaTrailing) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {metaLead && (
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {metaLead}
              </Text>
            )}
            {metaLead && metaContext ? ' · ' : null}
            {metaContext}
          </Text>
          {metaTrailing}
        </View>
      )}
    </View>
  )
}

export default GoalProgressStats
