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
  /**
   * Optional element rendered on the trailing edge of the top row. When a tier
   * seal is present the two share the row with space-between; otherwise the
   * slot rides alone, right-aligned. Lets the parent (e.g. MonthReport) place
   * its View Report affordance without owning a duplicate row.
   */
  headerRightSlot?: ReactNode
  /** Suppress the plain goal suffix when the parent renders an editable goal. */
  hideGoalLabel?: boolean
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
  headerRightSlot,
  hideGoalLabel = false,
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

  if (goalHours <= 0) return null

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

  // iOS Health-style hero split: gigantic numeric headline + small unit
  // baseline-aligned. For decimal preference we keep a bare number + "hours"
  // unit; for short preference the formatter already emits "Xh Ym", so let it
  // own the hero and suppress the standalone unit.
  const isDecimal = timeDisplayFormat === 'decimal'
  const heroSource = periodState === 'future' ? goalDisplay : completedDisplay
  const heroBig = isDecimal
    ? String(heroSource.decimalHours)
    : heroSource.formatted
  const heroUnit = isDecimal ? i18n.t('hours_lowercase') : ''

  // Context line under the hero. The actionable "X left" pill respects the
  // user's time-display preference (decimal vs short). The trailing meta
  // line (days left / goal) shares the same single-tier rhythm.
  const goalSuffix = i18n.t('goalLabel', { value: goalDisplay.formatted })
  let pillText: string | null = null
  const trailingParts: string[] = []
  if (hasMetGoal && beyondMinutes > 0) {
    trailingParts.push(
      i18n.t('beyondGoalShort', { value: beyondDisplay.formatted })
    )
  } else if (hasMetGoal) {
    trailingParts.push(i18n.t('goalAchieved'))
  } else if (periodState === 'current') {
    pillText = `${remainingDisplay.formatted} ${i18n.t('hoursLeft')}`
    if (remainingLabel) trailingParts.push(remainingLabel)
    if (!hideGoalLabel) trailingParts.push(goalSuffix)
  } else if (periodState === 'past') {
    pillText = i18n.t('hrsShort', { value: remainingDisplay.formatted })
    if (!hideGoalLabel) trailingParts.push(goalSuffix)
  } else if (periodState === 'future' && totalLabel) {
    trailingParts.push(totalLabel)
  }
  const trailingText = trailingParts.join(' · ')

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
      {(tierBadge || headerRightSlot) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: -6,
          }}
        >
          {tierBadge ?? <View />}
          {headerRightSlot}
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
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
        {!!heroUnit && (
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {heroUnit}
          </Text>
        )}
      </View>
      {(pillText || trailingText) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {pillText && (
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
                {pillText}
              </Text>
            </View>
          )}
          {!!trailingText && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {trailingText}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

export default GoalProgressStats
