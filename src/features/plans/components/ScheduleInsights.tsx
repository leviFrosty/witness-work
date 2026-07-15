import {
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import SchedulePaceInsight from '@/components/SchedulePaceInsight'
import TiltableCard from '@/components/TiltableCard'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import CircularProgress from '@/components/ui/CircularProgress'
import ExpandingCardOverlay, {
  type ExpandingCardOrigin,
} from '@/components/ui/ExpandingCardOverlay'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
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

const GoalInsightOverlay = ({
  origin,
  open,
  onClose,
  plannedPercent,
  monthPlanned,
  goal,
  leftToPlan,
  goalProgress,
  onEditGoal,
}: {
  origin: ExpandingCardOrigin | null
  open: boolean
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
    <ExpandingCardOverlay origin={origin} open={open} onClose={onClose}>
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
            color={theme.colors.textAlt}
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
        <IconButton icon={XIcon} size='lg' onPress={onClose} />
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
    </ExpandingCardOverlay>
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
  const goalRef = useRef<View>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [origin, setOrigin] = useState<ExpandingCardOrigin | null>(null)

  const monthPlannedMinutes = calculateMonthlyPlannedMinutesOptimized(
    month,
    year,
    dayPlans,
    recurringPlans
  )
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const plannedPercent =
    goalMinutes > 0 ? Math.round((monthPlannedMinutes / goalMinutes) * 100) : 0
  const goalProgress =
    goalMinutes > 0 ? Math.max(0, monthPlannedMinutes / goalMinutes) : 0
  const leftToPlanMinutes = Math.max(0, goalMinutes - monthPlannedMinutes)

  const monthPlanned = useFormattedMinutes(monthPlannedMinutes)
  const goal = useFormattedMinutes(goalMinutes)
  const leftToPlan = useFormattedMinutes(leftToPlanMinutes)
  const value = i18n.t('scheduleInsights.percentPlanned', {
    percent: plannedPercent,
  })
  const label = i18n.t('scheduleInsights.ofGoal', {
    goal: goal.formatted,
  })

  const openDetail = () => {
    goalRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setDetailOpen(true)
    })
  }

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SchedulePaceInsight month={month} year={year} variant='schedule' />
        <View
          ref={goalRef}
          collapsable={false}
          accessible
          accessibilityRole='button'
          accessibilityLabel={`${value}. ${label}`}
          accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
          onAccessibilityTap={openDetail}
          style={{ flex: 1 }}
        >
          <TiltableCard onTap={openDetail} maxTilt={5}>
            <Card
              style={{
                minHeight: 102,
                padding: 12,
                gap: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <CircularProgress
                  progress={goalProgress}
                  size={24}
                  strokeWidth={4}
                  color={theme.colors.textAlt}
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
            </Card>
          </TiltableCard>
        </View>
      </View>

      <GoalInsightOverlay
        origin={origin}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        plannedPercent={plannedPercent}
        monthPlanned={monthPlanned.formatted}
        goal={goal.formatted}
        leftToPlan={leftToPlan.formatted}
        goalProgress={goalProgress}
        onEditGoal={onEditGoal}
      />
    </>
  )
}

export default ScheduleInsights
