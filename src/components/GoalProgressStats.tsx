import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import _ from 'lodash'
import {
  faCheck,
  faStar,
  faTrophy,
  faCrown,
  IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import { AchievementTier } from '@/lib/achievementTier'
import { Theme } from '@/types/theme'

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
}

const tierIcon = (tier: AchievementTier): IconDefinition => {
  switch (tier) {
    case 'reached':
      return faCheck
    case 'exceeded':
      return faStar
    case 'crushed':
      return faTrophy
    case 'record':
      return faCrown
  }
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

const tierColor = (tier: AchievementTier, theme: Theme) => {
  // Gold (`supporter`) is reserved for an actual 12-month personal best.
  // `crushed` is just 150%+ of goal — celebratory, but not record-tier — so it
  // shares the regular accent palette with `reached` / `exceeded`.
  return tier === 'record' ? theme.colors.supporter : theme.colors.accent
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
}: GoalProgressStatsProps) => {
  const theme = useTheme()
  const hoursRemaining = Math.max(0, goalHours - hoursCompleted)
  const hoursBeyondGoal = _.round(Math.max(0, hoursCompleted - goalHours), 1)

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
  // baseline-aligned (e.g. "40" + "hours"). Unit is the lowercase full word
  // for parity with the Year and All-time hero cards. The goal target lives
  // in the context line below alongside "hours left" / "days left" so all
  // reference info shares one visual tier.
  const heroBig =
    periodState === 'future'
      ? String(goalHours)
      : String(_.round(hoursCompleted, 1))
  const heroUnit = i18n.t('hours_lowercase')

  // Context line under the hero. The actionable "hours left" is split off
  // as an outlined pill so it reads as the most-actionable item without
  // breaking the single-tier rhythm — the rest (days left / goal) trails as
  // plain meta. For met-goal and future states there's no "left" value to
  // pull out, so the whole line collapses to plain text.
  const goalSuffix = i18n.t('goalLabel', { count: goalHours })
  let pillText: string | null = null
  const trailingParts: string[] = []
  if (hasMetGoal && hoursBeyondGoal > 0) {
    trailingParts.push(i18n.t('beyondGoalShort', { count: hoursBeyondGoal }))
  } else if (hasMetGoal) {
    trailingParts.push(i18n.t('goalAchieved'))
  } else if (periodState === 'current') {
    pillText = `${_.round(hoursRemaining, 1)} ${i18n.t('hoursLeft')}`
    if (remainingLabel) trailingParts.push(remainingLabel)
    trailingParts.push(goalSuffix)
  } else if (periodState === 'past') {
    pillText = i18n.t('hrsShort', { count: _.round(hoursRemaining, 1) })
    trailingParts.push(goalSuffix)
  } else if (periodState === 'future' && totalLabel) {
    trailingParts.push(totalLabel)
  }
  const trailingText = trailingParts.join(' · ')

  return (
    <View style={{ gap: 10 }}>
      {tier && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Animated.View style={sealAnimatedStyle}>
            <FontAwesomeIcon
              icon={tierIcon(tier)}
              color={heroColor}
              size={18}
            />
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
          style={{
            fontSize: 64,
            lineHeight: 68,
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
