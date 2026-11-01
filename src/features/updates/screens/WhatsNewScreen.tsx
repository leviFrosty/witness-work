import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { WhatsNewContent } from '@/features/updates/components/WhatsNewSheet'
import Wrapper from '@/components/ui/layout/Wrapper'
import { usePreferences } from '@/stores/preferences'
import { useEffect, useState } from 'react'

const WhatsNewScreen = () => {
  const { lastAppVersion, unreadReleaseNotes, set } = usePreferences()

  const [lastVersion] = useState(
    () => unreadReleaseNotes?.since ?? lastAppVersion ?? '1.0.0'
  )

  useEffect(() => {
    set({ unreadReleaseNotes: null })
  }, [set])

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 30 }}
      >
        <WhatsNewContent lastVersion={lastVersion} showTourCard />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default WhatsNewScreen
