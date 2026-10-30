import { deviceAccountKey } from '@/lib/accountKey'
import { canSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { fromB64u } from '@/lib/bytes'
import { fetchServerAccountInfo } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Why this device may start Buddies on its own:
 *
 * - `sync`: the root seed is here (iCloud Keychain brought it, or it outlived a
 *   reinstall) and iCloud Sync keeps this device's Plans the same as theirs.
 * - `handoff`: the User just moved their account here (Set Up Another Device, ADR
 *   0026), so this is the phone they mean to use Buddies on.
 */
export type JoinBuddiesReason = 'sync' | 'handoff'

let joining: Promise<boolean> | null = null

/**
 * Starts Buddies on this device when the User already uses it on another one.
 * The first sync registers this device, restores buddies, answers, and the
 * notification bell from the roster, and the runtime then registers it for
 * pushes.
 *
 * With `sync`, it waits for iCloud Sync's first pull: without it this device's
 * Plans differ, and its Buddy Card would replace the other device's, so it
 * waits for the User to open Buddies here. With `handoff`, the account's own
 * record says whether Buddies is in use: only when the account key's inbox is
 * linked to the account does it start, so a User who never used Buddies doesn't
 * get an inbox. Reading the seed is local; a device without one costs nothing.
 * Resolves whether Buddies started.
 */
export function joinBuddiesHere(
  reason: JoinBuddiesReason = 'sync'
): Promise<boolean> {
  joining ??= join(reason).finally(() => {
    joining = null
  })
  return joining
}

const started = () => useBuddies.getState().registeredInboxId !== null

async function join(reason: JoinBuddiesReason): Promise<boolean> {
  if (started()) return false
  if (
    reason === 'sync' &&
    // Pulled at least once, so the Plans buddies see are already here.
    (usePreferences.getState().lastiCloudPulledAt === null || !canSync())
  )
    return false
  const seed = await deviceAccountKey.peek()
  if (!seed || started()) return false
  if (reason === 'handoff' && !(await usesBuddiesElsewhere(fromB64u(seed))))
    return false
  await buddiesEngine.sync({ automatic: true })
  if (!started()) return false
  // Set up on the other device: no first-visit intro here.
  useBuddies.setState({ onboardingComplete: true })
  analytics.capture('buddies_device_joined', {
    buddies: useBuddies.getState().buddies.length,
    via: reason,
  })
  return true
}

/** Whether the account has this key's Buddies inbox linked to it. */
async function usesBuddiesElsewhere(seed: Uint8Array): Promise<boolean> {
  const info = await fetchServerAccountInfo(seed)
  return info.inboxIds.includes(deriveIdentity(seed).inboxId)
}
