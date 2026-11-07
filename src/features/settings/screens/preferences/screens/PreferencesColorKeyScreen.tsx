import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import ColorKeyPreferencesSection from '@/features/settings/components/preferences-sections/ColorKeyPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesColorKeyScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 60 }}
        >
          <ColorKeyPreferencesSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesColorKeyScreen
