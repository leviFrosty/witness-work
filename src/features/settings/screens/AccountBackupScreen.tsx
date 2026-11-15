import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import BackupSection from '@/features/settings/components/account/BackupSection'
import BackupSlotsSection from '@/features/settings/components/account/BackupSlotsSection'
import useBackupSlots from '@/features/settings/hooks/useBackupSlots'

const AccountBackupScreen = () => {
  const backups = useBackupSlots()
  const changed = () => void backups.refresh()

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <BackupSection onChanged={changed} />
          <BackupSlotsSection
            slots={backups.slots}
            mySlotId={backups.mySlotId}
            onChanged={changed}
          />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountBackupScreen
