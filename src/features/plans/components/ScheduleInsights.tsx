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
import useProjectedTotal from '@/hooks/useProjectedTotal'
import { goalProgress } from '@/lib/goalProgress'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

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
  coveredPercent,
  projected,
  goal,
  leftToPlan,
  goalProgress,
  onEditGoal,
}: {
  onClose: () => void
  coveredPercent: number
  projected: string
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CircularProgress
            progress={goalProgress}
            size={18}
            strokeWidth={3}
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
            {i18n.t('scheduleInsights.goalCoverage')}
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
          {i18n.t('scheduleInsights.percentCovered', {
            percent: coveredPercent,
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
        <GoalStat
          label={i18n.t('scheduleInsights.projected')}
          value={projected}
        />
        <GoalStat
          label={i18n.t('scheduleInsights.leftToPlan')}
          value={leftToPlan}
        />
      </View>

      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: 19,
        }}
      >
        {i18n.t('scheduleInsights.coverageDescription')}
      </Text>
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
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })

  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const { projection } = useProjectedTotal(
    { kind: 'month', month, year },
    goalMinutes
  )
  const coverageProgress =
    goalMinutes > 0
      ? goalProgress({
          minutes: projection.projectedMinutes,
          goalMinutes,
        })
      : null
  const coveredPercent = coverageProgress
    ? Math.round(coverageProgress.percent)
    : 0
  const goalProgressFraction = coverageProgress?.fraction ?? 0

  const projected = useFormattedMinutes(projection.projectedMinutes)
  const goal = useFormattedMinutes(goalMinutes)
  const leftToPlan = useFormattedMinutes(projection.standardGapMinutes)
  const value = i18n.t('scheduleInsights.percentCovered', {
    percent: coveredPercent,
  })
  const label = i18n.t('scheduleInsights.ofGoal', {
    goal: goal.formatted,
  })

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <SchedulePaceInsight month={month} year={year} />
      <PopoverCard
        containerStyle={{ flex: 1 }}
        cardStyle={{
          minHeight: 84,
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
            coveredPercent={coveredPercent}
            projected={projected.formatted}
            goal={goal.formatted}
            leftToPlan={leftToPlan.formatted}
            goalProgress={goalProgressFraction}
            onEditGoal={onEditGoal}
          />
        )}
      >
        <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
            }}
          >
            {value}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flexShrink: 1,
              }}
            >
              <CircularProgress
                progress={goalProgressFraction}
                size={16}
                strokeWidth={3}
                color={theme.colors.accent}
                trackColor={theme.colors.border}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  flexShrink: 1,
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {label}
              </Text>
            </View>
            <LucideIcon
              icon={ChevronRightIcon}
              color={theme.colors.textAlt}
              size={12}
            />
          </View>
        </View>
      </PopoverCard>
    </View>
  )
}

export default ScheduleInsights
