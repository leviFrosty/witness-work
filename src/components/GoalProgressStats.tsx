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
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import { useFormattedMinutes } from '../lib/minutes'
import { AchievementTier } from '../lib/achievementTier'
import { Theme } from '../types/theme'

export type PeriodState = 'current' | 'past' | 'future'
export type PaceUnit = 'day' | 'month'

type GoalProgressStatsProps = {
  hoursCompleted: number
  goalHours: number
  hasMetGoal: boolean
  periodState: PeriodState
  paceHoursPerUnit?: number
  paceUnit?: PaceUnit
  isOnPace?: boolean
  remainingLabel?: string
  totalLabel?: string
  /**
   * When provided and periodState is 'current', the hero line renders the
   * celebration tier (icon + amber palette for crushed/record) instead of the
   * plain "Goal achieved" label. Past/future months ignore this prop and keep
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

const GoalProgressStats = ({
  hoursCompleted,
  goalHours,
  hasMetGoal,
  periodState,
  paceHoursPerUnit,
  paceUnit,
  isOnPace,
  remainingLabel,
  totalLabel,
  achievementTier,
  sealAnimatedStyle,
}: GoalProgressStatsProps) => {
  const theme = useTheme()
  const hoursRemaining = Math.max(0, goalHours - hoursCompleted)
  const percentOfGoal =
    goalHours > 0 ? Math.round((hoursCompleted / goalHours) * 100) : 0
  const hoursCompletedFormatted = useFormattedMinutes(hoursCompleted * 60)
  const hoursBeyondGoal = _.round(Math.max(0, hoursCompleted - goalHours), 1)

  if (goalHours <= 0) return null

  const showTier =
    hasMetGoal && periodState === 'current' && achievementTier !== undefined
  return (
    <View style={{ gap: 2 }}>
      <HeroLine
        hasMetGoal={hasMetGoal}
        periodState={periodState}
        hoursRemaining={hoursRemaining}
        goalHours={goalHours}
        paceHoursPerUnit={paceHoursPerUnit}
        paceUnit={paceUnit}
        isOnPace={!!isOnPace}
        tier={showTier ? (achievementTier ?? null) : null}
        sealAnimatedStyle={sealAnimatedStyle}
      />
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {`${hoursCompletedFormatted.formatted} / ${goalHours} ${i18n.t('hours')}`}
        {hasMetGoal && hoursBeyondGoal > 0
          ? ` · ${i18n.t('beyondGoalShort', { count: hoursBeyondGoal })}`
          : ` · ${percentOfGoal}%`}
        {periodState === 'current' && remainingLabel
          ? ` · ${remainingLabel}`
          : ''}
        {periodState === 'future' && totalLabel ? ` · ${totalLabel}` : ''}
      </Text>
    </View>
  )
}

type HeroLineProps = {
  hasMetGoal: boolean
  periodState: PeriodState
  hoursRemaining: number
  goalHours: number
  paceHoursPerUnit?: number
  paceUnit?: PaceUnit
  isOnPace: boolean
  tier: AchievementTier | null
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
  return tier === 'crushed' || tier === 'record'
    ? theme.colors.supporter
    : theme.colors.accent
}

const HeroLine = ({
  hasMetGoal,
  periodState,
  hoursRemaining,
  goalHours,
  paceHoursPerUnit,
  paceUnit,
  isOnPace,
  tier,
  sealAnimatedStyle,
}: HeroLineProps) => {
  const theme = useTheme()
  const base = {
    fontSize: theme.fontSize('lg'),
    fontFamily: theme.fonts.semiBold,
  }

  if (hasMetGoal) {
    // Past months intentionally skip the tier palette — historical data
    // shouldn't retroactively light up amber for a user who's only just
    // installed the new version of the app.
    if (tier) {
      const color = tierColor(tier, theme)
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Animated.View style={sealAnimatedStyle}>
            <FontAwesomeIcon icon={tierIcon(tier)} color={color} size={18} />
          </Animated.View>
          <Text style={{ ...base, color }}>{i18n.t(tierCopyKey(tier))}</Text>
        </View>
      )
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FontAwesomeIcon icon={faCheck} color={theme.colors.accent} size={16} />
        <Text style={{ ...base, color: theme.colors.accent }}>
          {i18n.t('goalAchieved')}
        </Text>
      </View>
    )
  }
  if (periodState === 'past') {
    return (
      <Text style={{ ...base, color: theme.colors.textAlt }}>
        {i18n.t('hrsShort', { count: _.round(hoursRemaining, 1) })}
      </Text>
    )
  }
  if (periodState === 'future') {
    return (
      <Text style={{ ...base, color: theme.colors.textAlt }}>
        {i18n.t('goalLabel', { count: goalHours })}
      </Text>
    )
  }
  if (
    periodState === 'current' &&
    paceHoursPerUnit &&
    paceHoursPerUnit > 0 &&
    paceUnit
  ) {
    const key = paceUnit === 'day' ? 'hrsPerDayToGoal' : 'hrsPerMonthToGoal'
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ ...base, color: theme.colors.text }}>
          {i18n.t(key, { count: paceHoursPerUnit })}
        </Text>
        {isOnPace && (
          <View
            style={{
              backgroundColor: theme.colors.accentTranslucent,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('onPace')}
            </Text>
          </View>
        )}
      </View>
    )
  }
  return (
    <Text style={{ ...base, color: theme.colors.text }}>
      {/* @ts-expect-error TranslationKey typing */}
      {i18n.t('hoursShort', { count: _.round(hoursRemaining, 1) })}{' '}
      {i18n.t('remaining')}
    </Text>
  )
}

export default GoalProgressStats
