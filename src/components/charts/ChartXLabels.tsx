import { useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Text from '@/components/ui/MyText'
import { placeAxisLabels } from '@/lib/chartAxisLabels'

export type ChartXLabel = {
  key: string
  label: string

  position: number
}

type Props = {
  labels: ChartXLabel[]

  insetLeft?: number

  insetRight?: number

  labelWidth?: number
}

const ChartXLabels = (props: Props) =>
  useAccessibilityTextSize() ? (
    <MeasuredChartXLabels {...props} />
  ) : (
    <FixedChartXLabels {...props} />
  )

const FixedChartXLabels = ({
  labels,
  insetLeft = 0,
  insetRight = 0,
  labelWidth = 48,
}: Props) => {
  const theme = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{ height: 16, marginLeft: insetLeft, marginRight: insetRight }}
    >
      {labels.map(({ key, label, position }) => (
        <Text
          key={key}
          numberOfLines={1}
          style={{
            position: 'absolute',
            left: `${position * 100}%`,
            width: labelWidth,
            marginLeft: -labelWidth / 2,
            textAlign: 'center',
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {label}
        </Text>
      ))}
    </View>
  )
}

const LABEL_GAP = 6

const MeasuredChartXLabels = ({
  labels,
  insetLeft = 0,
  insetRight = 0,
}: Props) => {
  const theme = useTheme()
  const [rowWidth, setRowWidth] = useState(0)
  const [sizes, setSizes] = useState<
    Record<string, { width: number; height: number }>
  >({})
  const style = { fontSize: theme.fontSize('xs'), color: theme.colors.textAlt }
  const measured = labels.every((l) => sizes[l.key] !== undefined)
  const placed =
    measured && rowWidth > 0
      ? placeAxisLabels(
          labels.map((l) => ({ ...l, width: sizes[l.key].width })),
          { rowWidth, insetLeft, insetRight, gap: LABEL_GAP }
        )
      : []
  const height = Math.max(16, ...Object.values(sizes).map((s) => s.height))

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      style={{ height, marginLeft: insetLeft, marginRight: insetRight }}
    >
      {}
      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          opacity: 0,
          flexDirection: 'row',
          alignItems: 'flex-start',
          width: 10000,
        }}
      >
        {labels.map(({ key, label }) => (
          <Text
            key={key}
            numberOfLines={1}
            style={style}
            onLayout={(e) => {
              const { width, height: labelHeight } = e.nativeEvent.layout
              setSizes((current) =>
                current[key]?.width === width &&
                current[key]?.height === labelHeight
                  ? current
                  : { ...current, [key]: { width, height: labelHeight } }
              )
            }}
          >
            {label}
          </Text>
        ))}
      </View>
      {placed.map(({ key, label, left, width }) => (
        <Text
          key={key}
          numberOfLines={1}
          style={[style, { position: 'absolute', left, width: width + 1 }]}
        >
          {label}
        </Text>
      ))}
    </View>
  )
}

export default ChartXLabels
