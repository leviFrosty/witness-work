import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import BackupsPreferencesSection from '@/features/settings/components/preferences-sections/BackupsPreferencesSection'

const PreferencesBackupsScreen = () => {
  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <BackupsPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesBackupsScreen
