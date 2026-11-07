import { Alert, Platform } from 'react-native'
import { deviceAccountKey, unfinishedKeyChange } from '@/lib/accountKey'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { fromB64u } from '@/lib/bytes'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { StepUpNotConfirmedError } from '@/lib/sensitiveCheck'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { deleteBackupsBeforeKeyLoss } from '@/lib/serverAccount/backupAccess'
import { deleteCloudSyncBeforeKeyLoss } from '@/lib/syncTransport/server/cloudSyncCleanup'
import {
  requestBackupSoon,
  useBackupState,
} from '@/lib/serverAccount/backupStore'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'

export default function BuddiesDeleteDataButton() {
  return Platform.OS === 'web' ? (
    <BuddiesDeleteOnPhone />
  ) : (
    <PhoneBuddiesDeleteDataButton />
  )
}

function BuddiesDeleteOnPhone() {
  const theme = useTheme()
  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        textAlign: 'center',
        paddingHorizontal: 20,
      }}
    >
      {i18n.t('buddies_deleteAllWeb')}
    </Text>
  )
}

function PhoneBuddiesDeleteDataButton() {
  const theme = useTheme()
  const backupOn = useBackupState((state) => state.enabled)
  const hadSlots = useBackupState((state) => (state.slots?.length ?? 0) > 0)

  const deleteAll = async () => {
    try {
      if (await unfinishedKeyChange()) {
        Alert.alert(
          i18n.t('buddies_errorDeleteAllTitle'),
          i18n.t('account_keyChangeUnfinished')
        )
        return
      }
    } catch (error) {
      alertBuddiesError(i18n.t('buddies_errorDeleteAllTitle'), error)
      return
    }
    const seed = await deviceAccountKey.peek().catch(() => null)
    if (seed) {
      try {
        await deleteBackupsBeforeKeyLoss(fromB64u(seed))

        await deleteCloudSyncBeforeKeyLoss(fromB64u(seed))
      } catch (error) {
        if (error instanceof StepUpNotConfirmedError) return
        logger.warn('[buddies] deleting the backup first failed', error)
        Alert.alert(
          i18n.t('buddies_errorDeleteAllTitle'),
          i18n.t('buddies_deleteAllBackupFailed')
        )
        return
      }
    }
    try {
      await buddiesEngine.deleteEverything()
    } catch (error) {
      alertBuddiesError(i18n.t('buddies_errorDeleteAllTitle'), error)
      return
    }
    if (!useBackupState.getState().enabled) return

    requestBackupSoon()
    Alert.alert(
      i18n.t('buddies_deletedNewKeyTitle'),
      i18n.t('buddies_deletedNewKeyBody')
    )
  }

  const confirmDelete = () =>
    Alert.alert(
      i18n.t('buddies_deleteAllTitle'),
      i18n.t(
        usesCloudSync()
          ? 'buddies_deleteAllBodyCloudSync'
          : backupOn || hadSlots
            ? 'buddies_deleteAllBodyBackup'
            : 'buddies_deleteAllBody'
      ),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_delete'),
          style: 'destructive',
          onPress: () => void deleteAll(),
        },
      ]
    )

  return (
    <Button onPress={confirmDelete} style={{ alignSelf: 'center' }}>
      <Text style={{ color: theme.colors.error }}>
        {i18n.t('buddies_deleteAll')}
      </Text>
    </Button>
  )
}
