import LucideIcon from '@/components/ui/LucideIcon'
import { ReactNode } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { AchievementTier, tierColor } from '@/lib/achievementTier'
import { goalProgress } from '@/lib/goalProgress'
import { formatMinutesSpoken, useFormattedMinutes } from '@/lib/minutes'
import { formatPlainNumber } from '@/lib/numbers'
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

  achievementTier?: AchievementTier | null

  sealAnimatedStyle?: Parameters<typeof Animated.View>[0]['style']

  bar?: ReactNode

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
  const largeText = useAccessibilityTextSize()
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

  const isDecimal = timeDisplayFormat === 'decimal'
  const showsGoalInHero = hasGoal && periodState !== 'future'
  const heroSource = periodState === 'future' ? goalDisplay : completedDisplay
  const heroBig = isDecimal
    ? formatPlainNumber(heroSource.decimalHours)
    : heroSource.formatted

  const heroSuffix = showsGoalInHero
    ? i18n.t('goalHoursSuffix', { count: goalHours })
    : isDecimal
      ? i18n.t('hoursUnitLabel', { count: heroSource.decimalHours })
      : ''

  const heroSpoken = showsGoalInHero
    ? i18n.t('durationSpoken.ofGoal', {
        value: formatMinutesSpoken(completedMinutes),
        goal: formatMinutesSpoken(goalMinutes),
      })
    : formatMinutesSpoken(
        periodState === 'future' ? goalMinutes : completedMinutes
      )

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
    metaLead = i18n.t('hoursLeftValue', { value: remainingDisplay.formatted })
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
        accessibilityLabel={heroSpoken}
        collapsable={false}
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: showsGoalInHero ? 2 : 8,
        }}
      >
        <Text
          {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
          style={{
            fontSize: isDecimal ? 64 : 40,

            lineHeight:
              largeText && isDecimal ? undefined : isDecimal ? 68 : 44,
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
