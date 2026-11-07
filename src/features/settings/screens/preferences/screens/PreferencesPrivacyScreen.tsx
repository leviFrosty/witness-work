import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import PrivacyPreferencesSection from '@/features/settings/components/preferences-sections/PrivacyPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPrivacyScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <PrivacyPreferencesSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPrivacyScreen
