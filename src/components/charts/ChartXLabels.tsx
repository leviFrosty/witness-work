import { useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Text from '@/components/ui/MyText'
import { placeAxisLabels } from '@/lib/chartAxisLabels'

export type ChartXLabel = {
  key: string
  label: string
  /**
   * Where the label centers along the plot, 0 (left edge) to 1 (right edge); RN
   * mirrors it in RTL, as `ChartPlot` mirrors the plot.
   */
  position: number
}

type Props = {
  labels: ChartXLabel[]
  /** Space before the plot starts, matching the chart's left padding. */
  insetLeft?: number
  /** Space after the plot ends, matching the chart's right padding. */
  insetRight?: number
  /** Room each label gets, centered on its position. */
  labelWidth?: number
}

/**
 * X-axis labels for a Skia chart, drawn as regular text below the canvas so
 * every locale's script renders with the app's fonts. Decorative: the chart's
 * own accessibility label carries the data.
 */
const ChartXLabels = (props: Props) =>
  useAccessibilityTextSize() ? (
    <MeasuredChartXLabels {...props} />
  ) : (
    <FixedChartXLabels {...props} />
  )

/** Each label in its fixed-width slot, on one line. */
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

/** Room between two neighboring labels. */
const LABEL_GAP = 6

/**
 * At accessibility text sizes the labels are wider than their slots, so each is
 * measured at full size and only every second, third… label shows, as many as
 * fit without touching; the row grows as tall as the text.
 */
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
      {/* Measures each label's natural size out of sight. */}
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
