import {
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
import { View } from 'react-native'

import PopoverCard from '@/components/PopoverCard'
import SchedulePaceInsight from '@/components/SchedulePaceInsight'
import Button from '@/components/ui/Button'
import CircularProgress from '@/components/ui/CircularProgress'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import { goalProgress } from '@/lib/goalProgress'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { calculateMonthlyPlannedMinutesOptimized } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'

const GoalStat = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        gap: 4,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {value}
      </Text>
    </View>
  )
}

const GoalInsightContent = ({
  onClose,
  plannedPercent,
  monthPlanned,
  goal,
  leftToPlan,
  goalProgress,
  onEditGoal,
}: {
  onClose: () => void
  plannedPercent: number
  monthPlanned: string
  goal: string
  leftToPlan: string
  goalProgress: number
  onEditGoal?: () => void
}) => {
  const theme = useTheme()

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CircularProgress
            progress={goalProgress}
            size={32}
            strokeWidth={4}
            color={theme.colors.accent}
            trackColor={theme.colors.border}
          />
          <Text
            accessibilityRole='header'
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {i18n.t('scheduleInsights.goalPlanned')}
          </Text>
        </View>
        <IconButton
          icon={XIcon}
          size='lg'
          onPress={onClose}
          accessibilityLabel={i18n.t('close')}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('2xl'),
          }}
        >
          {i18n.t('scheduleInsights.percentPlanned', {
            percent: plannedPercent,
          })}
        </Text>
        <Button
          noTransform
          accessibilityRole={onEditGoal ? 'button' : undefined}
          onPress={
            onEditGoal
              ? () => {
                  onClose()
                  setTimeout(onEditGoal, 150)
                }
              : undefined
          }
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('scheduleInsights.monthlyGoal')}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {goal}
              </Text>
              {onEditGoal ? (
                <LucideIcon
                  icon={ChevronRightIcon}
                  color={theme.colors.textAlt}
                  size={12}
                />
              ) : null}
            </View>
          </View>
        </Button>
        <SimpleProgressBar
          percentage={goalProgress}
          color={theme.colors.accent}
          height={10}
          animated={false}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <GoalStat label={i18n.t('planned')} value={monthPlanned} />
        <GoalStat
          label={i18n.t('scheduleInsights.leftToPlan')}
          value={leftToPlan}
        />
      </View>
    </>
  )
}

const ScheduleInsights = ({
  month,
  year,
  onEditGoal,
}: {
  month: number
  year: number
  onEditGoal?: () => void
}) => {
  const theme = useTheme()
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })

  const monthPlannedMinutes = calculateMonthlyPlannedMinutesOptimized(
    month,
    year,
    dayPlans,
    recurringPlans
  )
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const plannedGoalProgress =
    goalMinutes > 0
      ? goalProgress({ minutes: monthPlannedMinutes, goalMinutes })
      : null
  const plannedPercent = plannedGoalProgress
    ? Math.round(plannedGoalProgress.percent)
    : 0
  const goalProgressFraction = plannedGoalProgress?.fraction ?? 0
  const leftToPlanMinutes = plannedGoalProgress?.remaining ?? 0

  const monthPlanned = useFormattedMinutes(monthPlannedMinutes)
  const goal = useFormattedMinutes(goalMinutes)
  const leftToPlan = useFormattedMinutes(leftToPlanMinutes)
  const value = i18n.t('scheduleInsights.percentPlanned', {
    percent: plannedPercent,
  })
  const label = i18n.t('scheduleInsights.ofGoal', {
    goal: goal.formatted,
  })

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <SchedulePaceInsight month={month} year={year} variant='schedule' />
      <PopoverCard
        containerStyle={{ flex: 1 }}
        cardStyle={{
          minHeight: 102,
          padding: 12,
          gap: 10,
          justifyContent: 'space-between',
        }}
        fill
        accessibilityLabel={`${value}. ${label}`}
        accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
        popoverContent={({ close }) => (
          <GoalInsightContent
            onClose={close}
            plannedPercent={plannedPercent}
            monthPlanned={monthPlanned.formatted}
            goal={goal.formatted}
            leftToPlan={leftToPlan.formatted}
            goalProgress={goalProgressFraction}
            onEditGoal={onEditGoal}
          />
        )}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <CircularProgress
            progress={goalProgressFraction}
            size={24}
            strokeWidth={4}
            color={theme.colors.accent}
            trackColor={theme.colors.border}
          />
          <LucideIcon
            icon={ChevronRightIcon}
            color={theme.colors.textAlt}
            size={12}
          />
        </View>
        <View style={{ gap: 1 }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {value}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {label}
          </Text>
        </View>
      </PopoverCard>
    </View>
  )
}

export default ScheduleInsights
