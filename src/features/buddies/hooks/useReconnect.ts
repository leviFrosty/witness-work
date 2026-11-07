import { useState } from 'react'
import { Alert } from 'react-native'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { noteUserAction } from '@/lib/userAction'
import { toast } from '@/stores/toasts'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useReconnect(from: string) {
  const stored = useBuddies((state) => state.reconnectOffers[from])
  const offer = stored && stored.expiresAt > Date.now() ? stored : null
  const [busy, setBusy] = useState(false)
  const name = offer ? buddyDisplayName(offer) : ''

  const reconnect = async () => {
    setBusy(true)
    try {
      const { claimed } = await buddiesEngine.acceptReconnect(from)

      if (claimed) analytics.capture('buddy_reconnect_claimed')
      toast.success(i18n.t('buddies_awaitingConfirm', { name }))
      noteUserAction('buddy')
    } catch (error) {
      alertBuddiesError(i18n.t('buddies_errorTitle'), error)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () =>
    Alert.alert(
      i18n.t('buddies_reconnectDismissTitle', { name }),
      i18n.t('buddies_reconnectDismissBody', { name }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('dismiss'),
          style: 'destructive',
          onPress: () => buddiesEngine.dismissReconnect(from),
        },
      ]
    )

  return { offer, name, busy, reconnect, dismiss }
}
