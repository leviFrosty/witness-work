import { Alert } from 'react-native'
import { keyChange } from '@/app/account/keyChange'
import i18n from '@/lib/locales'

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
