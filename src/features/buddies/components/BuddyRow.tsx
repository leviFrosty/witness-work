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

  const withdraw: ContextMenuEntries = [
    {
      id: 'withdraw',
      title: i18n.t('buddies_withdrawRequestEllipsis'),
      systemImage: 'arrow.uturn.backward',
      destructive: true,
      onPress: () => confirmWithdrawRequest(buddy),
    },
  ]

  const actions: ContextMenuEntries = [
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
              icon={ChevronForwardIcon}
              size={18}
              color={theme.colors.textAlt}
            />
          </View>
        )
      }
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
