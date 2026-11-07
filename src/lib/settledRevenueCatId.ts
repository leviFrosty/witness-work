import type { AccountClaim } from '@/lib/accountClaim'
import {
  onPeerAccountClaimsChange,
  peerAccountClaims,
} from '@/lib/accountClaimRegistry'
import {
  completedPullThisLaunch,
  completePullGeneration,
  onCompletedPull,
} from '@/lib/cloudSyncPullSettled'
import { toRevenueCatAppUserId } from '@/lib/serverAccount/revenueCatLink'

export type SettledPull = {
  generation: number
  peers: readonly AccountClaim[]
}

type Settled = SettledPull & { id: string }

let settled: Settled | null = null

let completePeers: readonly AccountClaim[] | null = null
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

const onCompletePullsClaims = (): boolean =>
  completedPullThisLaunch() && peerAccountClaims() === completePeers

export const currentSettledPull = (): SettledPull | null =>
  onCompletePullsClaims()
    ? { generation: completePullGeneration(), peers: peerAccountClaims() }
    : null

export const settledRevenueCatId = (): string | null =>
  settled &&
  onCompletePullsClaims() &&
  settled.generation === completePullGeneration() &&
  settled.peers === completePeers
    ? settled.id
    : null

export function settleRevenueCatId(id: string, pull: SettledPull): void {
  const before = settledRevenueCatId()
  const valid = toRevenueCatAppUserId(id)
  settled = valid ? { id: valid, ...pull } : null
  if (settledRevenueCatId() !== before) notify()
}

export function clearSettledRevenueCatId(): void {
  if (!settled) return
  const before = settledRevenueCatId()
  settled = null
  if (before !== null) notify()
}

onCompletedPull(() => {
  if (completedPullThisLaunch()) {
    completePeers = peerAccountClaims()
    return
  }
  completePeers = null
  clearSettledRevenueCatId()
})

export const onSettledRevenueCatIdChange = (
  listener: () => void
): (() => void) => {
  listeners.add(listener)
  const offPull = onCompletedPull(listener)
  const offPeers = onPeerAccountClaimsChange(listener)
  return () => {
    listeners.delete(listener)
    offPull()
    offPeers()
  }
}
