import { View } from 'react-native'
import StripedFill from '@/components/ui/StripedFill'
import useTheme from '@/contexts/theme'

export default function ScheduleSwatch({
  striped = false,
}: {
  striped?: boolean
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 12,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        backgroundColor: striped
          ? theme.colors.background
          : theme.colors.accent,
      }}
    >
      {striped && (
        <StripedFill color={theme.colors.accent} size={4} strokeWidth={1.5} />
      )}
    </View>
  )
}
