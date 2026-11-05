import moment from 'moment'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import { addDays } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import { earliestBackfillDay, entriesById } from '@/lib/routine/habits'
import { routineEntryId } from '@/lib/routine/habits'
import type { RoutineEntry, RoutineHabit } from '@/types/routine'

export const earlierDays = (today: string): string[] => {
  const days: string[] = []
  for (
    let day = earliestBackfillDay(today);
    day <= today;
    day = addDays(day, 1)
  )
    days.push(day)
  return days
}

export default function EarlierDays({
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
  const byId = entriesById(entries)
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('routine.screen.earlierDays')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {earlierDays(today).map((day) => {
          const done = byId.get(routineEntryId(habit, day))?.on === day
          const date = moment(day, 'YYYY-MM-DD')
          return (
            <Button
              key={day}
              onPress={() => onToggle(day, done)}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: done }}
              accessibilityLabel={i18n.t('routine.screen.earlierDayA11y', {
                habit: label,
                date: formatDate(date),
              })}
              testID={`routine-earlier-${habit}-${day}`}
              style={{
                minWidth: MIN_TOUCH_TARGET,
                minHeight: MIN_TOUCH_TARGET + 6,
                paddingHorizontal: 6,
                borderRadius: theme.numbers.borderRadiusMd,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: done ? theme.colors.accent : theme.colors.border,
                backgroundColor: done
                  ? theme.colors.accentTranslucent
                  : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {date.format('dd')}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                  color: done ? theme.colors.accent : theme.colors.text,
                }}
              >
                {date.format('D')}
              </Text>
            </Button>
          )
        })}
      </View>
    </View>
  )
}
