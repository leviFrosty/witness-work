import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { canSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

let joining: Promise<boolean> | null = null

/**
 * Starts Buddies on this device when the User already uses it on another one:
 * the root seed is here (iCloud Keychain brought it, or it outlived a
 * reinstall) and iCloud Sync keeps this device's Plans the same as theirs. The
 * first sync registers this device, restores buddies, answers, and the
 * notification bell from the roster, and the runtime then registers it for
 * pushes. Without iCloud Sync this device's Plans differ, and its Buddy Card
 * would replace the other device's, so it waits for the User to open Buddies
 * here. Reading the seed is local; a device without one costs nothing. Resolves
 * whether Buddies started.
 */
export function joinBuddiesHere(): Promise<boolean> {
  joining ??= join().finally(() => {
    joining = null
  })
  return joining
}

async function join(): Promise<boolean> {
  const started = () => useBuddies.getState().registeredInboxId !== null
  if (started()) return false
  // Pulled at least once, so the Plans buddies see are already here.
  if (usePreferences.getState().lastiCloudPulledAt === null || !canSync())
    return false
  const seed = await BuddiesKeychain.peekRootSeed()
  if (!seed || started()) return false
  await buddiesEngine.sync({ automatic: true })
  if (!started()) return false
  // Set up on the other device: no first-visit intro here.
  useBuddies.setState({ onboardingComplete: true })
  analytics.capture('buddies_device_joined', {
    buddies: useBuddies.getState().buddies.length,
  })
  return true
}
