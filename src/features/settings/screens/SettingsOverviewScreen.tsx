import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import SettingsContents from '@/features/settings/components/SettingsContents'
import SidebarToggle from '@/components/ui/SidebarToggle'

export default function SettingsOverviewScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          paddingHorizontal: 24,
        }}
      >
        <SidebarToggle mode='show' />
      </View>
      <SettingsContents />
    </View>
  )
}
