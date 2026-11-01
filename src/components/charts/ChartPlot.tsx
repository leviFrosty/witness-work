import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { isRtlLayout } from '@/lib/direction'

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
