import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import PersonalizationPreferencesSection from '@/features/settings/components/preferences-sections/PersonalizationPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { useRef } from 'react'
import type { ScrollView, View } from 'react-native'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'

const PreferencesPersonalizationScreen = () => {
  const viewportRef = useRef<Pick<View, 'measureInWindow'> | null>(null)
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <VisibilityViewportContext value={viewportRef}>
          <KeyboardAwareScrollView
            innerRef={(node: ScrollView | null) => {
              viewportRef.current = node?.getNativeScrollRef() ?? null
            }}
            style={{ flex: 1 }}
            contentContainerStyle={{
              gap: 30,
              paddingTop: 30,
              paddingBottom: 60,
            }}
          >
            <PersonalizationPreferencesSection />
          </KeyboardAwareScrollView>
        </VisibilityViewportContext>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPersonalizationScreen
