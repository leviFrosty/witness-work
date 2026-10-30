import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import { hasCapability } from '@/lib/platformCapabilities'
import PlansPreferencesSection from '@/features/settings/components/preferences-sections/PlansPreferencesSection'
import UnloggedDayRemindersSection from '@/features/settings/components/preferences-sections/UnloggedDayRemindersSection'
import MonthReportReminderSection from '@/features/settings/components/preferences-sections/MonthReportReminderSection'
import WeekPlanReminderSection from '@/features/settings/components/preferences-sections/WeekPlanReminderSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPlansScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <PlansPreferencesSection />
          {hasCapability('deviceNotifications') && (
            <>
              <UnloggedDayRemindersSection />
              <MonthReportReminderSection />
              <WeekPlanReminderSection />
            </>
          )}
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPlansScreen
