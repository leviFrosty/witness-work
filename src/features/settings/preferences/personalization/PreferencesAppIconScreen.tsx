import { useRef } from 'react'
import { View, type ScrollView } from 'react-native'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import IsSupporter from '@/components/IsSupporter'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import AppIconPicker from '@/features/settings/components/appIcon/AppIconPicker'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'

const PreferencesAppIconScreen = () => {
  const viewportRef = useRef<Pick<View, 'measureInWindow'> | null>(null)
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <VisibilityViewportContext value={viewportRef}>
          <SettingsScrollView
            innerRef={(node: ScrollView | null) => {
              viewportRef.current = node?.getNativeScrollRef() ?? null
            }}
            contentContainerStyle={{
              gap: 32,
              paddingTop: 24,
              paddingBottom: 120,
            }}
          >
            <IsSupporter analyticsSurface='app_icon' feature='customAppIcon'>
              <AppIconPicker />
            </IsSupporter>
          </SettingsScrollView>
        </VisibilityViewportContext>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesAppIconScreen
