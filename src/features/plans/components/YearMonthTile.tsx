import moment from 'moment'
import { type LayoutRectangle, View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { Theme } from '@/types/theme'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'
import type { DayStatus } from '@/features/plans/lib/dayStatus'
import { dayKeyOf } from '@/features/plans/lib/scheduleRows'

const CELL_GAP = 2
/** Space between the tile's name, day grid, bar, and amount. */
const SECTION_GAP = 6

type Props = CalendarMonth & {
  width: number
  startOfWeek: number
  statuses: Map<string, DayStatus>
  todayKey: string
  /** The month the Month view is on, ringed so the zoom has a home. */
  focused: boolean
  loggedMinutes: number
  plannedMinutes: number
  goalMinutes: number
  // These take the month rather than closing over it, so the Year view can
  // pass the same functions to every tile and a tile re-renders only when
  // its own month changes.
  onPress: (month: CalendarMonth) => void
  onEditGoal?: (month: CalendarMonth) => void
  /**
   * The day grid's frame within the tile (border and padding included): where
   * the Month view lands.
   */
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

/**
 * One month of the Service Year at a glance: each day as a square in its
 * calendar status color, and logged plus planned time against the month's goal.
 * Tapping zooms into the month.
 */
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
          value: formatMinutesCompact(total) || '0',
          goal: formatMinutesCompact(goalMinutes),
        })
      : formatMinutesCompact(total) || '0'

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
      accessibilityLabel={`${first.format('MMMM YYYY')}. ${amount}`}
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
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('sm'),
              color: focused ? theme.colors.accent : theme.colors.text,
            }}
          >
            {first.format(width < 130 ? 'MMM' : 'MMMM')}
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
        {/* A direct child of the tile's frame, so its layout is measured
        from the tile's edge rather than from a wrapper's. */}
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
        {/* Every tile keeps six week rows so the grid lines up; only the
        month's own weeks are the zoom's landing frame. */}
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
