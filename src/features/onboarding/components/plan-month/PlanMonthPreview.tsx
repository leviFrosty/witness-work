import { View } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import moment from 'moment'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import GoalBar from '@/components/GoalBar'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { usePreferences } from '@/stores/preferences'
import type { PlanMonth } from '@/features/onboarding/hooks/usePlanMonth'
import {
  monthWeeks,
  orderedWeekdays,
} from '@/features/onboarding/lib/planMonth'

const WEEKDAY_KEYS: readonly TranslationKey[] = [
  'availability.weekday.sun',
  'availability.weekday.mon',
  'availability.weekday.tue',
  'availability.weekday.wed',
  'availability.weekday.thu',
  'availability.weekday.fri',
  'availability.weekday.sat',
]

const CELL_HEIGHT = 34

type Props = {
  target: CalendarMonth
  plan: PlanMonth
  serviceDays: readonly number[]
  startOfWeek: number
}

/**
 * The month the Assistant just planned: projected total against the goal, then
 * a calendar with each proposed session on its day.
 */
const PlanMonthPreview = ({
  target,
  plan,
  serviceDays,
  startOfWeek,
}: Props) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const format = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted
  const monthName = moment({ ...target, day: 1 }).format('MMMM')
  const weeks = monthWeeks(target, startOfWeek, new Date())
  const hasPlan = plan.minutesByDay.size > 0

  const status = (() => {
    if (plan.alreadyOnTrack) {
      return i18n.t('planMonth.status.onTrack', { month: monthName })
    }
    if (serviceDays.length === 0) return i18n.t('planMonth.status.pickDays')
    if (!plan.recommendation) {
      return i18n.t('planMonth.status.noDaysLeft', { month: monthName })
    }
    return i18n.t(
      plan.reachesGoal
        ? 'planMonth.status.reachesGoal'
        : 'planMonth.status.shortOfGoal',
      {
        projected: format(plan.projectedMinutes),
        goal: format(plan.goalMinutes),
      }
    )
  })()

  return (
    <Card style={{ gap: 14 }}>
      <GoalBar
        loggedMinutes={plan.loggedMinutes}
        plannedMinutes={plan.plannedMinutes}
        goalMinutes={plan.goalMinutes}
        size='md'
      />

      {/* Read as one summary; with nothing planned the status says it all. */}
      <View
        style={{ gap: 4 }}
        accessible={hasPlan}
        accessibilityElementsHidden={!hasPlan}
        importantForAccessibility={hasPlan ? 'yes' : 'no-hide-descendants'}
        accessibilityLabel={
          hasPlan
            ? i18n.t('planMonth.calendarA11y', {
                month: monthName,
                days: [...plan.minutesByDay.keys()]
                  .sort((a, b) => a - b)
                  .join(', '),
              })
            : undefined
        }
      >
        <View style={{ flexDirection: 'row' }}>
          {orderedWeekdays(startOfWeek).map((weekday) => (
            <Text
              key={weekday}
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                color: serviceDays.includes(weekday)
                  ? theme.colors.accent
                  : theme.colors.textAlt,
              }}
            >
              {i18n.t(WEEKDAY_KEYS[weekday])}
            </Text>
          ))}
        </View>
        {weeks.map((week, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((cell, col) => {
              if (!cell) {
                return <View key={col} style={{ flex: 1 }} />
              }
              const minutes = plan.minutesByDay.get(cell.day)
              const isServiceDay =
                !cell.isPast && serviceDays.includes(cell.weekday)
              return (
                <View
                  key={col}
                  style={{
                    flex: 1,
                    height: CELL_HEIGHT,
                    borderRadius: theme.numbers.borderRadiusSm,
                    backgroundColor: isServiceDay
                      ? theme.colors.accentTranslucent
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: cell.isPast ? 0.35 : 1,
                  }}
                >
                  {minutes ? (
                    <Animated.View
                      // Re-keyed so a changed session pops in again.
                      key={`${cell.day}-${minutes}`}
                      entering={ZoomIn.duration(220)}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: theme.numbers.borderRadiusSm,
                        backgroundColor: theme.colors.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{
                          fontSize: theme.fontSize('xs'),
                          fontFamily: theme.fonts.bold,
                          color: theme.colors.textInverse,
                        }}
                      >
                        {formatMinutesCompact(minutes)}
                      </Text>
                    </Animated.View>
                  ) : (
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {cell.day}
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
        ))}
      </View>

      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      >
        {segmentBoldMarkup(status).map((segment, i) => (
          <Text
            key={i}
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: segment.bold ? theme.fonts.bold : undefined,
            }}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
    </Card>
  )
}

export default PlanMonthPreview
