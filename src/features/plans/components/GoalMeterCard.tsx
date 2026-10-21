import { View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import StripedFill from '@/components/ui/StripedFill'
import useTheme from '@/contexts/theme'
import useScheduleStatusPresentation from '@/hooks/useScheduleStatusPresentation'
import i18n from '@/lib/locales'
import { formatMinutesCompact, useFormattedMinutes } from '@/lib/minutes'
import { formatPlainNumber } from '@/lib/numbers'
import type { PeriodTense } from '@/lib/projectedTotalCopy'
import type { ScheduleStatus } from '@/lib/scheduleStatus'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'

type Props = {
  /** The period, e.g. the month's name. */
  title: string
  goalMinutes: number
  loggedMinutes: number
  /** Every Plan in the period, including days already past. */
  plannedMinutes: number
  tense: PeriodTense
  /** Logged time against the Plans so far. */
  schedule: ScheduleStatus
  onPress?: () => void
  /** Long-press shortcut; absent when the goal can't change here. */
  editGoal?: { title: string; onPress: () => void }
}

/**
 * A period's goal at a glance above the Schedule: logged time and Plans against
 * the goal, and whether logged time keeps up with the Plans so far. The Month
 * view shows the focused month's; the Year view shows the Service Year's.
 */
export default function GoalMeterCard({
  title,
  goalMinutes,
  loggedMinutes,
  plannedMinutes,
  tense,
  schedule,
  onPress,
  editGoal,
}: Props) {
  const theme = useTheme()
  const hasGoal = goalMinutes > 0
  const logged = useFormattedMinutes(loggedMinutes)
  const loggedLabel = i18n.t('scheduleCalendar.logged', {
    value: logged.formatted,
  })
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

  // A past period shows what was logged instead.
  const total =
    formatMinutesCompact(tense === 'past' ? loggedMinutes : plannedMinutes) ||
    formatPlainNumber(0)
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

  const accessibilityLabel = [title, amount, loggedLabel, pace]
    .filter(Boolean)
    .join('. ')

  const card = (
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
          {title}
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
        loggedMinutes={loggedMinutes}
        plannedMinutes={tense === 'past' ? 0 : plannedMinutes - loggedMinutes}
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
  )

  if (!onPress && !editGoal) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {card}
      </View>
    )
  }

  return (
    <ContextMenu
      actions={[
        editGoal && {
          id: 'edit_goal',
          title: editGoal.title,
          systemImage: 'target',
          onPress: editGoal.onPress,
        },
      ]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hoverRadius={theme.numbers.borderRadiusLg}
      style={{ flex: 1 }}
    >
      {card}
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
