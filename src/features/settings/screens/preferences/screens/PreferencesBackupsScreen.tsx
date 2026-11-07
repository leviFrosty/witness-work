import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import BackupsPreferencesSection from '@/features/settings/components/preferences-sections/BackupsPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesBackupsScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <BackupsPreferencesSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesBackupsScreen
