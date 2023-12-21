import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { WhatsNewContent } from '../components/WhatsNewSheet'
import Wrapper from '../components/Wrapper'
import { usePreferences } from '../stores/preferences'

const WhatsNewScreen = () => {
  const { lastAppVersion } = usePreferences()

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 30 }}
      >
        <WhatsNewContent lastVersion={lastAppVersion || '1.0.0'} />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default WhatsNewScreen
