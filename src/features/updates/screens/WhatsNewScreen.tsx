import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { WhatsNewContent } from '@/features/updates/components/WhatsNewSheet'
import Wrapper from '@/components/ui/layout/Wrapper'
import { usePreferences } from '@/stores/preferences'
import { useEffect, useState } from 'react'

const WhatsNewScreen = () => {
  const { lastAppVersion, unreadReleaseNotes, set } = usePreferences()
  // Captured at mount so the "New" badges survive clearing the unread state.
  const [lastVersion] = useState(
    () => unreadReleaseNotes?.since ?? lastAppVersion ?? '1.0.0'
  )

  // Opening What's New counts as reading the notes: clears the Home card and
  // the Settings row dot.
  useEffect(() => {
    set({ unreadReleaseNotes: null })
  }, [set])

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 30 }}
      >
        <WhatsNewContent lastVersion={lastVersion} />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default WhatsNewScreen
