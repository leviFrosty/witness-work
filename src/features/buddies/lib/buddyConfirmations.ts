import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import type { Buddy } from '@/features/buddies/lib/state'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

const removeBuddy = (buddy: Buddy) =>
  buddiesEngine
    .removeBuddy(buddy.inboxId)
    .catch((error) =>
      alertBuddiesError(i18n.t('buddies_errorRemoveTitle'), error)
    )

export const confirmRemoveBuddy = (buddy: Buddy) =>
  confirmDestructive({
    title: i18n.t('buddies_removeTitle', { name: buddyDisplayName(buddy) }),
    description: i18n.t('buddies_removeBody', {
      name: buddyDisplayName(buddy),
    }),
    confirmLabel: i18n.t('buddies_remove'),
    onConfirm: () => void removeBuddy(buddy),
  })

export const confirmWithdrawRequest = (buddy: Buddy) =>
  confirmDestructive({
    title: i18n.t('buddies_withdrawTitle'),
    description: i18n.t('buddies_withdrawBody', {
      name: buddyDisplayName(buddy),
    }),
    confirmLabel: i18n.t('buddies_withdrawRequest'),
    onConfirm: () => void removeBuddy(buddy),
  })
