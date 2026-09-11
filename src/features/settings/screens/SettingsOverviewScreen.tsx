import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import { InputLayoutProvider } from '@/components/ui/inputs/InputLayout'
import SettingsContents from '@/features/settings/components/SettingsContents'

export default function SettingsOverviewScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasSidebar } = useAdaptiveLayout()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <InputLayoutProvider value='settings'>
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{
            width: '100%',
            paddingTop: insets.top + 24,
            paddingBottom:
              insets.bottom + (hasSidebar ? 24 : TAB_BAR_HEIGHT + 24),
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
            <SettingsContents />
          </View>
        </ScrollView>
      </InputLayoutProvider>
    </View>
  )
}
