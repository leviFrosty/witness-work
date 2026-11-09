import { View } from 'react-native'
import ContributionGraph from '@/components/ContributionGraph'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { habitDays } from '@/lib/routine/habits'
import {
  isWeeklyHabit,
  type RoutineEntry,
  type RoutineHabit,
} from '@/types/routine'
import EarlierDays from '@/features/routine/components/EarlierDays'

export const monthCount = (days: readonly string[], today: string): number =>
  days.filter((day) => day.slice(0, 7) === today.slice(0, 7) && day <= today)
    .length

export const monthCountLabel = (
  habit: RoutineHabit,
  entries: readonly RoutineEntry[],
  today: string
): string =>
  i18n.t(
    isWeeklyHabit(habit)
      ? 'routine.screen.weeksThisMonth'
      : 'routine.screen.daysThisMonth',
    { count: monthCount(habitDays(entries, habit), today) }
  )

export default function RoutineHabitHistory({
  habit,
  label,
  entries,
  today,
  onToggle,
}: {
  habit: RoutineHabit
  label: string
  entries: readonly RoutineEntry[]
  today: string
  onToggle: (day: string, done: boolean) => void
}) {
  const theme = useTheme()
  const daily = new Map(habitDays(entries, habit).map((day) => [day, 1]))
  return (
    <Card style={{ gap: 14 }} testID={`routine-history-${habit}`}>
      <View style={{ gap: 2 }}>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('routine.screen.history')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {monthCountLabel(habit, entries, today)}
        </Text>
      </View>
      <ContributionGraph
        daily={daily}
        formatValue={() => i18n.t('routine.screen.done')}
        describe={(summary, weeks) =>
          i18n.t('routine.screen.graphA11y', {
            habit: label,
            count: summary.daysWithService,
            weeks,
          })
        }
      />
      <EarlierDays
        habit={habit}
        label={label}
        entries={entries}
        today={today}
        onToggle={onToggle}
      />
    </Card>
  )
}
