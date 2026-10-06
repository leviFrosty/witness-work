import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PreferencesSection from '@/features/settings/components/sections/Preferences'
import AppSection from '@/features/settings/components/sections/App'
import ContactSection from '@/features/settings/components/sections/Contact'
import AboutSection from '@/features/settings/components/sections/About'
import AdvancedSection from '@/features/settings/components/sections/Advanced'
import SupportSection from '@/features/settings/components/sections/Support'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

type Props = {
  /** Opens destinations somewhere other than the root stack (the split pane). */
  onNavigate?: (destination: keyof RootStackParamList) => void
  selectedDestination?: keyof RootStackParamList
}

/** The same settings destinations in the compact drawer and wide workspace. */
export default function SettingsContents({
  onNavigate,
  selectedDestination,
}: Props) {
  const theme = useTheme()
  const layout = useInputLayout()
  const navigation = useNavigation<RootStackNavigation>()
  const handleNavigate = (destination: keyof RootStackParamList) => {
    if (onNavigate) return onNavigate(destination)
    // These sections supply settings destinations that take no required params.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation.navigate(destination as any)
  }

  const sectionProps = { handleNavigate, selectedDestination }

  return (
    <>
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xl'),
          paddingStart:
            layout === 'drawer'
              ? drawerLayout.horizontalPadding
              : inputLayout.horizontalPadding +
                inputLayout.iconSize +
                inputLayout.labelGap +
                inputLayout.sectionBorderWidth,
          paddingEnd: inputLayout.horizontalPadding,
          marginBottom: 12,
        }}
      >
        {i18n.t('settings')}
      </Text>
      <View style={{ gap: drawerLayout.sectionGap }}>
        <PreferencesSection {...sectionProps} />
        <AppSection {...sectionProps} />
        <SupportSection {...sectionProps} />
        <ContactSection {...sectionProps} />
        <AboutSection {...sectionProps} />
        <AdvancedSection />
      </View>
    </>
  )
}
