import { View } from 'react-native'
import {
  ChevronRight as ChevronRightIcon,
  Link as LinkIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import useInviteLinkActions from '@/features/buddies/hooks/useInviteLinkActions'
import type { OutgoingInvite } from '@/features/buddies/lib/state'

const AVATAR_SIZE = 44

/**
 * An invite nobody has used yet: a link, not a person. Tap shows its Buddies
 * Code, which also has Copy, Share, and Cancel; long-press for the same.
 */
export default function PendingInviteRow({
  invite,
  last,
}: {
  invite: OutgoingInvite
  last: boolean
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { copy, share, cancel } = useInviteLinkActions(invite.inviteId)

  const showCode = () =>
    navigation.navigate('Buddy Code', {
      mode: 'code',
      inviteId: invite.inviteId,
    })

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
      title={i18n.t('buddies_inviteRowTitle')}
      subtitle={i18n.t('buddies_inviteRowSubtitle', {
        time: moment(invite.expiresAt).fromNow(),
      })}
      onPress={showCode}
      actions={[
        [
          {
            id: 'show_code',
            title: i18n.t('buddies_showCode'),
            systemImage: 'qrcode',
            onPress: showCode,
          },
          {
            id: 'copy_link',
            title: i18n.t('buddies_copyLink'),
            systemImage: 'doc.on.doc',
            onPress: copy,
          },
          {
            id: 'share_link',
            title: i18n.t('buddies_shareLinkEllipsis'),
            systemImage: 'square.and.arrow.up',
            onPress: share,
          },
        ],
        [
          {
            id: 'cancel_invite',
            title: i18n.t('buddies_cancelInviteEllipsis'),
            systemImage: 'trash',
            destructive: true,
            onPress: cancel,
          },
        ],
      ]}
      accessory={
        <LucideIcon
          icon={ChevronRightIcon}
          size={18}
          color={theme.colors.textAlt}
        />
      }
    />
  )
}
