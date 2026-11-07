import { StyleSheet, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'

export default function HoverTint({
  visible,
  borderRadius,
  borderCurve,
  strong = false,
}: {
  visible: boolean
  borderRadius?: ViewStyle['borderRadius']
  borderCurve?: ViewStyle['borderCurve']

  strong?: boolean
}) {
  const theme = useTheme()
  if (!visible) return null
  return (
    <View
      pointerEvents='none'
      testID='hover-tint'
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius,
          borderCurve,
          backgroundColor: theme.colors.text,
          opacity: strong ? 0.12 : 0.06,
        },
      ]}
    />
  )
}
