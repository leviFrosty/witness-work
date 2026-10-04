import { View } from 'react-native'
import useTheme from '@/contexts/theme'

/** One segment per Follow-up, filled once it's answered. */
export default function FollowUpCardProgress({
  done,
  total,
}: {
  done: number
  total: number
}) {
  const theme = useTheme()

  return (
    <View
      style={{ flexDirection: 'row', gap: 4 }}
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor:
              i < done ? theme.colors.accent : theme.colors.border,
          }}
        />
      ))}
    </View>
  )
}
