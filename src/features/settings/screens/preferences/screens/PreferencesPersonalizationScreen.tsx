import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import PersonalizationPreferencesSection from '@/features/settings/components/preferences-sections/PersonalizationPreferencesSection'

const PreferencesPersonalizationScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
      >
        <PersonalizationPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesPersonalizationScreen
