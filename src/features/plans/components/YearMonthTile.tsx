import moment from 'moment'
import { type LayoutRectangle, View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import { formatMinutesCompact, formatMinutesSpoken } from '@/lib/minutes'
import { formatPlainNumber } from '@/lib/numbers'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { Theme } from '@/types/theme'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'
import type { DayStatus } from '@/features/plans/lib/dayStatus'
import { dayKeyOf } from '@/features/plans/lib/scheduleRows'
import { formatDisplay } from '@/lib/dates'

const CELL_GAP = 2

const SECTION_GAP = 6

type Props = CalendarMonth & {
  width: number
  startOfWeek: number
  statuses: Map<string, DayStatus>
  todayKey: string

  focused: boolean
  loggedMinutes: number
  plannedMinutes: number
  goalMinutes: number

  onPress: (month: CalendarMonth) => void
  onEditGoal?: (month: CalendarMonth) => void

  onGridLayout: (month: CalendarMonth, frame: LayoutRectangle) => void
}

export const dayStatusColor = (theme: Theme, status: DayStatus | undefined) => {
  switch (status) {
    case 'met':
    case 'logged':
      return theme.colors.accent
    case 'partial':
      return theme.colors.warn
    case 'missed':
      return theme.colors.error
    case 'planned':
      return theme.colors.accentAlt
    default:
      return theme.colors.background
  }
}

export default function YearMonthTile({
  year,
  month,
  width,
  startOfWeek,
  statuses,
  todayKey,
  focused,
  loggedMinutes,
  plannedMinutes,
  goalMinutes,
  onPress,
  onEditGoal,
  onGridLayout,
}: Props) {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const fit = largeText ? FIT_ONE_LINE : undefined
  const first = moment({ year, month, day: 1 })
  const days = first.daysInMonth()
  const lead = (first.day() - startOfWeek + 7) % 7
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7)
  )
  const total = loggedMinutes + plannedMinutes
  const amount =
    goalMinutes > 0
      ? i18n.t('scheduleCalendar.ofGoal', {
          value: formatMinutesCompact(total) || formatPlainNumber(0),
          goal: formatMinutesCompact(goalMinutes),
        })
      : formatMinutesCompact(total) || formatPlainNumber(0)
  const spokenAmount =
    goalMinutes > 0
      ? i18n.t('durationSpoken.ofGoal', {
          value: formatMinutesSpoken(total),
          goal: formatMinutesSpoken(goalMinutes),
        })
      : formatMinutesSpoken(total)

  return (
    <ContextMenu
      actions={[
        onEditGoal && {
          id: 'edit_goal',
          title: i18n.t('scheduleCalendar.editMonthlyGoal'),
          systemImage: 'target',
          onPress: () => onEditGoal({ year, month }),
        },
      ]}
      onPress={() => onPress({ year, month })}
      accessibilityLabel={`${formatDisplay(first, 'MMMM YYYY')}. ${spokenAmount}`}
      hoverRadius={theme.numbers.borderRadiusMd}
      style={{ width }}
    >
      <View
        style={{
          padding: 8,
          gap: SECTION_GAP,
          borderRadius: theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderColor: focused ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.card,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 4,
          }}
        >
          <Text
            numberOfLines={1}
            {...fit}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('sm'),
              color: focused ? theme.colors.accent : theme.colors.text,
            }}
          >
            {first.format(width < 130 || largeText ? 'MMM' : 'MMMM')}
          </Text>
          {month === 0 ? (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {year}
            </Text>
          ) : null}
        </View>
        {}
        <View
          style={{ gap: CELL_GAP }}
          onLayout={(e) => onGridLayout({ year, month }, e.nativeEvent.layout)}
        >
          {weeks.map((week, w) => (
            <View key={w} style={{ flexDirection: 'row', gap: CELL_GAP }}>
              {week.map((day, column) => {
                const key = day ? dayKeyOf(year, month, day) : undefined
                return (
                  <View
                    key={column}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      borderRadius: 3,
                      backgroundColor: key
                        ? dayStatusColor(theme, statuses.get(key))
                        : 'transparent',
                      borderWidth: key === todayKey ? 1.5 : 0,
                      borderColor: theme.colors.text,
                    }}
                  />
                )
              })}
            </View>
          ))}
        </View>
        {}
        {weeks.length < 6 ? (
          <View style={{ gap: CELL_GAP, marginTop: CELL_GAP - SECTION_GAP }}>
            {Array.from({ length: 6 - weeks.length }, (_, w) => (
              <View key={w} style={{ flexDirection: 'row', gap: CELL_GAP }}>
                {Array.from({ length: 7 }, (_, column) => (
                  <View key={column} style={{ flex: 1, aspectRatio: 1 }} />
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <GoalSplitBar
          goalMinutes={goalMinutes}
          loggedMinutes={loggedMinutes}
          plannedMinutes={plannedMinutes}
          height={4}
        />
        <Text
          numberOfLines={1}
          {...fit}
          style={{
            fontSize: theme.fontSize('xs'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {amount}
        </Text>
      </View>
    </ContextMenu>
  )
}
