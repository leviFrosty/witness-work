import { Alert, View } from 'react-native'
import {
  ArchiveRestore as ArchiveRestoreIcon,
  Smartphone as SmartphoneIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import useTheme from '@/contexts/theme'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import { deleteAllBackups, deleteBackupSlot } from '@/app/account/backup'
import { offerRestore } from '@/app/account/backupRestore'
import { formatDateTime } from '@/lib/dates'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { BackupSlot } from '@/lib/serverAccount/backupClient'
import { useBackupState } from '@/lib/serverAccount/backupStore'

export default function BackupSlotsSection({
  slots,
  mySlotId,
  onChanged,
}: {
  slots: BackupSlot[]
  mySlotId: string | null
  onChanged: () => void
}) {
  const theme = useTheme()
  const restoring = useBackupState((state) => state.restoring)
  if (slots.length === 0) return null

  const failedDeleting = () =>
    Alert.alert(
      i18n.t('backup_deleteFailedTitle'),
      i18n.t('backup_deleteFailedBody')
    )

  const confirmDeleteSlot = (slot: BackupSlot) => {
    const mine = slot.slotId === mySlotId
    Alert.alert(
      i18n.t('backup_deleteSlotTitle'),
      i18n.t(mine ? 'backup_deleteSlotMineBody' : 'backup_deleteSlotOtherBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () =>
            void deleteBackupSlot(slot.slotId, 'settings')
              .catch((error: unknown) => {
                logger.warn('[backup] deleting a slot failed', error)
                failedDeleting()
              })
              .finally(onChanged),
        },
      ]
    )
  }

  const confirmDeleteAll = () =>
    Alert.alert(
      i18n.t('backup_deleteAllTitle'),
      i18n.t('backup_deleteAllBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('backup_deleteAll'),
          style: 'destructive',
          onPress: () =>
            void deleteAllBackups('settings')
              .catch((error: unknown) => {
                logger.warn('[backup] deleting every slot failed', error)
                failedDeleting()
              })
              .finally(onChanged),
        },
      ]
    )

  const restore = () =>
    void offerRestore('settings', { quietWhenNone: false })
      .catch((error: unknown) =>
        logger.warn('[backup] restore from Settings failed', error)
      )
      .finally(onChanged)

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle text={i18n.t('backup_devices')} alignWithIcons />
      <Section>
        {slots.map((slot) => (
          <InputRowButton
            key={slot.slotId}
            leftIcon={SmartphoneIcon}
            label={i18n.t(
              slot.slotId === mySlotId
                ? 'backup_slotThisPhone'
                : 'backup_slotOther'
            )}
            sublabel={i18n.t('backup_slotDetail', {
              when: formatDateTime(slot.uploadedAt, { style: 'medium' }),
              size: formatBytes(slot.size),
            })}
            onPress={() => confirmDeleteSlot(slot)}
          />
        ))}
        <InputRowButton
          leftIcon={ArchiveRestoreIcon}
          label={i18n.t('backup_restore')}
          disabled={restoring}
          onPress={restore}
        />
        <InputRowButton
          leftIcon={Trash2Icon}
          leftIconColor={theme.colors.error}
          label={i18n.t('backup_deleteAll')}
          onPress={confirmDeleteAll}
          lastInSection
        />
      </Section>
      <SectionFooter text={i18n.t('backup_devicesFooter')} />
    </View>
  )
}
