import moment from 'moment'
import { View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import useScheduleStatusPresentation from '@/hooks/useScheduleStatusPresentation'
import i18n from '@/lib/locales'
import { formatMinutesCompact, useFormattedMinutes } from '@/lib/minutes'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'

type Props = CalendarMonth & {
  onPress: () => void
  /** Long-press shortcut; absent when the month's goal can't change. */
  onEditGoal?: () => void
}

/**
 * The focused month's goal at a glance above the Schedule's calendar: logged
 * and planned time against the Monthly Goal, what's left to plan, and whether
 * logged time keeps up with the Plans so far, which the day colors show too.
 */
export default function MonthGoalMeter({
  year,
  month,
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
  const schedule = useScheduleStatus({ month, year })
  const { color: paceColor, icon: paceIcon } =
    useScheduleStatusPresentation(schedule)
  const paceDifference = useFormattedMinutes(
    Math.abs(schedule.differenceMinutes)
  )
  const pace =
    schedule.state === 'behind'
      ? i18n.t('scheduleCalendar.behindPlan', {
          value: paceDifference.formatted,
        })
      : schedule.state === 'ahead'
        ? i18n.t('scheduleCalendar.aheadOfPlan', {
            value: paceDifference.formatted,
          })
        : schedule.state === 'onTrack'
          ? i18n.t('scheduleCalendar.onPlan')
          : undefined

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
      accessibilityLabel={[name, amount, status, pace]
        .filter(Boolean)
        .join('. ')}
      hoverRadius={theme.numbers.borderRadiusLg}
      style={{ flex: 1 }}
    >
      <View
        style={{
          gap: 7,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusLg,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.card,
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
              color: met ? theme.colors.accent : theme.colors.textAlt,
            }}
          >
            {status}
          </Text>
          {pace && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexShrink: 1,
              }}
            >
              <LucideIcon icon={paceIcon} color={paceColor} size={13} />
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: theme.fontSize('xs'),
                  fontFamily: theme.fonts.semiBold,
                  color: paceColor,
                }}
              >
                {pace}
              </Text>
            </View>
          )}
        </View>
      </View>
    </ContextMenu>
  )
}
