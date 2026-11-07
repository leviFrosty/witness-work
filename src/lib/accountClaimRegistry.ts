import type { AccountClaim } from '@/lib/accountClaim'

const claimKey = (c: AccountClaim | null) =>
  c
    ? `${c.appUserId}|${c.entitled ? 1 : 0}|${c.claimedAt}|${c.account ?? ''}`
    : ''

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

export const ownAccountClaim = (): AccountClaim | null => own

export const setOwnAccountClaim = (claim: AccountClaim | null): void => {
  if (claimKey(own) === claimKey(claim)) return
  own = claim
  notify(ownListeners)
}

export const onOwnAccountClaimChange = (listener: () => void): (() => void) => {
  ownListeners.add(listener)
  return () => ownListeners.delete(listener)
}

export const peerAccountClaims = (): readonly AccountClaim[] => peers

export const setPeerAccountClaims = (claims: readonly AccountClaim[]): void => {
  const key = claimsKey(claims)
  if (key === peersKey) return
  peers = claims
  peersKey = key
  notify(peerListeners)
}

export const onPeerAccountClaimsChange = (
  listener: () => void
): (() => void) => {
  peerListeners.add(listener)
  return () => peerListeners.delete(listener)
}
