import { Alert } from 'react-native'
import { keyChange } from '@/app/account/keyChange'
import i18n from '@/lib/locales'

/**
 * Signing in to another account waits while a key change on this device is
 * unfinished (docs/account-key-change.md, "The record belongs to its account"):
 * it's continued or discarded first, so its new key is never left behind. Says
 * so, and resolves whether one is.
 */
export async function refuseWhileKeyChangeUnfinished(): Promise<boolean> {
  const current = await keyChange.current()
  if (!current) return false
  const committed = current.stage !== 'pending' && current.stage !== 'confirmed'
  Alert.alert(
    i18n.t(
      committed ? 'accountKeyChange_finishing' : 'accountKeyChange_resumeTitle'
    ),
    i18n.t(
      committed
        ? 'accountKeyChange_finishingBody'
        : 'accountKeyChange_unfinishedSwitchBody'
    )
  )
  return true
}
