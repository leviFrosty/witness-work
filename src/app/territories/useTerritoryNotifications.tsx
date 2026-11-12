import { useNavigation } from '@react-navigation/native'
import useNow from '@/hooks/useNow'
import { useFeatureFlag } from '@/lib/featureFlags'
import { hasCapability } from '@/lib/platformCapabilities'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import {
  type IncomingCarInvite,
  isTerritoryNotification,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { territoryTitle } from '@/features/territories/lib/territoryTitle'
import { useTerritories } from '@/features/territories/stores/territories'
import TerritoryNotificationRow, {
  type TerritoryInviteAnswer,
} from '@/app/territories/TerritoryNotificationRow'

export function territoryInviteAnswer(
  invite: IncomingCarInvite | undefined,
  { on, now }: { on: boolean; now: number }
): TerritoryInviteAnswer | null {
  if (!invite || invite.status === 'cancelled') return null
  if (on || invite.status === 'joined') return 'joined'
  if (invite.status === 'declined') return 'declined'
  return invite.expiresAt > now ? 'open' : null
}

export default function useTerritoryNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled =
    useFeatureFlag('territories') && hasCapability('territorySharing')
  const buddiesEnabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const queue = useBuddies((state) => state.notifications)
  const invites = useBuddies((state) => state.carInvites)
  const buddies = useBuddies((state) => state.buddies)
  const spaces = useTerritories((state) => state.spaces)
  const territories = useTerritories((state) => state.territories)
  const memberships = useTerritories((state) => state.memberships)
  const { now } = useNow()
  if (!enabled || !buddiesEnabled || !started) return []

  const viewOf = (spaceId: string | undefined) =>
    spaceId ? territories.find((t) => t.shared?.spaceId === spaceId) : undefined
  const openTerritory = (spaceId: string | undefined) => {
    const view = viewOf(spaceId)
    if (view) navigation.navigate('TerritoryDetails', { territoryId: view.id })
    else navigation.navigate('Root', { screen: 'Territories' } as never)
  }

  return queue
    .filter(isTerritoryNotification)
    .flatMap((entry): NotificationItem[] => {
      const invite =
        entry.kind === 'territoryInvite' && entry.shareKey
          ? invites[entry.shareKey]
          : undefined
      const spaceId = invite?.spaceId ?? entry.spaceId
      const on =
        spaceId !== undefined &&
        (spaces[spaceId] !== undefined ||
          (memberships.territories[spaceId] !== undefined &&
            (memberships.leftTerritories[spaceId] ?? 0) <
              memberships.territories[spaceId].at))
      const answer =
        entry.kind === 'territoryInvite'
          ? territoryInviteAnswer(invite, { on, now })
          : undefined
      if (answer === null) return []
      const view = viewOf(spaceId)
      const handoff = invite?.territory?.handoff ?? false
      const title = view ? territoryTitle(view) : invite?.territory?.title
      const shown =
        handoff && invite?.territory?.streets[0]
          ? {
              ...entry,
              kind: 'territoryHandoff' as const,
              street: invite.territory.streets[0],
            }
          : entry
      const awaitsAnswer = answer === 'open'
      const buddy = buddies.find((b) => b.inboxId === entry.from)
      return [
        {
          id: entry.id,
          kind: 'buddies',
          at: entry.at,
          title: buddy ? buddyDisplayName(buddy) : entry.name,
          sticky: awaitsAnswer,
          onView: () => buddiesEngine.markNotificationRead(entry.id),
          onDismiss: () => buddiesEngine.dismissNotification(entry.id),
          render: ({ unread, dismiss, closeThen }) => (
            <TerritoryNotificationRow
              entry={shown}
              answer={answer}
              territory={title}
              handoff={handoff}
              unread={unread}
              onDismiss={awaitsAnswer ? undefined : dismiss}
              onPress={
                view ? () => closeThen(() => openTerritory(spaceId)) : undefined
              }
              onJoined={() => closeThen(() => openTerritory(spaceId))}
            />
          ),
        },
      ]
    })
}
