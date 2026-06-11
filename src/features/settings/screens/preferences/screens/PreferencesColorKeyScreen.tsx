import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import ColorKeyPreferencesSection from '@/features/settings/components/preferences-sections/ColorKeyPreferencesSection'

const PreferencesColorKeyScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
      >
        <ColorKeyPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesColorKeyScreen
