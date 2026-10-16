import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { isRtlLayout } from '@/lib/direction'

/**
 * Holds a Skia/Victory plot whose x axis is time. React Native mirrors views
 * but not what a canvas draws, so in RTL this flips the plot to run right to
 * left, matching `ChartXLabels` and the RN overlays around it. Touches inside
 * arrive in the flipped coordinates, so press and hover scrubbing keep matching
 * the point under the finger.
 *
 * Only for drawing without text: anything written inside would read backwards.
 * Pass the chart's padding as if left to right; it mirrors with the plot.
 */
export default function ChartPlot({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  return (
    <View
      style={[
        style,
        isRtlLayout() ? { transform: [{ scaleX: -1 }] } : undefined,
      ]}
    >
      {children}
    </View>
  )
}
