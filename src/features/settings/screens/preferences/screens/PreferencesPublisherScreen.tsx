import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import PublisherPreferencesSection from '@/features/settings/components/preferences-sections/PublisherPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPublisherScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView>
          <ContentColumn style={{ paddingTop: 24, paddingBottom: 120 }}>
            <PublisherPreferencesSection />
          </ContentColumn>
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPublisherScreen
