import { ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import AccountStatusSection from '@/features/settings/components/account/AccountStatusSection'
import BackupSection from '@/features/settings/components/account/BackupSection'
import BackupSlotsSection from '@/features/settings/components/account/BackupSlotsSection'
import RecoveryKeySection from '@/features/settings/components/account/RecoveryKeySection'
import DeviceSyncLinkSection from '@/features/settings/components/sync/DeviceSyncLinkSection'
import HandoffSection from '@/features/settings/components/account/HandoffSection'
import AccountSecuritySection from '@/features/settings/components/account/AccountSecuritySection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'

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
          {overview.state !== 'notSetUp' && <AccountSecuritySection />}
          <RecoveryKeySection onAccountChanged={changed} />
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
