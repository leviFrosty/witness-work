import { Alert } from 'react-native'
import { useToastController } from '@tamagui/toast'
import * as Clipboard from 'expo-clipboard'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { shareInviteLink } from '@/features/buddies/lib/shareInvite'

/**
 * Copy, share, and cancel for one unused invite — shared by its row in the
 * Buddies list and the Buddies Code screen that shows it.
 */
export default function useInviteLinkActions(inviteId: string | null) {
  const toast = useToastController()
  const link = () => (inviteId ? buddiesEngine.inviteLinkFor(inviteId) : null)

  const copy = async () => {
    const current = link()
    if (!current) return
    await Clipboard.setStringAsync(current)
    toast.show(i18n.t('copied'), { message: '', native: true })
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
              .catch((error) => Alert.alert(buddiesErrorMessage(error))),
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
