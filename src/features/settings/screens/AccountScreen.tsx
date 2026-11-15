import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  CloudUpload as CloudUploadIcon,
  ShieldCheck as ShieldCheckIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import { checkSignInNotices } from '@/app/account/signInNoticesRuntime'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import AccountNavRow from '@/features/settings/components/account/AccountNavRow'
import useTheme from '@/contexts/theme'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import AccountHeader from '@/features/settings/components/account/AccountHeader'
import SignInSection from '@/features/settings/components/account/SignInSection'
import WebSignOutSection from '@/features/settings/components/account/WebSignOutSection'
import KeyChangeSection from '@/features/settings/components/account/keyChange/KeyChangeSection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import { useKeyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import i18n from '@/lib/locales'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import type { RootStackNavigation } from '@/types/rootStack'

const isWeb = Platform.OS === 'web'

const AccountScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { overview, refresh } = useAccountOverview()

  useEffect(() => {
    void checkSignInNotices({ force: true })
  }, [])

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <KeyChangeSection />
          <AccountHeader
            overview={overview}
            onRetry={() => void refresh({ retry: true })}
          />
          <Section>
            <AccountNavRow
              icon={SmartphoneIcon}
              label={i18n.t('accountSecurity_devices')}
              onPress={() => navigation.navigate('Account Devices')}
              testID='account-devices'
            />
            <AccountNavRow
              icon={ShieldCheckIcon}
              label={i18n.t('accountSecurity_section')}
              onPress={() => navigation.navigate('Account Security')}
              testID='account-security'
              lastInSection={isWeb}
            />
            {!isWeb && (
              <AccountNavRow
                icon={CloudUploadIcon}
                label={i18n.t('backup_section')}
                value={<BackupValue />}
                onPress={() => navigation.navigate('Account Backup')}
                testID='account-backup'
                lastInSection
              />
            )}
          </Section>
          {!isWeb && <SignInSection onAccountChanged={() => void refresh()} />}
          {isWeb && <WebSignOutSection />}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

function BackupValue() {
  const theme = useTheme()
  const enabled = useBackupState((state) => state.enabled)
  const uploading = useBackupState((state) => state.uploading)
  const failed = useBackupState(
    (state) => state.schedule.lastResult === 'failed'
  )
  const signedOut = useKeyChangedElsewhere((state) => state.signedOut !== null)
  const problem = enabled && !uploading && (failed || signedOut)
  return (
    <Text
      testID='account-backup-value'
      style={{ color: problem ? theme.colors.error : theme.colors.textAlt }}
    >
      {i18n.t(
        problem
          ? 'account_backupProblem'
          : enabled
            ? 'account_backupOn'
            : 'account_backupOff'
      )}
    </Text>
  )
}

export default AccountScreen
