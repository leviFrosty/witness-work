import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import AppearancePreferencesSection from '@/features/settings/components/preferences-sections/AppearancePreferencesSection'

const PreferencesPublisherScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
      >
        <AppearancePreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesPublisherScreen
