import { View } from 'react-native'
import Text from '../../components/MyText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../../contexts/theme'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '../../stacks/RootStack'
import i18n from '../../lib/locales'
import Constants from 'expo-constants'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import PreferencesSection from './sections/Preferences'
import AppSection from './sections/App'
import ContactSection from './sections/Contact'
import MiscSection from './sections/Misc'
import SupportSection from './sections/Support'
import { usePreferences } from '../../stores/preferences'
import { useState } from 'react'
import Badge from '../../components/Badge'

export type SettingsSectionProps = {
  handleNavigate: (destination: keyof RootStackParamList) => void
}

const SettingsScreen = (props: DrawerContentComponentProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { developerTools, set } = usePreferences()
  const [count, setCount] = useState(0)

  const navigateAndCloseDrawer = (destination: keyof RootStackParamList) => {
    props.navigation.closeDrawer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation.navigate(destination as any)
  }

  const incrementHiddenCounter = () => {
    setCount(count + 1)
    if (count === 4) {
      set({ developerTools: !developerTools })
      setCount(0)
    }
  }

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <DrawerContentScrollView
        contentContainerStyle={{
          paddingTop: 60,
          paddingBottom: 60,
          paddingStart: 0,
        }}
        {...props}
      >
        <View style={{ gap: 25 }}>
          <PreferencesSection handleNavigate={navigateAndCloseDrawer} />
          <AppSection handleNavigate={navigateAndCloseDrawer} />
          <SupportSection />
          <ContactSection />
          <MiscSection handleNavigate={navigateAndCloseDrawer} />
        </View>
        <View style={{ paddingTop: 15, paddingBottom: 45, gap: 5 }}>
          <Text
            style={{
              textAlign: 'center',
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
              fontSize: 14,
            }}
            onPress={incrementHiddenCounter}
          >
            {Constants.expoConfig?.version
              ? `v${Constants.expoConfig?.version}`
              : i18n.t('versionUnknown')}
          </Text>
          {developerTools && (
            <Badge>
              <Text>{i18n.t('devToolsEnabled')}</Text>
            </Badge>
          )}
        </View>
      </DrawerContentScrollView>
    </View>
  )
}

export default SettingsScreen
