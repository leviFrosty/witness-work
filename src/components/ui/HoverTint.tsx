import { StyleSheet, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'

/**
 * Hover feedback for large surfaces (rows, cards): a faint overlay, without the
 * scale that would push into neighbours. Render it last inside the hovered
 * view.
 */
export default function HoverTint({
  visible,
  borderRadius,
  borderCurve,
  strong = false,
}: {
  visible: boolean
  borderRadius?: ViewStyle['borderRadius']
  borderCurve?: ViewStyle['borderCurve']
  /** A firmer tint, for the highlight behind a small control. */
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
