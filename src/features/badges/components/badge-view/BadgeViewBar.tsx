import { View } from 'react-native'
import useTheme from '@/contexts/theme'

const HEIGHT = 4

export default function BadgeViewBar({
  fraction,
  width,
}: {
  fraction: number
  width: number
}) {
  const theme = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        width,
        height: HEIGHT,
        borderRadius: HEIGHT / 2,
        overflow: 'hidden',
        backgroundColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`,
          height: HEIGHT,
          borderRadius: HEIGHT / 2,
          backgroundColor: theme.colors.accent,
        }}
      />
    </View>
  )
}
