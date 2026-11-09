import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import CalendarSettings from '@/features/settings/components/calendar/CalendarSettings'
import { calendarSyncSupported } from '../../../../../modules/calendar-bridge'

export default function PreferencesCalendarScreen() {
  if (!calendarSyncSupported) return null
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView contentContainerStyle={{ paddingVertical: 30 }}>
          <CalendarSettings />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}
