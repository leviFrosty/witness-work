import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import AudioAndHapticsPreferencesSection from '@/features/settings/components/preferences-sections/AudioAndHapticsPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesAudioAndHapticsScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <AudioAndHapticsPreferencesSection />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesAudioAndHapticsScreen
