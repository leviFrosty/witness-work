import moment from 'moment'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { ScheduleMonthRow } from '@/features/plans/lib/scheduleRows'

export const MONTH_HEADER_HEIGHT = 48

/**
 * Opens a month in the Schedule's week grid, as Apple's Calendar does: a gap
 * after the last month, the month's short name over the column of its 1st (in
 * every month alike; the days carry the focus), and a rule from there to the
 * edge that heads the month's first week. The name slides left rather than run
 * off the edge when the 1st falls late in the week.
 */
export default function ScheduleMonthHeader({
  row,
}: {
  row: ScheduleMonthRow
}) {
  const theme = useTheme()
  const start = `${(row.column / 7) * 100}%` as const
  const date = moment({ year: row.month.year, month: row.month.month, day: 1 })

  return (
    <View style={{ height: MONTH_HEADER_HEIGHT, justifyContent: 'flex-end' }}>
      <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
        {/* Gives way first, so a long name keeps to the row. */}
        <View style={{ width: start, flexShrink: 1 }} />
        <Text
          accessibilityRole='header'
          numberOfLines={1}
          style={{
            flexShrink: 0,
            // Lines up with the day numbers under it.
            paddingLeft: 8,
            paddingRight: 6,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('2xl'),
            color: theme.colors.text,
          }}
        >
          {/* January carries its year, the one landmark when a year turns. */}
          {date.format(row.month.month === 0 ? 'MMM YYYY' : 'MMM')}
        </Text>
      </View>
      <View
        style={{
          position: 'absolute',
          left: start,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: theme.colors.border,
        }}
      />
    </View>
  )
}
