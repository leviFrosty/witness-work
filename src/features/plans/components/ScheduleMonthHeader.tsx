import moment from 'moment'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { ScheduleMonthRow } from '@/features/plans/lib/scheduleRows'
import { formatDisplay } from '@/lib/dates'

export const MONTH_HEADER_HEIGHT = 48

const NAME_FONT_SCALE_CAP = 1.35

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
        {}
        <View style={{ width: start, flexShrink: 1 }} />
        <Text
          accessibilityRole='header'
          numberOfLines={1}
          maxFontSizeMultiplier={NAME_FONT_SCALE_CAP}
          style={{
            flexShrink: 0,

            paddingLeft: 8,
            paddingRight: 6,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('2xl'),
            color: theme.colors.text,
          }}
        >
          {}
          {formatDisplay(date, row.month.month === 0 ? 'MMM YYYY' : 'MMM')}
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
