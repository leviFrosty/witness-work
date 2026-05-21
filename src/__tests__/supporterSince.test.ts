import { describe, it, expect } from 'vitest'
import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
} from 'react-native-purchases'
import {
  LIFETIME_SUPPORTER_ENTITLEMENT,
  supporterSinceDate,
} from '@/lib/supporterSince'

const entitlement = (
  overrides: Partial<PurchasesEntitlementInfo> &
    Pick<PurchasesEntitlementInfo, 'identifier' | 'productIdentifier'>
): PurchasesEntitlementInfo =>
  ({
    isActive: true,
    willRenew: true,
    periodType: 'NORMAL',
    latestPurchaseDate: '2026-01-01T00:00:00Z',
    originalPurchaseDate: '2026-01-01T00:00:00Z',
    expirationDate: null,
    store: 'APP_STORE',
    isSandbox: true,
    unsubscribeDetectedAt: null,
    billingIssueDetectedAt: null,
    ownershipType: 'PURCHASED',
    verification: 'NOT_REQUESTED',
    ...overrides,
  }) as PurchasesEntitlementInfo

const customer = (overrides: {
  active?: Record<string, PurchasesEntitlementInfo>
  activeSubscriptions?: string[]
}): CustomerInfo =>
  ({
    entitlements: {
      active: overrides.active ?? {},
      all: overrides.active ?? {},
    },
    activeSubscriptions: overrides.activeSubscriptions ?? [],
  }) as unknown as CustomerInfo

describe('supporterSinceDate', () => {
  it('returns null when customer is null', () => {
    expect(supporterSinceDate(null)).toBeNull()
  })

  it('returns null when there are no active entitlements', () => {
    expect(supporterSinceDate(customer({}))).toBeNull()
  })

  it('returns null for a one-time tip whose entitlement is not in activeSubscriptions', () => {
    // Tip products may have an entitlement attached in RC but never appear in
    // `activeSubscriptions` — they must not grant supporter status.
    const result = supporterSinceDate(
      customer({
        active: {
          'One Time Donator': entitlement({
            identifier: 'One Time Donator',
            productIdentifier: 'tip_product_1',
            originalPurchaseDate: '2024-06-01T00:00:00Z',
          }),
        },
        activeSubscriptions: [],
      })
    )
    expect(result).toBeNull()
  })

  it('returns the purchase date for an active monthly subscription', () => {
    const result = supporterSinceDate(
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'monthly_supporter',
            originalPurchaseDate: '2025-03-15T00:00:00Z',
          }),
        },
        activeSubscriptions: ['monthly_supporter'],
      })
    )
    expect(result?.toISOString()).toBe('2025-03-15T00:00:00.000Z')
  })

  it('returns the grant date for a Lifetime Supporter promotional entitlement', () => {
    // Promotional lifetime entitlements have no real App Store product and so
    // never appear in `activeSubscriptions` — they must still grant supporter.
    const result = supporterSinceDate(
      customer({
        active: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: entitlement({
            identifier: LIFETIME_SUPPORTER_ENTITLEMENT,
            productIdentifier: 'rc_promo_lifetime_supporter_lifetime',
            originalPurchaseDate: '2026-05-19T12:00:00Z',
          }),
        },
        activeSubscriptions: [],
      })
    )
    expect(result?.toISOString()).toBe('2026-05-19T12:00:00.000Z')
  })

  it('returns the earliest qualifying date when both subscription and lifetime grant exist', () => {
    const result = supporterSinceDate(
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'monthly_supporter',
            originalPurchaseDate: '2024-01-01T00:00:00Z',
          }),
          [LIFETIME_SUPPORTER_ENTITLEMENT]: entitlement({
            identifier: LIFETIME_SUPPORTER_ENTITLEMENT,
            productIdentifier: 'rc_promo_lifetime_supporter_lifetime',
            originalPurchaseDate: '2026-05-19T12:00:00Z',
          }),
        },
        activeSubscriptions: ['monthly_supporter'],
      })
    )
    expect(result?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('keeps supporter status from lifetime even when subscription has lapsed', () => {
    // A user who once subscribed and was later gifted lifetime: the
    // subscription is no longer in `activeSubscriptions`, but the lifetime
    // entitlement keeps them a supporter.
    const result = supporterSinceDate(
      customer({
        active: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: entitlement({
            identifier: LIFETIME_SUPPORTER_ENTITLEMENT,
            productIdentifier: 'rc_promo_lifetime_supporter_lifetime',
            originalPurchaseDate: '2026-05-19T12:00:00Z',
          }),
        },
        activeSubscriptions: [],
      })
    )
    expect(result?.toISOString()).toBe('2026-05-19T12:00:00.000Z')
  })

  it('returns null when a revoked lifetime entitlement is absent from active', () => {
    // Revoking via the RC dashboard removes the entitlement from
    // `entitlements.active`, so supporter status drops on the next refresh.
    const result = supporterSinceDate(
      customer({
        active: {},
        activeSubscriptions: [],
      })
    )
    expect(result).toBeNull()
  })

  it('ignores invalid date strings without throwing', () => {
    const result = supporterSinceDate(
      customer({
        active: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: entitlement({
            identifier: LIFETIME_SUPPORTER_ENTITLEMENT,
            productIdentifier: 'rc_promo_lifetime_supporter_lifetime',
            originalPurchaseDate: 'not-a-date',
          }),
        },
      })
    )
    expect(result).toBeNull()
  })
})
