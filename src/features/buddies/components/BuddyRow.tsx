import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { View } from 'react-native'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import PullDownMenu from '@/components/ui/PullDownMenu'
import StreakBadge from '@/components/StreakBadge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  confirmRemoveBuddy,
  confirmWithdrawRequest,
} from '@/features/buddies/lib/buddyConfirmations'
import {
  buddyDisplayName,
  buddyStreakCount,
  buddyTenureLabel,
} from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * An active buddy opens their detail screen; long-press for its calendar toggle
 * and removal. One still `awaitingConfirm` (I accepted their invite) is muted,
 * with a menu to withdraw the request.
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
  const streak = buddyStreakCount(buddy.streak)
  const open = () => navigation.navigate('Buddy', { inboxId: buddy.inboxId })

  const withdraw: ContextMenuEntries = [
    {
      id: 'withdraw',
      title: i18n.t('buddies_withdrawRequestEllipsis'),
      systemImage: 'arrow.uturn.backward',
      destructive: true,
      onPress: () => confirmWithdrawRequest(buddy),
    },
  ]

  // Everything here is also on the buddy's detail screen.
  const actions: ContextMenuEntries = [
    [
      {
        id: 'view',
        title: i18n.t('buddies_viewBuddy'),
        systemImage: 'person.crop.circle',
        onPress: open,
      },
      buddy.showOnCalendar
        ? {
            id: 'hide_from_calendar',
            title: i18n.t('buddies_hideFromCalendarAction'),
            systemImage: 'calendar.badge.minus',
            onPress: () =>
              buddiesEngine.setShowOnCalendar(buddy.inboxId, false),
          }
        : {
            id: 'show_on_calendar',
            title: i18n.t('buddies_showOnCalendarAction'),
            systemImage: 'calendar.badge.plus',
            onPress: () => buddiesEngine.setShowOnCalendar(buddy.inboxId, true),
          },
    ],
    [
      {
        id: 'remove',
        title: i18n.t('buddies_removeBuddyEllipsis'),
        systemImage: 'person.badge.minus',
        destructive: true,
        onPress: () => confirmRemoveBuddy(buddy),
      },
    ],
  ]

  return (
    <BuddyListRow
      last={last}
      muted={awaiting}
      leading={
        <BuddyAvatar
          avatar={buddy.avatar}
          name={buddyDisplayName(buddy)}
          color={buddy}
        />
      }
      title={buddyDisplayName(buddy)}
      subtitle={
        awaiting
          ? i18n.t('buddies_awaitingConfirm', { name: buddyDisplayName(buddy) })
          : buddy.tenure
            ? buddyTenureLabel(buddy.tenure)
            : i18n.t('buddies_sharingPlans')
      }
      onPress={awaiting ? undefined : open}
      actions={awaiting ? withdraw : actions}
      accessory={
        awaiting ? undefined : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {streak > 0 && <StreakBadge count={streak} size='sm' />}
            <LucideIcon
              icon={ChevronRightIcon}
              size={18}
              color={theme.colors.textAlt}
            />
          </View>
        )
      }
      // A waiting request has no detail screen, so its only action stays
      // visible too.
      trailing={
        awaiting ? (
          <PullDownMenu
            actions={withdraw}
            accessibilityLabel={i18n.t('moreActionsFor', {
              name: buddyDisplayName(buddy),
            })}
            triggerSize={16}
          />
        ) : undefined
      }
    />
  )
}
