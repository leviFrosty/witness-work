import { Platform, ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import AccountStatusSection from '@/features/settings/components/account/AccountStatusSection'
import BackupSection from '@/features/settings/components/account/BackupSection'
import BackupSlotsSection from '@/features/settings/components/account/BackupSlotsSection'
import RecoveryKeySection from '@/features/settings/components/account/RecoveryKeySection'
import DeviceSyncLinkSection from '@/features/settings/components/sync/DeviceSyncLinkSection'
import CloudSyncPhotoStorageSection from '@/features/settings/components/account/CloudSyncPhotoStorageSection'
import HandoffSection from '@/features/settings/components/account/HandoffSection'
import AccountSecuritySection from '@/features/settings/components/account/AccountSecuritySection'
import WebSignOutSection from '@/features/settings/components/account/WebSignOutSection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'

const isWeb = Platform.OS === 'web'

/**
 * Settings → Account: the anonymous server account (ADR 0024), its end-to-end
 * encrypted backup, moving it to another phone, its recovery key (ADR 0026),
 * once it's set up, its devices and activity (ADR 0028), a way into Device
 * Sync, and its Cloud Sync photo storage (ADR 0040 §6).
 *
 * On the web: Sign Out. Backup, moving the account and the recovery key wait
 * for the web's step-up (docs/passkeys-protocol.md, "The shared check before
 * sensitive actions"): without it they'd show the key or delete with no check.
 */
const AccountScreen = () => {
  const { overview, refresh } = useAccountOverview()
  const backups = useBackupSlots()
  const changed = () => {
    void refresh()
    void backups.refresh()
  }
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <AccountStatusSection
            overview={overview}
            onRetry={() => void refresh({ retry: true })}
          />
          {!isWeb && (
            <BackupSection accountState={overview.state} onChanged={changed} />
          )}
          {!isWeb && (
            <BackupSlotsSection
              slots={backups.slots}
              mySlotId={backups.mySlotId}
              onChanged={changed}
            />
          )}
          {!isWeb && <HandoffSection />}
          <DeviceSyncLinkSection />
          <CloudSyncPhotoStorageSection />
          {overview.state !== 'notSetUp' && <AccountSecuritySection />}
          {!isWeb && <RecoveryKeySection onAccountChanged={changed} />}
          {isWeb && <WebSignOutSection />}
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
