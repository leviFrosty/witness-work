import { ScrollView, View } from 'react-native'
import { useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import SettingsContents from '@/features/settings/components/SettingsContents'
import { InputLayoutProvider } from '@/components/ui/inputs/InputLayout'

/** Settings on compact layouts, pushed from the account menu. */
const SettingsScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const { hasSidebar } = useAdaptiveLayout()

  // Wide layouts show Settings in the sidebar instead.
  useEffect(() => {
    if (hasSidebar && navigation.canGoBack()) navigation.goBack()
  }, [hasSidebar, navigation])

  return (
    <InputLayoutProvider value='drawer'>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 12,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          }}
        >
          <SettingsContents />
        </ScrollView>
      </View>
    </InputLayoutProvider>
  )
}

export default SettingsScreen
