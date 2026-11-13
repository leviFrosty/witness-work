import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import { isRtlLayout } from '@/lib/direction'
import i18n from '@/lib/locales'
import useChartScrub from '@/features/territories/hooks/useChartScrub'
import {
  type InsightBucket,
  type InsightSlot,
  liftIntensity,
  liftScale,
  slotLift,
} from '@/features/territories/lib/insights'
import {
  dayShort,
  hourTicks,
  percentOf,
} from '@/features/territories/lib/insightsText'

const GAP = 3
const LABEL_WIDTH = 34
const LABEL_GAP = 6
const MAX_CELL = 40
const TICK_WIDTH = 52
const LEGEND = [-1, -0.5, 0, 0.5, 1]
const SWATCH = 12

const sameSlot = (a: InsightSlot | null, b: InsightSlot) =>
  a !== null && a.day === b.day && a.hour === b.hour

export default function InsightsMatrix({
  grid,
  average,
  days,
  hours,
  picked,
  onPick,
  label,
  testID,
}: {
  grid: InsightBucket[][]
  average: number
  days: number[]
  hours: [number, number]
  picked: InsightSlot | null
  onPick: (slot: InsightSlot | null) => void
  label: string
  testID?: string
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const columns = Array.from(
    { length: hours[1] - hours[0] + 1 },
    (_, index) => hours[0] + index
  )
  const gridWidth = Math.max(0, width - LABEL_WIDTH - LABEL_GAP)
  const cell = Math.min(
    MAX_CELL,
    columns.length > 0
      ? (gridWidth - GAP * (columns.length - 1)) / columns.length
      : 0
  )
  const stride = cell + GAP
  const ticks = hourTicks(hours[0], hours[1])
  const used = columns.length * stride - GAP

  const locate = (x: number, y: number) => {
    if (stride <= 0) return null
    const fromStart = isRtlLayout() ? used - x : x
    const column = Math.floor((fromStart + GAP / 2) / stride)
    const row = Math.floor((y + GAP / 2) / stride)
    if (column < 0 || column >= columns.length) return null
    if (row < 0 || row >= days.length) return null
    return row * columns.length + column
  }
  const gesture = useChartScrub(locate, (index) =>
    onPick(
      index === null
        ? null
        : {
            day: days[Math.floor(index / columns.length)] ?? 0,
            hour: columns[index % columns.length] ?? 0,
          }
    )
  )

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width)
    if (next !== width) setWidth(next)
  }

  const scale = liftScale(grid, average)
  const tint = (lift: number) =>
    withAlpha(
      lift < 0 ? theme.colors.orange : theme.colors.accent,
      0x10 + liftIntensity(lift, scale) * 0xef
    )

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={label}
      testID={testID}
      onLayout={onLayout}
      style={{ gap: 8 }}
    >
      {width > 0 && (
        <>
          <View style={{ flexDirection: 'row', gap: LABEL_GAP }}>
            <View style={{ width: LABEL_WIDTH, gap: GAP }}>
              {days.map((day) => (
                <View
                  key={day}
                  style={{ height: cell, justifyContent: 'center' }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: theme.fontSize('xs'),
                      color:
                        picked?.day === day
                          ? theme.colors.text
                          : theme.colors.textAlt,
                    }}
                  >
                    {dayShort(day)}
                  </Text>
                </View>
              ))}
            </View>
            <GestureDetector gesture={gesture}>
              <View style={{ gap: GAP }}>
                {days.map((day) => (
                  <View key={day} style={{ flexDirection: 'row', gap: GAP }}>
                    {columns.map((hour) => {
                      const lift = slotLift(grid[day]?.[hour], average)
                      const on = sameSlot(picked, { day, hour })
                      return (
                        <View
                          key={hour}
                          style={{
                            width: cell,
                            height: cell,
                            borderRadius: Math.min(6, cell / 4),
                            backgroundColor:
                              lift === undefined
                                ? theme.colors.border
                                : tint(lift),
                            borderWidth: on ? 2 : 0,
                            borderColor: theme.colors.text,
                          }}
                        />
                      )
                    })}
                  </View>
                ))}
              </View>
            </GestureDetector>
          </View>
          <View style={{ height: 16, marginStart: LABEL_WIDTH + LABEL_GAP }}>
            {columns.map((hour, index) =>
              ticks.has(hour) ? (
                <Text
                  key={hour}
                  numberOfLines={1}
                  style={{
                    position: 'absolute',
                    start: Math.max(
                      0,
                      Math.min(
                        used - TICK_WIDTH,
                        index * stride + cell / 2 - TICK_WIDTH / 2
                      )
                    ),
                    width: TICK_WIDTH,
                    textAlign: 'center',
                    fontSize: theme.fontSize('xs'),
                    color:
                      picked?.hour === hour
                        ? theme.colors.text
                        : theme.colors.textAlt,
                  }}
                >
                  {ticks.get(hour)}
                </Text>
              ) : null
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              marginStart: LABEL_WIDTH + LABEL_GAP,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                marginEnd: 2,
              }}
            >
              {i18n.t('territories.insights.below')}
            </Text>
            {LEGEND.map((strength) => (
              <View
                key={strength}
                style={{
                  width: SWATCH,
                  height: SWATCH,
                  borderRadius: 3,
                  backgroundColor: tint(
                    strength * (strength < 0 ? scale.below : scale.above)
                  ),
                }}
              />
            ))}
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                marginStart: 2,
              }}
            >
              {i18n.t('territories.insights.above')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              marginStart: LABEL_WIDTH + LABEL_GAP,
            }}
          >
            {i18n.t('territories.insights.average', {
              percent: percentOf(average),
            })}
          </Text>
        </>
      )}
    </View>
  )
}
