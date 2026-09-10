import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import AppearancePreferencesSection from '@/features/settings/components/preferences-sections/AppearancePreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPublisherScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
        >
          <AppearancePreferencesSection />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPublisherScreen
