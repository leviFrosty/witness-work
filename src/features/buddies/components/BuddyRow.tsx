import { Alert } from 'react-native'
import {
  ChevronRight as ChevronRightIcon,
  Undo2 as UndoIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import RowActionsMenu from '@/components/RowActionsMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { buddyTenureLabel } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * An active buddy opens their detail screen. One still `awaitingConfirm` (I
 * accepted their invite) is muted, with a menu to withdraw the request.
 */
export default function BuddyRow({
  buddy,
  last,
}: {
  buddy: Buddy
  last: boolean
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const awaiting = buddy.status === 'awaitingConfirm'

  const withdraw = () =>
    buddiesEngine
      .removeBuddy(buddy.inboxId)
      .catch((error) => Alert.alert(buddiesErrorMessage(error)))

  return (
    <BuddyListRow
      last={last}
      muted={awaiting}
      leading={
        <BuddyAvatar
          avatar={buddy.avatar}
          name={buddy.name}
          colorIndex={buddy.colorIndex}
        />
      }
      title={buddy.name}
      subtitle={
        awaiting
          ? i18n.t('buddies_awaitingConfirm', { name: buddy.name })
          : buddy.tenure
            ? buddyTenureLabel(buddy.tenure)
            : i18n.t('buddies_sharingPlans')
      }
      onPress={
        awaiting
          ? undefined
          : () => navigation.navigate('Buddy', { inboxId: buddy.inboxId })
      }
      trailing={
        awaiting ? (
          <RowActionsMenu
            accessibilityLabel={i18n.t('moreActionsFor', { name: buddy.name })}
            actions={[
              {
                id: 'withdraw',
                label: i18n.t('buddies_withdrawRequest'),
                icon: UndoIcon,
                destructive: true,
                onPress: withdraw,
              },
            ]}
          />
        ) : (
          <LucideIcon
            icon={ChevronRightIcon}
            size={18}
            color={theme.colors.textAlt}
          />
        )
      }
    />
  )
}
