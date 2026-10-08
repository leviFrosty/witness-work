import moment from 'moment'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import i18n from '@/lib/locales'
import { formatMinutesCompact, useFormattedMinutes } from '@/lib/minutes'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'

type Props = CalendarMonth & {
  /** The month the calendar is scrolled to. */
  focused: boolean
  onPress: () => void
  /** Long-press shortcut; absent when the month's goal can't change. */
  onEditGoal?: () => void
}

/**
 * One month's goal at a glance above the Schedule's calendar: logged and
 * planned time against the Monthly Goal, and what's left to plan. Two sit side
 * by side, the focused month and the next one, since publishers plan both at
 * once.
 */
export default function MonthGoalMeter({
  year,
  month,
  focused,
  onPress,
  onEditGoal,
}: Props) {
  const theme = useTheme()
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const { projection, today } = useProjectedTotal(
    { kind: 'month', month, year },
    goalMinutes
  )
  const tense = getPeriodTense({ kind: 'month', month, year }, today)
  const hasGoal = goalMinutes > 0
  const left = useFormattedMinutes(
    tense === 'past'
      ? Math.max(0, goalMinutes - projection.loggedMinutes)
      : projection.standardGapMinutes
  )
  const planned = useFormattedMinutes(projection.plannedMinutes)
  const logged = useFormattedMinutes(projection.loggedMinutes)

  const name = moment({ year, month, day: 1 }).format(
    year === today.getFullYear() ? 'MMMM' : 'MMM YYYY'
  )
  const total = formatMinutesCompact(projection.projectedMinutes) || '0'
  const amount = hasGoal
    ? i18n.t('scheduleCalendar.ofGoal', {
        value: total,
        goal: formatMinutesCompact(goalMinutes),
      })
    : total

  const met = hasGoal && left.decimalHours === 0
  const status = !hasGoal
    ? tense === 'past'
      ? i18n.t('scheduleCalendar.logged', { value: logged.formatted })
      : i18n.t('scheduleCalendar.planned', { value: planned.formatted })
    : tense === 'past'
      ? met
        ? i18n.t('scheduleCalendar.goalMet')
        : i18n.t('scheduleCalendar.short', { value: left.formatted })
      : met
        ? i18n.t('scheduleCalendar.goalCovered')
        : i18n.t('scheduleCalendar.leftToPlan', { value: left.formatted })

  return (
    <ContextMenu
      actions={[
        onEditGoal && {
          id: 'edit_goal',
          title: i18n.t('scheduleCalendar.editMonthlyGoal'),
          systemImage: 'target',
          onPress: onEditGoal,
        },
      ]}
      onPress={onPress}
      accessibilityLabel={`${name}. ${amount}. ${status}`}
      hoverRadius={theme.numbers.borderRadiusLg}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={{
          gap: 7,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusLg,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderColor: focused ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.card,
          opacity: focused ? 1 : 0.62,
          transitionProperty: ['opacity', 'borderColor'],
          transitionDuration: 220,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {amount}
          </Text>
        </View>
        <GoalSplitBar
          goalMinutes={goalMinutes}
          loggedMinutes={projection.loggedMinutes}
          plannedMinutes={
            projection.projectedMinutes - projection.loggedMinutes
          }
          height={6}
        />
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('xs'),
            fontFamily: theme.fonts.semiBold,
            color: met ? theme.colors.accent : theme.colors.textAlt,
          }}
        >
          {status}
        </Text>
      </Animated.View>
    </ContextMenu>
  )
}
