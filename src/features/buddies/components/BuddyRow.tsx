import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
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
import ReconnectButtons from '@/features/buddies/components/ReconnectButtons'
import useReconnect from '@/features/buddies/hooks/useReconnect'
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
import { type Buddy, buddySettings } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { usePreferences } from '@/stores/preferences'

/**
 * An active buddy opens their detail screen; long-press for its calendar toggle
 * and removal. One still `awaitingConfirm` (I accepted their invite) is muted,
 * with a menu to withdraw the request. One who changed their account key and
 * asked to reconnect says so, with Reconnect and Dismiss.
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
  const showStreaks = usePreferences((state) => state.showStreaks)
  const streak = showStreaks ? buddyStreakCount(buddy.streak) : 0
  const open = () => navigation.navigate('Buddy', { inboxId: buddy.inboxId })
  const shownOnCalendar = useBuddies(
    (state) => buddySettings(state.sharing, buddy).settings.showOnCalendar
  )
  const asked = useReconnect(buddy.inboxId)
  const reconnecting = !awaiting && asked.offer !== null

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
    ...(reconnecting && !asked.busy
      ? ([
          [
            {
              id: 'reconnect',
              title: i18n.t('buddies_reconnect'),
              systemImage: 'person.2',
              onPress: () => void asked.reconnect(),
            },
            {
              id: 'dismiss_reconnect',
              title: i18n.t('dismiss'),
              systemImage: 'xmark.circle',
              destructive: true,
              onPress: asked.dismiss,
            },
          ],
        ] satisfies ContextMenuEntries)
      : []),
    [
      {
        id: 'view',
        title: i18n.t('buddies_viewBuddy'),
        systemImage: 'person.crop.circle',
        onPress: open,
      },
      shownOnCalendar
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
          : reconnecting
            ? i18n.t('buddies_reconnectAsked')
            : buddy.tenure
              ? buddyTenureLabel(buddy.tenure)
              : i18n.t('buddies_sharingPlans')
      }
      onPress={awaiting ? undefined : open}
      actions={awaiting ? withdraw : actions}
      // Room for Reconnect and Dismiss; the row still opens the buddy.
      accessory={
        awaiting || reconnecting ? undefined : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {streak > 0 && <StreakBadge count={streak} size='sm' />}
            <LucideIcon
              icon={ChevronForwardIcon}
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
        ) : reconnecting ? (
          <ReconnectButtons from={buddy.inboxId} />
        ) : undefined
      }
    />
  )
}
