import type { ReactNode } from 'react'
import useTheme from '@/contexts/theme'
import { useFeatureFlag } from '@/lib/featureFlags'
import { logger } from '@/lib/logger'
import type { MileageBuddy } from '@/lib/mileage/people'
import { buddyProfileAvatar } from '@/features/buddies/components/BuddyAvatar'
import useBuddiesCardName from '@/features/buddies/hooks/useBuddiesCardName'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useSharedCars from '@/stores/sharedCars'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  MileageSharingContext,
  type MileageSharing,
  type SharedCarsLeft,
} from '@/features/mileage/hooks/useMileageSharing'
import {
  leaveAllSharedCars,
  sharedCarsFailureName,
  syncSharedCars,
} from '@/app/sharedCars/sharedCarsService'

const sync = async () => {
  await syncSharedCars().catch((error: unknown) =>
    logger.warn(`[sharedCars] refresh: ${sharedCarsFailureName(error)}`)
  )
}

/**
 * Leaves every Shared Car. It runs whether or not Shared Cars is on here, since
 * the way off a car stays open. When it fails outright, every car still here
 * counts as not left.
 */
const leaveAll = async (): Promise<SharedCarsLeft> => {
  try {
    return await leaveAllSharedCars()
  } catch (error) {
    logger.warn(`[sharedCars] leave all: ${sharedCarsFailureName(error)}`)
    return {
      notLeft: Object.values(useSharedCars.getState().cars).map((car) => ({
        name: car.vehicles[0]?.name ?? '',
      })),
    }
  }
}

/**
 * Hands Mileage what it needs from Shared Cars and Buddies, which it can't
 * import (feature boundary): whether sharing runs (the `shared-cars` flag with
 * Buddies available), the User's buddies as they know them, the name on their
 * Buddy Card, and the engine's sync and leave. Around the whole stack, so every
 * Mileage screen and sheet reads the same.
 */
export default function MileageSharingProvider({
  children,
}: {
  children: ReactNode
}) {
  const theme = useTheme()
  const flag = useFeatureFlag('shared-cars')
  const buddiesEnabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const ownName = useBuddiesCardName()

  const known: MileageBuddy[] = buddies
    .filter((buddy) => buddy.status === 'active')
    .map((buddy) => ({
      inboxId: buddy.inboxId,
      name: buddyDisplayName(buddy),
      avatar: buddyProfileAvatar(buddy.avatar),
      color: buddyColor(theme, buddy),
    }))
  const value: MileageSharing = {
    enabled: flag && buddiesEnabled,
    buddies: known,
    ownName,
    sync,
    leaveAll,
  }

  return (
    <MileageSharingContext.Provider value={value}>
      {children}
    </MileageSharingContext.Provider>
  )
}
