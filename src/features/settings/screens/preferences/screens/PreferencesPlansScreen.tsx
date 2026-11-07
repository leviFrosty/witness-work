import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import PlansPreferencesSection from '@/features/settings/components/preferences-sections/PlansPreferencesSection'
import UnloggedDayRemindersSection from '@/features/settings/components/preferences-sections/UnloggedDayRemindersSection'
import MonthReportReminderSection from '@/features/settings/components/preferences-sections/MonthReportReminderSection'
import WeekPlanReminderSection from '@/features/settings/components/preferences-sections/WeekPlanReminderSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPlansScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <PlansPreferencesSection />
          <UnloggedDayRemindersSection />
          <MonthReportReminderSection />
          <WeekPlanReminderSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPlansScreen
