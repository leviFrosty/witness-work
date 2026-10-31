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
import KeyChangeSection from '@/features/settings/components/account/keyChange/KeyChangeSection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'
import { useKeyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'

const isWeb = Platform.OS === 'web'

/**
 * Settings → Account: the anonymous server account (ADR 0024), its end-to-end
 * encrypted backup, moving it to another phone, its recovery key (ADR 0026),
 * once it's set up, its devices and activity (ADR 0028), changing its key (ADR
 * 0039), a way into Device Sync, and its Cloud Sync photo storage (ADR 0040
 * §6).
 */
const AccountScreen = () => {
  const { overview, refresh } = useAccountOverview()
  const signedOut = useKeyChangedElsewhere((state) => state.signedOut !== null)
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
          <KeyChangeSection />
          {!(isWeb && signedOut) && (
            <AccountStatusSection
              overview={overview}
              onRetry={() => void refresh({ retry: true })}
            />
          )}
          {/* A browser's backup, handoff and sync screens come with its
              account screens (ADR 0038 §8); until then it has the account,
              its devices and activity, and changing its key. */}
          {!isWeb && (
            <>
              <BackupSection
                accountState={overview.state}
                onChanged={changed}
              />
              <BackupSlotsSection
                slots={backups.slots}
                mySlotId={backups.mySlotId}
                onChanged={changed}
              />
              <HandoffSection />
              <DeviceSyncLinkSection />
              <CloudSyncPhotoStorageSection />
            </>
          )}
          {overview.state !== 'notSetUp' && !(isWeb && signedOut) && (
            <AccountSecuritySection />
          )}
          <RecoveryKeySection
            onAccountChanged={changed}
            canChangeKey={
              overview.state === 'active' ||
              overview.state === 'suspended' ||
              overview.state === 'offline' ||
              overview.state === 'unreachable'
            }
          />
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
