import { Alert } from 'react-native'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { Buddy } from '@/features/buddies/lib/state'

const removeBuddy = (buddy: Buddy) =>
  buddiesEngine
    .removeBuddy(buddy.inboxId)
    .catch((error) => Alert.alert(buddiesErrorMessage(error)))

/** Ends a pairing for both people, after confirming. */
export const confirmRemoveBuddy = (buddy: Buddy) =>
  confirmDestructive({
    title: i18n.t('buddies_removeTitle', { name: buddy.name }),
    description: i18n.t('buddies_removeBody', { name: buddy.name }),
    confirmLabel: i18n.t('buddies_remove'),
    onConfirm: () => void removeBuddy(buddy),
  })

/** Takes back my acceptance of their invite before they confirm it. */
export const confirmWithdrawRequest = (buddy: Buddy) =>
  confirmDestructive({
    title: i18n.t('buddies_withdrawTitle'),
    description: i18n.t('buddies_withdrawBody', { name: buddy.name }),
    confirmLabel: i18n.t('buddies_withdrawRequest'),
    onConfirm: () => void removeBuddy(buddy),
  })
