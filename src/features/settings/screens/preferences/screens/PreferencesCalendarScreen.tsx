import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { Platform } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import CalendarSettings from '@/features/settings/components/calendar/CalendarSettings'

export default function PreferencesCalendarScreen() {
  if (Platform.OS !== 'ios') return null
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ paddingVertical: 30 }}
        >
          <CalendarSettings />
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}
