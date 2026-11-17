import { deviceAccountKey } from '@/lib/accountKey'
import { canSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { fromB64u } from '@/lib/bytes'
import { fetchServerAccountInfo } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { syncReadInbox } from '@/features/buddies/lib/syncStatus'
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

const syncReady = () =>
  usePreferences.getState().lastiCloudPulledAt !== null && canSync()

async function join(reason: JoinBuddiesReason): Promise<boolean> {
  if (started()) return false
  if (reason === 'sync' && !syncReady()) return false
  const seed = await deviceAccountKey.peek()
  if (!seed || started()) return false
  if (reason !== 'sync' && !(await usesBuddiesElsewhere(fromB64u(seed))))
    return false
  const startedAt = Date.now()
  try {
    await buddiesEngine.sync({ automatic: true })
  } catch (error) {
    const registered = started()
    if (
      registered &&
      syncReadInbox(useBuddies.getState().lastSyncAt, startedAt)
    )
      return joined(reason)
    analytics.capture('buddies_device_join_failed', {
      via: reason,
      reason: buddiesFailureReason(error),
      registered,
    })
    if (registered) finishOnFirstRead(reason, startedAt)
    throw error
  }
  if (!started()) return false
  return joined(reason)
}

function joined(reason: JoinBuddiesReason): true {
  stopWaiting?.()
  stopWaiting = null
  useBuddies.setState({ onboardingComplete: true })
  analytics.capture('buddies_device_joined', {
    buddies: useBuddies.getState().buddies.length,
    via: reason,
  })
  return true
}

let stopWaiting: (() => void) | null = null

function finishOnFirstRead(reason: JoinBuddiesReason, startedAt: number) {
  stopWaiting?.()
  const stop = useBuddies.subscribe((state) => {
    if (state.registeredInboxId === null) {
      stop()
      if (stopWaiting === stop) stopWaiting = null
      return
    }
    if (syncReadInbox(state.lastSyncAt, startedAt)) joined(reason)
  })
  stopWaiting = stop
}

async function usesBuddiesElsewhere(seed: Uint8Array): Promise<boolean> {
  const info = await fetchServerAccountInfo(seed)
  return info.inboxIds.includes(deriveIdentity(seed).inboxId)
}

export async function buddiesOnTheirWay(): Promise<boolean> {
  const { onboardingComplete, lastSyncAt } = useBuddies.getState()
  if (onboardingComplete || lastSyncAt > 0) return false
  if (!usePreferences.getState().iCloudSyncEnabled) return false
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (!seed) return false
  return usesBuddiesElsewhere(fromB64u(seed)).catch(() => false)
}
