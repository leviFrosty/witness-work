import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useTabBarInsets from '@/hooks/useTabBarInsets'
import SettingsContents from '@/features/settings/components/SettingsContents'

export default function SettingsOverviewScreen() {
  const theme = useTheme()
  // Below iPad's top tab bar too.
  const insets = useTabBarInsets()

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
      }}
    >
      <SettingsContents />
    </View>
  )
}
