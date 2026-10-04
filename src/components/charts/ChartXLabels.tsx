import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'

export type ChartXLabel = {
  key: string
  label: string
  /** Where the label centers along the plot, 0 (left edge) to 1 (right edge). */
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
const ChartXLabels = ({
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

export default ChartXLabels
