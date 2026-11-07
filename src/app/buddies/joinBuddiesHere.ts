import { deviceAccountKey } from '@/lib/accountKey'
import { canSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { fromB64u } from '@/lib/bytes'
import { fetchServerAccountInfo } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export type JoinBuddiesReason = 'sync' | 'handoff' | 'passkey'

let joining: Promise<boolean> | null = null

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
    (usePreferences.getState().lastiCloudPulledAt === null || !canSync())
  )
    return false
  const seed = await deviceAccountKey.peek()
  if (!seed || started()) return false
  if (reason !== 'sync' && !(await usesBuddiesElsewhere(fromB64u(seed))))
    return false
  await buddiesEngine.sync({ automatic: true })
  if (!started()) return false

  useBuddies.setState({ onboardingComplete: true })
  analytics.capture('buddies_device_joined', {
    buddies: useBuddies.getState().buddies.length,
    via: reason,
  })
  return true
}

async function usesBuddiesElsewhere(seed: Uint8Array): Promise<boolean> {
  const info = await fetchServerAccountInfo(seed)
  return info.inboxIds.includes(deriveIdentity(seed).inboxId)
}
