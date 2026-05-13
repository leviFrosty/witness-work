import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import NavigationPreferencesSection from '@/features/settings/components/preferences-sections/NavigationPreferencesSection'

const PreferencesNavigationScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <NavigationPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesNavigationScreen
