import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import WidgetsPreferencesSection from '@/features/settings/components/preferences-sections/WidgetsPreferencesSection'

const PreferencesWidgetsScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <WidgetsPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesWidgetsScreen
