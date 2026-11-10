import { Platform, View } from 'react-native'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SecuritySettingsSection from '@/features/settings/components/SecuritySettingsSection'
import WebAppLockSection from '@/features/settings/components/WebAppLockSection'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import PrivacyPreferencesSection from '@/features/settings/preferences/general/PrivacyPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPrivacyScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          {hasCapability('appLock') && (
            <View style={{ gap: 5 }}>
              <SectionTitle text={i18n.t('appLock_title')} alignWithIcons />
              <SettingsSearchTarget id='appLock'>
                {Platform.OS === 'web' ? (
                  <WebAppLockSection />
                ) : (
                  <SecuritySettingsSection />
                )}
              </SettingsSearchTarget>
            </View>
          )}
          <PrivacyPreferencesSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPrivacyScreen
