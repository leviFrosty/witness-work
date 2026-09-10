import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import PersonalizationPreferencesSection from '@/features/settings/components/preferences-sections/PersonalizationPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPersonalizationScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
        >
          <PersonalizationPreferencesSection />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPersonalizationScreen
