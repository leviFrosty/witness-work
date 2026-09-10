import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import PreferencesSection from '@/features/settings/components/sections/Preferences'
import AppSection from '@/features/settings/components/sections/App'
import ContactSection from '@/features/settings/components/sections/Contact'
import MiscSection from '@/features/settings/components/sections/Misc'
import SupportSection from '@/features/settings/components/sections/Support'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import {
  drawerLayout,
  InputLayoutProvider,
} from '@/components/ui/inputs/InputLayout'

const SettingsScreen = (props: DrawerContentComponentProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const handleNavigate = (destination: keyof RootStackParamList) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation.navigate(destination as any)
  }

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
          <Text
            accessibilityRole='header'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('2xl'),
              paddingHorizontal: 16,
              marginBottom: 16,
            }}
          >
            {i18n.t('settings')}
          </Text>
          <View style={{ gap: drawerLayout.sectionGap }}>
            <PreferencesSection handleNavigate={handleNavigate} />
            <AppSection handleNavigate={handleNavigate} />
            <SupportSection />
            <ContactSection />
            <MiscSection handleNavigate={handleNavigate} />
          </View>
        </DrawerContentScrollView>
      </View>
    </InputLayoutProvider>
  )
}

export default SettingsScreen
