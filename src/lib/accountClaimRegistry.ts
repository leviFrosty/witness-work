import type { AccountClaim } from '@/lib/accountClaim'

/**
 * The RevenueCat claims this launch knows about (ADR 0040 §7): this device's
 * own, which its sync payload publishes, and its peers', which the sync engine
 * read from their payloads on its last pull. `AccountProvider` sets the first
 * and reconciles on the second; the sync engine does the reverse. In memory
 * only, and free of native imports so the payload builder can read it.
 */

const claimKey = (c: AccountClaim | null) =>
  c ? `${c.appUserId}|${c.entitled ? 1 : 0}|${c.claimedAt}` : ''

const claimsKey = (claims: readonly AccountClaim[]) =>
  claims.map(claimKey).sort().join('\n')

let own: AccountClaim | null = null
let peers: readonly AccountClaim[] = []
let peersKey = ''
const ownListeners = new Set<() => void>()
const peerListeners = new Set<() => void>()

const notify = (listeners: Set<() => void>) => {
  for (const listener of listeners) listener()
}

/** This device's claim, for its sync payload; null until it's known. */
export const ownAccountClaim = (): AccountClaim | null => own

/** Sets this device's claim; listeners hear only a real change. */
export const setOwnAccountClaim = (claim: AccountClaim | null): void => {
  if (claimKey(own) === claimKey(claim)) return
  own = claim
  notify(ownListeners)
}

/** Calls `listener` when this device's claim changes. Returns the unsubscribe. */
export const onOwnAccountClaimChange = (listener: () => void): (() => void) => {
  ownListeners.add(listener)
  return () => ownListeners.delete(listener)
}

/** The claims in the peers' payloads the last pull read. */
export const peerAccountClaims = (): readonly AccountClaim[] => peers

/** Replaces the peers' claims; listeners hear only a real change. */
export const setPeerAccountClaims = (claims: readonly AccountClaim[]): void => {
  const key = claimsKey(claims)
  if (key === peersKey) return
  peers = claims
  peersKey = key
  notify(peerListeners)
}

/** Calls `listener` when the peers' claims change. Returns the unsubscribe. */
export const onPeerAccountClaimsChange = (
  listener: () => void
): (() => void) => {
  peerListeners.add(listener)
  return () => peerListeners.delete(listener)
}
