import Wrapper from '../../components/layout/Wrapper'
import PublisherPreferencesSection from './sections/PublisherPreferencesSection'
import ConversationsPreferencesSection from './sections/ConversationsPreferencesSection'
import NavigationPreferencesSection from './sections/NavigationPreferencesSection'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import AppPreferencesSection from './sections/AppPreferencesSection'
import HomeScreenPreferencesSection from './sections/HomeScreenPreferencesSection'

const Preferences = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <PublisherPreferencesSection />
        <ConversationsPreferencesSection />
        <NavigationPreferencesSection />
        <HomeScreenPreferencesSection />
        <AppPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default Preferences
