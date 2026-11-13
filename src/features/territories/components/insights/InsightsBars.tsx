import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import { isRtlLayout } from '@/lib/direction'
import useChartScrub, {
  type ScrubPick,
} from '@/features/territories/hooks/useChartScrub'
import {
  type InsightBucket,
  MIN_BUCKET_VISITS,
} from '@/features/territories/lib/insights'

export type InsightBar = {
  key: string
  bucket: InsightBucket
  tick?: string
  best?: boolean
}

const GAP = 4
const TICK_WIDTH = 52
const STUB = 3

export default function InsightsBars({
  bars,
  picked,
  onPick,
  height = 120,
  label,
  testID,
}: {
  bars: InsightBar[]
  picked: number | null
  onPick: ScrubPick
  height?: number
  label: string
  testID?: string
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const count = bars.length
  const slot = count > 0 ? (width - GAP * (count - 1)) / count : 0
  const stride = slot + GAP

  const locate = (x: number) => {
    if (stride <= 0) return null
    const index = Math.floor((x + GAP / 2) / stride)
    if (index < 0 || index >= count) return null
    return isRtlLayout() ? count - 1 - index : index
  }
  const gesture = useChartScrub(locate, onPick)

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width)
    if (next !== width) setWidth(next)
  }

  const fill = (bar: InsightBar, index: number) => {
    if (bar.bucket.total === 0) return theme.colors.border
    const trusted = bar.bucket.total >= MIN_BUCKET_VISITS
    const dimmed = picked !== null && picked !== index
    const alpha = dimmed ? 0x2a : !trusted ? 0x33 : bar.best ? 0xff : 0x66
    return withAlpha(theme.colors.accent, alpha)
  }

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={label}
      testID={testID}
      style={{ gap: 6 }}
    >
      <GestureDetector gesture={gesture}>
        <View
          onLayout={onLayout}
          style={{
            height,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: GAP,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {bars.map((bar, index) => (
            <View
              key={bar.key}
              style={{
                flex: 1,
                height:
                  bar.bucket.total === 0
                    ? STUB
                    : Math.max(STUB, bar.bucket.rate * height),
                borderTopStartRadius: 4,
                borderTopEndRadius: 4,
                backgroundColor: fill(bar, index),
              }}
            />
          ))}
        </View>
      </GestureDetector>
      <View style={{ height: 16 }}>
        {width > 0 &&
          bars.map((bar, index) =>
            bar.tick ? (
              <Text
                key={bar.key}
                numberOfLines={1}
                style={{
                  position: 'absolute',
                  start: Math.max(
                    0,
                    Math.min(
                      width - TICK_WIDTH,
                      index * stride + slot / 2 - TICK_WIDTH / 2
                    )
                  ),
                  width: TICK_WIDTH,
                  textAlign: 'center',
                  fontSize: theme.fontSize('xs'),
                  color:
                    picked === index ? theme.colors.text : theme.colors.textAlt,
                  fontFamily:
                    picked === index || bar.best
                      ? theme.fonts.semiBold
                      : theme.fonts.regular,
                }}
              >
                {bar.tick}
              </Text>
            ) : null
          )}
      </View>
    </View>
  )
}
