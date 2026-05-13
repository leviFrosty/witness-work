import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import HomeScreenPreferencesSection from '@/features/settings/components/preferences-sections/HomeScreenPreferencesSection'

const PreferencesHomeScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <HomeScreenPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesHomeScreen
