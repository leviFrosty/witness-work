import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'

const web = Platform.OS === 'web'

const FADE = web
  ? ({
      transitionProperty: 'opacity',
      transitionDuration: '120ms',
      transitionTimingFunction: 'ease-out',
    } as ViewStyle)
  : undefined

export default function HoverTint({
  visible,
  borderRadius,
  borderCurve,
  strong = false,
  color,
  opacity,
}: {
  visible: boolean
  borderRadius?: ViewStyle['borderRadius']
  borderCurve?: ViewStyle['borderCurve']

  strong?: boolean

  color?: string
  opacity?: number
}) {
  const theme = useTheme()
  if (!visible && !web) return null
  return (
    <View
      pointerEvents='none'
      testID={visible ? 'hover-tint' : undefined}
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius,
          borderCurve,
          backgroundColor: color ?? theme.colors.text,
          opacity: visible ? (opacity ?? (strong ? 0.12 : 0.06)) : 0,
        },
        FADE,
      ]}
    />
  )
}
