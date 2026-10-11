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
import { plannedMinutesThroughDayForMonth } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import StripedFill from '@/components/ui/StripedFill'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'

type Props = CalendarMonth & {
  onPress: () => void
  /** Long-press shortcut; absent when the month's goal can't change. */
  onEditGoal?: () => void
}

/**
 * The focused month's goal at a glance above the Schedule's calendar: logged
 * time and the month's Plans against the Monthly Goal, and whether logged time
 * keeps up with the Plans so far, which the day colors show too.
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
  const logged = useFormattedMinutes(projection.loggedMinutes)
  const loggedLabel = i18n.t('scheduleCalendar.logged', {
    value: logged.formatted,
  })
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
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  // Unlike the Projected Total elsewhere, Schedule shows every Plan in the
  // month, including days already past.
  const monthPlannedMinutes = plannedMinutesThroughDayForMonth(
    month,
    year,
    moment({ year, month, day: 1 }).daysInMonth(),
    dayPlans,
    recurringPlans
  )
  // A past month shows what was logged instead.
  const totalMinutes =
    tense === 'past' ? projection.loggedMinutes : monthPlannedMinutes
  const total = formatMinutesCompact(totalMinutes) || '0'
  const amount = hasGoal
    ? i18n.t(
        tense === 'past'
          ? 'scheduleCalendar.ofGoalLogged'
          : 'scheduleCalendar.ofGoalPlanned',
        { value: total, goal: formatMinutesCompact(goalMinutes) }
      )
    : i18n.t(
        tense === 'past'
          ? 'scheduleCalendar.logged'
          : 'scheduleCalendar.planned',
        { value: total }
      )

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
      accessibilityLabel={[name, amount, loggedLabel, pace]
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              flexShrink: 1,
            }}
          >
            <Swatch striped={tense !== 'past'} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {amount}
            </Text>
          </View>
        </View>
        <GoalSplitBar
          goalMinutes={goalMinutes}
          loggedMinutes={projection.loggedMinutes}
          plannedMinutes={
            tense === 'past'
              ? 0
              : monthPlannedMinutes - projection.loggedMinutes
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              flexShrink: 1,
            }}
          >
            <Swatch />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {loggedLabel}
            </Text>
          </View>
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

/** Keys a label to the bar: solid for logged time, striped for planned. */
function Swatch({ striped = false }: { striped?: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 12,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        backgroundColor: striped
          ? theme.colors.background
          : theme.colors.accent,
      }}
    >
      {striped && (
        <StripedFill color={theme.colors.accent} size={4} strokeWidth={1.5} />
      )}
    </View>
  )
}
