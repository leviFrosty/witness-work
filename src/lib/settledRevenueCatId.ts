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

/**
 * The account's RevenueCat id once this launch has settled it (ADR 0040 §7,
 * docs/web-purchases.md "Buy waits for a settled id"), for web Buy. A complete
 * Cloud Sync pull set the peers' claims, `AccountProvider` reconciled against
 * them, finished any adoption it decided (`Purchases.logIn` included), and the
 * SDK is logged in as the id it settled on.
 *
 * Settled against one complete pull's claims: a reset (another account, none, a
 * new account key), other claims arriving (from any pull, complete or not), or
 * another account id unsettles it until reconcile passes again. Never taken
 * from a URL, and never shown, logged or sent to analytics. In memory only, and
 * free of native imports.
 */

/** What a reconcile pass decided against, read before it decides. */
export type SettledPull = {
  generation: number
  peers: readonly AccountClaim[]
}

type Settled = SettledPull & { id: string }

let settled: Settled | null = null
/**
 * The claims array the latest complete pull set, or null before one. An
 * incomplete pull also sets the peers' claims, and may miss some.
 */
let completePeers: readonly AccountClaim[] | null = null
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

/**
 * Whether the peers' claims are still the very ones the latest complete pull
 * set.
 */
const onCompletePullsClaims = (): boolean =>
  completedPullThisLaunch() && peerAccountClaims() === completePeers

/**
 * The complete pull a reconcile pass is about to decide against, or null when
 * this launch hasn't had one, or a later incomplete pull set other claims:
 * nothing it decides now can settle the id.
 */
export const currentSettledPull = (): SettledPull | null =>
  onCompletePullsClaims()
    ? { generation: completePullGeneration(), peers: peerAccountClaims() }
    : null

/**
 * The settled id, or null. Still the latest complete pull's: the same account
 * generation, and the very claims it set (the registry keeps their array until
 * they change).
 */
export const settledRevenueCatId = (): string | null =>
  settled &&
  onCompletePullsClaims() &&
  settled.generation === completePullGeneration() &&
  settled.peers === completePeers
    ? settled.id
    : null

/**
 * A reconcile pass that decided against `pull` keeps `id`, which RevenueCat is
 * logged in as. An id ww-api wouldn't accept (RevenueCat's anonymous one)
 * settles nothing.
 */
export function settleRevenueCatId(id: string, pull: SettledPull): void {
  const before = settledRevenueCatId()
  const valid = toRevenueCatAppUserId(id)
  settled = valid ? { id: valid, ...pull } : null
  if (settledRevenueCatId() !== before) notify()
}

/** Another account id, or an adoption under way: unsettled until reconcile. */
export function clearSettledRevenueCatId(): void {
  if (!settled) return
  const before = settledRevenueCatId()
  settled = null
  if (before !== null) notify()
}

// Registered on import, so before any listener that reads it: each complete
// pull's claims are noted before reconcile hears of the pull. A reset drops the
// settled id for good: its generation never comes back.
onCompletedPull(() => {
  if (completedPullThisLaunch()) {
    completePeers = peerAccountClaims()
    return
  }
  completePeers = null
  clearSettledRevenueCatId()
})

/**
 * Calls `listener` when the settled id may have changed: settled, cleared, a
 * complete pull or a reset, or the peers' claims changing. Returns the
 * unsubscribe.
 */
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
