import { View } from 'react-native'
import { Info as InfoIcon, WifiOff as WifiOffIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function GuestNotice({
  text,
  offline = false,
  testID,
}: {
  text: string
  offline?: boolean
  testID: string
}) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      accessibilityRole='summary'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 20,
        backgroundColor: offline
          ? theme.colors.warnTranslucent
          : theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon
        icon={offline ? WifiOffIcon : InfoIcon}
        size={20}
        color={offline ? theme.colors.text : theme.colors.accent}
      />
      <Text style={{ flex: 1, fontSize: theme.fontSize('sm') }}>{text}</Text>
    </View>
  )
}
