import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import ScheduleScreenPreferencesSection from '@/features/settings/preferences/plans/ScheduleScreenPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesScheduleScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <ScheduleScreenPreferencesSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesScheduleScreen
