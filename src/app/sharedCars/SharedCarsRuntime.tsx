import { useEffect } from 'react'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { useFeatureFlag } from '@/lib/featureFlags'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import useSharedCars from '@/stores/sharedCars'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import {
  carInvitations,
  watchSharedCarProfile,
} from '@/app/sharedCars/carInvitationsService'
import { startSharedCarsRuntime } from '@/app/sharedCars/runtime'
import { sharedCarsEngine } from '@/app/sharedCars/sharedCarsService'

/**
 * Shared Cars' alerts (`car.invite`, `car.reply`) are registered only while it
 * runs, so a device with the flag off is never alerted to a car it can't open.
 */
const registerPush = () =>
  void registerBuddiesPush().catch((error: unknown) =>
    logger.warn('[sharedCars] push registration', error)
  )

/**
 * The background half of Shared Cars. Renders nothing; runs only while the
 * `shared-cars` flag is on and Buddies is running (the root seed and inbox that
 * Shared Cars builds on), syncing once an account session exists. Its cars
 * reach the User's other devices through the Buddies roster, and its
 * invitations go through Buddies (`carInvitationsService`).
 */
export default function SharedCarsRuntime() {
  const enabled = useFeatureFlag('shared-cars')
  const buddies = useBuddiesSession((state) => state.running)
  const running = enabled && buddies

  useEffect(() => {
    if (!running) return
    const stop = startSharedCarsRuntime({
      engine: sharedCarsEngine,
      store: useSharedCars,
      status: useSharedCarsSession,
      reconcileMemberships: carInvitations.reconcileMemberships,
      onMembershipsChanged: () => {
        // What another device's roster brought is in the roster already.
        if (!carInvitations.isMergingRoster())
          buddiesEngine.noteCarMemberships()
      },
      watchProfile: watchSharedCarProfile,
      ready: () =>
        accountSessions.snapshot() !== null &&
        !useUpdateRequired.getState().required,
      watchReady: (onChange) => {
        let watching = true
        // The stored session loads after launch; a new one opens later.
        void accountSessions.ready().then(() => {
          if (watching) onChange()
        })
        const account = onAccountChange(onChange)
        const update = useUpdateRequired.subscribe((state, previous) => {
          if (Boolean(state.required) !== Boolean(previous.required)) onChange()
        })
        return () => {
          watching = false
          account()
          update()
        }
      },
    })
    registerPush()
    return () => {
      stop()
      registerPush()
    }
  }, [running])

  return null
}
