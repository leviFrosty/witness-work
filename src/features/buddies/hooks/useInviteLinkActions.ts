import { Alert } from 'react-native'
import { toast } from '@/stores/toasts'
import * as Clipboard from 'expo-clipboard'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import { shareInviteLink } from '@/features/buddies/lib/shareInvite'

export default function useInviteLinkActions(inviteId: string | null) {
  const link = () => (inviteId ? buddiesEngine.inviteLinkFor(inviteId) : null)

  const copy = async () => {
    const current = link()
    if (!current) return
    await Clipboard.setStringAsync(current)
    toast.success(i18n.t('copied'))
  }

  const share = () => {
    const current = link()
    if (current) void shareInviteLink(current)
  }

  const cancel = () => {
    if (!inviteId) return
    Alert.alert(
      i18n.t('buddies_cancelInviteTitle'),
      i18n.t('buddies_cancelInviteBody'),
      [
        { text: i18n.t('buddies_keepInvite'), style: 'cancel' },
        {
          text: i18n.t('buddies_cancelInvite'),
          style: 'destructive',
          onPress: () =>
            buddiesEngine
              .cancelInvite(inviteId)
              .catch((error) =>
                alertBuddiesError(
                  i18n.t('buddies_errorCancelInviteTitle'),
                  error
                )
              ),
        },
      ]
    )
  }

  return {
    copy: () => void copy(),
    share,
    cancel,
  }
}
