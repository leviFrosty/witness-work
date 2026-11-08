import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import WidgetsPreferencesSection from '@/features/settings/preferences/home-and-layout/WidgetsPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesWidgetsScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <WidgetsPreferencesSection />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesWidgetsScreen
