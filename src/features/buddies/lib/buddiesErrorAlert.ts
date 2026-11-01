import { Alert } from 'react-native'
import i18n from '@/lib/locales'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { UnsentShareReason } from '@/features/buddies/lib/state'

export function alertBuddiesError(title: string, error: unknown) {
  Alert.alert(title, buddiesErrorMessage(error))
}

export function alertSharesNotSent({
  reason,
  names,
}: {
  reason: UnsentShareReason
  names: string[]
}) {
  Alert.alert(
    i18n.t('buddies_notSentTitle'),
    i18n.t(
      reason === 'suspended'
        ? 'buddies_notSentSuspended'
        : 'buddies_notSentGone',
      { names: names.join(', ') }
    )
  )
}
