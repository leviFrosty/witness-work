import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import SettingsContents from '@/features/settings/components/SettingsContents'
import SidebarToggle from '@/components/ui/SidebarToggle'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export default function SettingsOverviewScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const foldColumn = useFoldColumn(720)
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={[
          {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingHorizontal: 24,
          },
          foldColumn,
        ]}
      >
        <SidebarToggle mode='show' />
      </View>
      <SettingsContents />
    </View>
  )
}
