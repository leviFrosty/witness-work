import { Alert, View } from 'react-native'
import {
  Copy as CopyIcon,
  Link as LinkIcon,
  QrCode as QrCodeIcon,
  Share as ShareIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import RowActionsMenu from '@/components/RowActionsMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { shareInviteLink } from '@/features/buddies/lib/shareInvite'
import type { OutgoingInvite } from '@/features/buddies/lib/state'

const AVATAR_SIZE = 44

/** An invite nobody has used yet: a link, not a person. */
export default function PendingInviteRow({
  invite,
  last,
}: {
  invite: OutgoingInvite
  last: boolean
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const title = i18n.t('buddies_inviteRowTitle')

  const copy = async () => {
    const link = buddiesEngine.inviteLinkFor(invite.inviteId)
    if (!link) return
    await Clipboard.setStringAsync(link)
    toast.show(i18n.t('copied'), { message: '', native: true })
  }

  const share = () => {
    const link = buddiesEngine.inviteLinkFor(invite.inviteId)
    if (link) void shareInviteLink(link)
  }

  const cancel = () =>
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
              .cancelInvite(invite.inviteId)
              .catch((error) => Alert.alert(buddiesErrorMessage(error))),
        },
      ]
    )

  return (
    <BuddyListRow
      last={last}
      muted
      leading={
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.colors.textAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={LinkIcon} size={18} color={theme.colors.textAlt} />
        </View>
      }
      title={title}
      subtitle={i18n.t('buddies_inviteRowSubtitle', {
        time: moment(invite.expiresAt).fromNow(),
      })}
      trailing={
        <RowActionsMenu
          accessibilityLabel={i18n.t('moreActionsFor', { name: title })}
          actions={[
            {
              id: 'show-code',
              label: i18n.t('buddies_showCode'),
              icon: QrCodeIcon,
              onPress: () =>
                navigation.navigate('Buddy Code', {
                  mode: 'code',
                  inviteId: invite.inviteId,
                }),
            },
            {
              id: 'copy-link',
              label: i18n.t('buddies_copyLink'),
              icon: CopyIcon,
              onPress: () => void copy(),
            },
            {
              id: 'share-link',
              label: i18n.t('buddies_shareLink'),
              icon: ShareIcon,
              onPress: share,
            },
            {
              id: 'cancel-invite',
              label: i18n.t('buddies_cancelInvite'),
              icon: TrashIcon,
              destructive: true,
              onPress: cancel,
            },
          ]}
        />
      }
    />
  )
}
