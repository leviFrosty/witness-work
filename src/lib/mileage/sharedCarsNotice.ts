import type { Online } from '@/lib/http/online'
import type { SharedCarsSessionState } from '@/stores/sharedCarsSession'

/**
 * Why changes to the User's Shared Cars aren't being shared right now, for the
 * slim notice on the Mileage screen and a Shared Car's form
 * (docs/shared-cars-protocol.md, "Client behaviour"): the app needs an update,
 * the account is suspended, sharing is switched off (the server's switch, or
 * Shared Cars off on this device), this device is offline, nothing vouches for
 * a car's key here yet ("Trusted keys"), its clock is so far ahead that changes
 * are held back, or a change is too large to share. Changes made meanwhile stay
 * on the device and go out once a sync works.
 */
export type SharedCarsNotice =
  | 'updateRequired'
  | 'suspended'
  | 'disabled'
  | 'offline'
  | 'waiting'
  | 'held'
  | 'tooLarge'
  | null

export function sharedCarsNotice({
  hasSharedCars,
  sharing = true,
  online,
  session,
  updateRequired,
  spaceId,
}: {
  hasSharedCars: boolean
  /**
   * Shared Cars runs on this device (its flag, and Buddies). Off, a Shared Car
   * already here still shows, but nothing syncs.
   */
  sharing?: boolean
  online: Online
  session: Pick<SharedCarsSessionState, 'suspended' | 'disabled' | 'cars'>
  /** The app is below the version ww-api asks for. */
  updateRequired: boolean
  /** One car's notice (its form); every car's without it. */
  spaceId?: string
}): SharedCarsNotice {
  if (!hasSharedCars) return null
  const statuses =
    spaceId === undefined
      ? Object.values(session.cars)
      : session.cars[spaceId]
        ? [session.cars[spaceId]]
        : []
  const errors = new Set(
    statuses.flatMap((car) => (car.lastError ? [car.lastError] : []))
  )
  if (updateRequired || errors.has('upgrade_required')) return 'updateRequired'
  if (session.suspended || errors.has('suspended')) return 'suspended'
  if (!sharing || session.disabled || errors.has('disabled')) return 'disabled'
  if (online === false || errors.has('network') || errors.has('timeout'))
    return 'offline'
  if (statuses.some((car) => car.waitingForKey)) return 'waiting'
  if (statuses.some((car) => (car.held ?? 0) > 0)) return 'held'
  if (statuses.some((car) => (car.tooLarge ?? 0) > 0)) return 'tooLarge'
  return null
}
