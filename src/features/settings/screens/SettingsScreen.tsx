import { View } from 'react-native'
import { useEffect } from 'react'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import SettingsContents from '@/features/settings/components/SettingsContents'
import { InputLayoutProvider } from '@/components/ui/inputs/InputLayout'

const SettingsScreen = (props: DrawerContentComponentProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasSidebar } = useAdaptiveLayout()
  useEffect(() => {
    // Resizing back to compact must not resurrect a previously open drawer.
    if (hasSidebar) props.navigation.closeDrawer()
  }, [hasSidebar, props.navigation])

  if (hasSidebar) return null

  return (
    <InputLayoutProvider value='drawer'>
      <View
        style={{
          backgroundColor: theme.colors.background,
          flex: 1,
          borderRightWidth: 1,
          borderRightColor: theme.colors.border,
          justifyContent: 'space-between',
        }}
      >
        <DrawerContentScrollView
          {...props}
          contentContainerStyle={{
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
            paddingStart: 12,
            paddingEnd: 12,
          }}
        >
          <SettingsContents />
        </DrawerContentScrollView>
      </View>
    </InputLayoutProvider>
  )
}

export default SettingsScreen
