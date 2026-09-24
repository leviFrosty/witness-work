import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import useServiceReport from '@/stores/serviceReport'
import { fromB64u } from '@/features/buddies/lib/bytes'
import { createBuddiesEngine } from '@/features/buddies/lib/engine'
import { randomBytes } from '@/features/buddies/lib/random'
import { createRelayClient } from '@/features/buddies/lib/relay'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** The app's single Buddies engine: Keychain seed + relay + local stores. */
export const buddiesEngine = createBuddiesEngine({
  relay: createRelayClient({ baseUrl: apis.buddies, randomBytes }),
  store: useBuddies,
  randomBytes,
  now: Date.now,
  getRootSeed: () => fromB64u(BuddiesKeychain.getOrCreateRootSeed()),
  deleteRootSeed: () => BuddiesKeychain.deleteRootSeed(),
  getPlans: () => {
    const { dayPlans, recurringPlans } = useServiceReport.getState()
    return { dayPlans, recurringPlans }
  },
})
