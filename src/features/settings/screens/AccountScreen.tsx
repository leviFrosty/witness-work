import { ScrollView } from 'react-native'
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
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'

/**
 * Settings → Account: the anonymous server account (ADR 0024), its end-to-end
 * encrypted backup, moving it to another phone, its recovery key (ADR 0026),
 * once it's set up, its devices and activity (ADR 0028), a way into Device
 * Sync, and its Cloud Sync photo storage (ADR 0040 §6).
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
          <BackupSection accountState={overview.state} onChanged={changed} />
          <BackupSlotsSection
            slots={backups.slots}
            mySlotId={backups.mySlotId}
            onChanged={changed}
          />
          <HandoffSection />
          <DeviceSyncLinkSection />
          <CloudSyncPhotoStorageSection />
          {overview.state !== 'notSetUp' && <AccountSecuritySection />}
          <RecoveryKeySection onAccountChanged={changed} />
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
