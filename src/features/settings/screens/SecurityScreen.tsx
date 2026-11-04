import { Platform, ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SecuritySettingsSection from '@/features/settings/components/SecuritySettingsSection'
import WebAppLockSection from '@/features/settings/components/WebAppLockSection'

/** App Lock: Face ID or the passcode on phones, a passkey on the web. */
const SecurityScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          {Platform.OS === 'web' ? (
            <WebAppLockSection />
          ) : (
            <SecuritySettingsSection />
          )}
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default SecurityScreen
