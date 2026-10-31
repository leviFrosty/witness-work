import { useNavigation } from '@react-navigation/native'
import useNow from '@/hooks/useNow'
import { useFeatureFlag } from '@/lib/featureFlags'
import { isOnSharedCar } from '@/lib/mileage/sharedCar'
import useSharedCars from '@/stores/sharedCars'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import {
  type IncomingCarInvite,
  isCarNotification,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import SharedCarNotificationRow, {
  type CarInviteAnswer,
} from '@/app/sharedCars/SharedCarNotificationRow'

/**
 * How an invitation shows in the bell: still to answer (`open`), or answered:
 * `joined`, also when the User is on the car anyway (joined from another
 * invitation, or on another of their devices whose answer hasn't arrived), or
 * `declined`. Null when it isn't listed: canceled, gone, or lapsed unanswered,
 * as the next expiry prunes it.
 */
export function carInviteAnswer(
  invite: IncomingCarInvite | undefined,
  { onCar, now }: { onCar: boolean; now: number }
): CarInviteAnswer | null {
  if (!invite || invite.status === 'cancelled') return null
  if (onCar || invite.status === 'joined') return 'joined'
  if (invite.status === 'declined') return 'declined'
  return invite.expiresAt > now ? 'open' : null
}

/**
 * Shared Cars' entries in the Buddies queue as tray items, while the
 * `shared-cars` flag is on: buddies' invitations to their cars ("Anna shared
 * Mazda CX-5 with you", with Join and Decline), held in the tray until they're
 * answered, canceled, or lapse; and buddies joining this User's cars. An
 * invitation opens Mileage once the car is on this device; a buddy joining
 * opens the car's People, where they now are.
 */
export default function useSharedCarNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useFeatureFlag('shared-cars')
  const buddiesEnabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const queue = useBuddies((state) => state.notifications)
  const carInvites = useBuddies((state) => state.carInvites)
  const buddies = useBuddies((state) => state.buddies)
  const cars = useSharedCars((state) => state.cars)
  const memberships = useSharedCars((state) => state.memberships)
  const { now } = useNow()
  if (!enabled || !buddiesEnabled || !started) return []

  const openMileage = () => navigation.navigate('Mileage')
  const openPeople = (vehicleId: string) =>
    navigation.navigate('MileageVehicleForm', { vehicleId })

  return queue
    .filter(isCarNotification)
    .flatMap((entry): NotificationItem[] => {
      const invite =
        entry.kind === 'carInvite' && entry.shareKey
          ? carInvites[entry.shareKey]
          : undefined
      const spaceId = invite?.spaceId ?? entry.spaceId
      const car = spaceId ? cars[spaceId] : undefined
      const answer =
        entry.kind === 'carInvite'
          ? carInviteAnswer(invite, {
              onCar:
                car !== undefined ||
                (spaceId !== undefined && isOnSharedCar(memberships, spaceId)),
              now,
            })
          : undefined
      if (answer === null) return []
      // The invitation's name until the car is here; the car's own after.
      const carName = car?.vehicles[0]?.name || invite?.name || undefined
      // Answering is what clears an invitation; until then it can't be
      // dismissed, and it survives Clear All.
      const awaitsAnswer = answer === 'open'
      const buddy = buddies.find((b) => b.inboxId === entry.from)
      const vehicleId = car?.vehicles[0]?.id
      const open =
        entry.kind === 'carJoined' && vehicleId
          ? () => openPeople(vehicleId)
          : openMileage
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
            <SharedCarNotificationRow
              entry={entry}
              answer={answer}
              people={invite?.people}
              car={carName}
              unread={unread}
              onDismiss={awaitsAnswer ? undefined : dismiss}
              onPress={car ? () => closeThen(open) : undefined}
              onJoined={() => closeThen(openMileage)}
            />
          ),
        },
      ]
    })
}
