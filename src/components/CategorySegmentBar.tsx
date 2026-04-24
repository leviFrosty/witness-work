import { View } from 'react-native'
import Text from './MyText'
import useTheme from '../contexts/theme'
import { useFormattedMinutes } from '../lib/minutes'
import CreditBadge from './CreditBadge'

export type CategorySegment = {
  title: string
  minutes: number
  color: string
  credit?: boolean
}

type CategorySegmentBarProps = {
  segments: CategorySegment[]
  /**
   * When true, render dots + titles in a single wrapping row with no minute
   * totals. Used as the collapsed summary on the Month screen — full detail
   * lives in a sheet.
   */
  compact?: boolean
}

const CategorySegmentBar = ({ segments, compact }: CategorySegmentBarProps) => {
  const theme = useTheme()
  const visible = segments.filter((s) => s.minutes > 0)
  const total = visible.reduce((sum, s) => sum + s.minutes, 0)

  if (total === 0) return null

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          height: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: theme.colors.background,
        }}
      >
        {visible.map((segment, i) => (
          <View
            key={`${segment.title}-${i}`}
            style={{
              flex: segment.minutes,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </View>
      {compact ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            rowGap: 6,
          }}
        >
          {visible.map((segment, i) => (
            <View
              key={`${segment.title}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: segment.color,
                }}
              />
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {segment.title}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          {visible.map((segment, i) => (
            <LegendRow key={`${segment.title}-${i}`} segment={segment} />
          ))}
        </View>
      )}
    </View>
  )
}

const LegendRow = ({ segment }: { segment: CategorySegment }) => {
  const theme = useTheme()
  const minutesWithFormat = useFormattedMinutes(segment.minutes)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: segment.color,
          }}
        />
        <Text style={{ color: theme.colors.text }}>{segment.title}</Text>
        {segment.credit && <CreditBadge />}
      </View>
      <Text style={{ color: theme.colors.textAlt }}>
        {minutesWithFormat.formatted}
      </Text>
    </View>
  )
}

export default CategorySegmentBar
