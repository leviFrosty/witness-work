import { useEffect, useRef } from 'react'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { useFeatureFlag } from '@/lib/featureFlags'
import { logger } from '@/lib/logger'
import { hasCapability } from '@/lib/platformCapabilities'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import { useTerritories } from '@/features/territories/stores/territories'
import { startTerritoriesRuntime } from '@/app/territories/runtime'
import {
  territoriesEngine,
  territoryInvitations,
  territoryPrivacy,
} from '@/app/territories/territoriesService'

const registerPush = () =>
  void registerBuddiesPush().catch((error: unknown) =>
    logger.warn('[territories] push registration', error)
  )

export default function TerritoriesRuntime() {
  const enabled =
    useFeatureFlag('territories') && hasCapability('territorySharing')
  const buddies = useBuddiesSession((state) => state.running)

  useEffect(() => {
    if (!enabled) return
    const stop = startTerritoriesRuntime({
      engine: territoriesEngine,
      store: useTerritories,
      reconcileMemberships: territoryInvitations.reconcileMemberships,
      onMembershipsChanged: () => buddiesEngine.noteCarMemberships(),
      adopt: async (mark) => {
        if (useUpdateRequired.getState().required) return
        await territoriesEngine.adoptOwnSpace(mark)
      },
      setRunning: (on) => useTerritoriesSession.setState({ running: on }),
      ready: () =>
        accountSessions.snapshot() !== null &&
        !useUpdateRequired.getState().required,
      watchPrivacy: (onChange) => {
        let on = territoryPrivacy()
        return usePreferences.subscribe(() => {
          const next = territoryPrivacy()
          if (next === on) return
          on = next
          if (!next) territoriesEngine.resyncWithoutPrivacy()
          useTerritories.getState().reproject()
          onChange()
        })
      },
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
  }, [enabled])

  const buddiesBefore = useRef(buddies)
  useEffect(() => {
    const started = buddies && !buddiesBefore.current
    buddiesBefore.current = buddies
    if (!enabled || !started) return
    territoryInvitations.reconcileMemberships()
    buddiesEngine.noteCarMemberships()
  }, [enabled, buddies])

  return null
}
