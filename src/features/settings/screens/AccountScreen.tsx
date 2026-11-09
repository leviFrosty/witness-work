import { useEffect } from 'react'
import { Platform } from 'react-native'
import { checkSignInNotices } from '@/app/account/signInNoticesRuntime'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
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
import KeyChangeSection from '@/features/settings/components/account/keyChange/KeyChangeSection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'

const isWeb = Platform.OS === 'web'

const AccountScreen = () => {
  const { overview, refresh } = useAccountOverview()
  const backups = useBackupSlots()

  useEffect(() => {
    void checkSignInNotices({ force: true })
  }, [])
  const changed = () => {
    void refresh()
    void backups.refresh()
  }
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <KeyChangeSection />
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
          <RecoveryKeySection
            onAccountChanged={changed}
            canChangeKey={
              overview.state === 'active' ||
              overview.state === 'suspended' ||
              overview.state === 'offline' ||
              overview.state === 'unreachable'
            }
          />
          {}
          {isWeb && <WebSignOutSection />}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
