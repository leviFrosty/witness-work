import { Platform } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SecuritySettingsSection from '@/features/settings/components/SecuritySettingsSection'
import WebAppLockSection from '@/features/settings/components/WebAppLockSection'

const SecurityScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          {Platform.OS === 'web' ? (
            <WebAppLockSection />
          ) : (
            <SecuritySettingsSection />
          )}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default SecurityScreen
