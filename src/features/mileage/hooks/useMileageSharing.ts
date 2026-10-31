import { createContext, useContext, useSyncExternalStore } from 'react'
import useSharedCars from '@/stores/sharedCars'
import {
  buildMileagePeople,
  type MileageBuddy,
  type MileagePeople,
} from '@/lib/mileage/people'

/** What leaving every Shared Car left undone. */
export type SharedCarsLeft = {
  /**
   * The cars the server hasn't heard the User leave yet, each by its name
   * (empty when it never synced here). Trying again tries them again.
   */
  notLeft: readonly { name: string }[]
}

/**
 * What Mileage needs from Shared Cars that lives outside it: whether sharing
 * shows at all, the User's buddies (so people on a car show as the User knows
 * them), and the engine's sync and leave. Mileage can't import Buddies or the
 * app tier (feature boundary), so the app provides it
 * (`MileageSharingProvider`). Without a provider, sharing is off: nothing new
 * shows, and the cars themselves still read from `useSharedCars`.
 */
export type MileageSharing = {
  /**
   * The `shared-cars` flag is on and Buddies is available: the User can share a
   * car, invite, and sync. A Shared Car already on the device shows either way,
   * with who logged its trips, and the User can always leave it.
   */
  enabled: boolean
  /** The User's active buddies. */
  buddies: readonly MileageBuddy[]
  /** The name the User's cars show for them (their Buddy Card's). */
  ownName: string
  /** Syncs every Shared Car now (pull to refresh); never throws. */
  sync: () => Promise<void>
  /**
   * Leaves every Shared Car, each leaving a copy in the User's own cars (Delete
   * All Mileage Data), and says which the server hasn't heard leave yet; never
   * throws.
   */
  leaveAll: () => Promise<SharedCarsLeft>
}

export const NO_MILEAGE_SHARING: MileageSharing = {
  enabled: false,
  buddies: [],
  ownName: '',
  sync: async () => {},
  leaveAll: async () => ({ notLeft: [] }),
}

export const MileageSharingContext =
  createContext<MileageSharing>(NO_MILEAGE_SHARING)

export default function useMileageSharing(): MileageSharing {
  return useContext(MileageSharingContext)
}

/**
 * Who's who on the User's Shared Cars now, for code that reads it once (a
 * trip's share text) rather than drawing it.
 */
export const currentMileagePeople = (
  buddies: readonly MileageBuddy[]
): MileagePeople => buildMileagePeople(useSharedCars.getState().cars, buddies)

/**
 * Who's who on the User's Shared Cars, and who logged each trip
 * (`@/lib/mileage/people`). Re-renders only when that changes: a sync's
 * bookkeeping (`seq`, `pendingPuts`, `lastSyncedAt`) leaves it as it was.
 */
export function useMileagePeople(): MileagePeople {
  const { buddies } = useMileageSharing()
  return useSyncExternalStore(useSharedCars.subscribe, () =>
    currentMileagePeople(buddies)
  )
}
