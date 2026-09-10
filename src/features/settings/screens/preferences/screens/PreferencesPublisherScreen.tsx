import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import PublisherPreferencesSection from '@/features/settings/components/preferences-sections/PublisherPreferencesSection'
import SettingsInputLayout, {
  inputLayout,
} from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPublisherScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{
            paddingTop: 24,
            paddingBottom: 120,
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
          }}
        >
          <PublisherPreferencesSection />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPublisherScreen
