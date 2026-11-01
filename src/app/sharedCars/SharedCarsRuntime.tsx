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

const registerPush = () =>
  void registerBuddiesPush().catch((error: unknown) =>
    logger.warn('[sharedCars] push registration', error)
  )

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
        if (!carInvitations.isMergingRoster())
          buddiesEngine.noteCarMemberships()
      },
      watchProfile: watchSharedCarProfile,
      ready: () =>
        accountSessions.snapshot() !== null &&
        !useUpdateRequired.getState().required,
      watchReady: (onChange) => {
        let watching = true

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
