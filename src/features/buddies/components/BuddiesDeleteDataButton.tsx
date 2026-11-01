import { Alert } from 'react-native'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { fromB64u } from '@/lib/bytes'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { deleteBackupsBeforeKeyLoss } from '@/lib/serverAccount/backupAccess'
import { deleteCloudSyncBeforeKeyLoss } from '@/lib/syncTransport/server/cloudSyncCleanup'
import {
  requestBackupSoon,
  useBackupState,
} from '@/lib/serverAccount/backupStore'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'

export default function BuddiesDeleteDataButton() {
  const theme = useTheme()
  const backupOn = useBackupState((state) => state.enabled)
  const hadSlots = useBackupState((state) => (state.slots?.length ?? 0) > 0)

  const deleteAll = async () => {
    const seed = await BuddiesKeychain.peekRootSeed().catch(() => null)
    if (seed) {
      try {
        await deleteBackupsBeforeKeyLoss(fromB64u(seed))

        await deleteCloudSyncBeforeKeyLoss(fromB64u(seed))
      } catch (error) {
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
        backupOn || hadSlots
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
