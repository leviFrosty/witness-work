import { beforeEach, describe, expect, it, vi } from 'vitest'

type Store = typeof import('@/lib/settledRevenueCatId')
type Pull = typeof import('@/lib/cloudSyncPullSettled')
type Registry = typeof import('@/lib/accountClaimRegistry')
let store: Store
let pull: Pull
let registry: Registry

const OWN = 'ww_browser_0123456789'
const PHONE = 'aaaaaaaa-0000-4000-8000-00000000000a'

beforeEach(async () => {
  vi.resetModules()
  store = await import('@/lib/settledRevenueCatId')
  pull = await import('@/lib/cloudSyncPullSettled')
  registry = await import('@/lib/accountClaimRegistry')
})

/** A complete pull that read `claims` from the peers' slots. */
const completePull = (
  claims: Parameters<Registry['setPeerAccountClaims']>[0]
) => {
  registry.setPeerAccountClaims(claims)
  pull.markCompletePull()
}

/** A reconcile pass deciding against the latest pull, then settling on `id`. */
const settleNow = (id: string) => {
  const seen = store.currentSettledPull()
  if (!seen) throw new Error('no complete pull')
  store.settleRevenueCatId(id, seen)
}

describe('settledRevenueCatId', () => {
  it('is null until a complete pull, and nothing can settle it before one', () => {
    expect(store.settledRevenueCatId()).toBeNull()
    expect(store.currentSettledPull()).toBeNull()
  })

  it('settles on the id a pass decided against the latest pull', () => {
    completePull([])
    const listener = vi.fn()
    store.onSettledRevenueCatIdChange(listener)
    settleNow(OWN)
    expect(store.settledRevenueCatId()).toBe(OWN)
    expect(listener).toHaveBeenCalled()
  })

  it('never settles on an id ww-api would refuse, such as an anonymous one', () => {
    completePull([])
    settleNow('$RCAnonymousID:0123456789abcdef')
    expect(store.settledRevenueCatId()).toBeNull()
    settleNow('short')
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('stays settled across a later pull with the same claims', () => {
    completePull([{ appUserId: PHONE, entitled: false, claimedAt: 5 }])
    settleNow(PHONE)
    completePull([{ appUserId: PHONE, entitled: false, claimedAt: 5 }])
    expect(store.settledRevenueCatId()).toBe(PHONE)
  })

  it('unsettles when a pull brings other claims, until a pass settles again', () => {
    completePull([])
    settleNow(OWN)
    const listener = vi.fn(() => store.settledRevenueCatId())
    store.onSettledRevenueCatIdChange(listener)
    completePull([{ appUserId: PHONE, entitled: true, claimedAt: 9 }])
    expect(store.settledRevenueCatId()).toBeNull()
    expect(listener).toHaveLastReturnedWith(null)
    settleNow(PHONE)
    expect(store.settledRevenueCatId()).toBe(PHONE)
  })

  it("unsettles on an incomplete pull's claims, and settles nothing on them", () => {
    const entitled = { appUserId: PHONE, entitled: true, claimedAt: 9 }
    completePull([entitled])
    settleNow(OWN)
    expect(store.settledRevenueCatId()).toBe(OWN)
    // A pull that couldn't open the phone's slot: its entitled claim is missing.
    registry.setPeerAccountClaims([])
    expect(store.settledRevenueCatId()).toBeNull()
    expect(store.currentSettledPull()).toBeNull()
    // The next complete pull brings it back; a pass settles against it again.
    completePull([entitled])
    expect(store.currentSettledPull()?.peers).toEqual([entitled])
    settleNow(OWN)
    expect(store.settledRevenueCatId()).toBe(OWN)
  })

  it('settles nothing on claims set after the latest complete pull', () => {
    completePull([])
    // An incomplete pull read a claim the complete one didn't.
    registry.setPeerAccountClaims([
      { appUserId: PHONE, entitled: false, claimedAt: 5 },
    ])
    expect(store.currentSettledPull()).toBeNull()
  })

  it('ignores a pass that decided against an earlier pull', () => {
    completePull([])
    const stale = store.currentSettledPull()!
    completePull([{ appUserId: PHONE, entitled: true, claimedAt: 9 }])
    store.settleRevenueCatId(OWN, stale)
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('is cleared by a reset (key change, leaving the account, sign-out)', () => {
    completePull([])
    settleNow(OWN)
    const listener = vi.fn(() => store.settledRevenueCatId())
    store.onSettledRevenueCatIdChange(listener)
    pull.resetCompletePull()
    expect(store.settledRevenueCatId()).toBeNull()
    expect(listener).toHaveLastReturnedWith(null)
    // The next account's first complete pull doesn't bring it back.
    completePull([])
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('ignores a pass that decided before a reset', () => {
    completePull([])
    const before = store.currentSettledPull()!
    pull.resetCompletePull()
    completePull([])
    store.settleRevenueCatId(OWN, before)
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('is cleared when the account id changes', () => {
    completePull([])
    settleNow(OWN)
    const listener = vi.fn()
    store.onSettledRevenueCatIdChange(listener)
    store.clearSettledRevenueCatId()
    expect(store.settledRevenueCatId()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops calling a listener once it unsubscribes', () => {
    const listener = vi.fn()
    store.onSettledRevenueCatIdChange(listener)()
    completePull([{ appUserId: PHONE, entitled: true, claimedAt: 9 }])
    settleNow(PHONE)
    expect(listener).not.toHaveBeenCalled()
  })
})
