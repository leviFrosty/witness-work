import { describe, it, expect } from 'vitest'
import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'
import {
  LIFETIME_SUPPORTER_ENTITLEMENT,
  supporterSinceDate,
} from '@/lib/supporterSince'

// The tests below that pass no variant run as a production build
// (vitest.setup.ts).

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

const subscription = (
  overrides: Partial<PurchasesSubscriptionInfo> &
    Pick<PurchasesSubscriptionInfo, 'productIdentifier'>
): PurchasesSubscriptionInfo =>
  ({
    purchaseDate: '2026-01-01T00:00:00Z',
    originalPurchaseDate: '2026-01-01T00:00:00Z',
    expiresDate: '2099-01-01T00:00:00Z',
    store: 'APP_STORE',
    unsubscribeDetectedAt: null,
    isSandbox: false,
    billingIssuesDetectedAt: null,
    gracePeriodExpiresDate: null,
    ownershipType: 'PURCHASED',
    periodType: 'NORMAL',
    refundedAt: null,
    storeTransactionId: null,
    isActive: true,
    willRenew: true,
    ...overrides,
  }) as PurchasesSubscriptionInfo

const customer = (overrides: {
  active?: Record<string, PurchasesEntitlementInfo>
  activeSubscriptions?: string[]
  subscriptions?: PurchasesSubscriptionInfo[]
}): CustomerInfo =>
  ({
    entitlements: {
      active: overrides.active ?? {},
      all: overrides.active ?? {},
    },
    activeSubscriptions: overrides.activeSubscriptions ?? [],
    subscriptionsByProductIdentifier: Object.fromEntries(
      (overrides.subscriptions ?? []).map((s) => [s.productIdentifier, s])
    ),
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

  it('returns the purchase date for an active annual subscription', () => {
    const result = supporterSinceDate(
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'jwtime_4799_1yr',
            originalPurchaseDate: '2025-04-01T00:00:00Z',
          }),
        },
        activeSubscriptions: ['jwtime_4799_1yr'],
      })
    )
    expect(result?.toISOString()).toBe('2025-04-01T00:00:00.000Z')
  })

  it('matches a Google Play subscription listed as productId:basePlanId', () => {
    // Google Play lists active subscriptions with the base plan appended, but
    // the entitlement carries the bare product id.
    const result = supporterSinceDate(
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'witnesswork_supporter',
            productPlanIdentifier: 'annual-2899',
            store: 'PLAY_STORE',
            originalPurchaseDate: '2026-02-01T00:00:00Z',
          }),
        },
        activeSubscriptions: ['witnesswork_supporter:annual-2899'],
      })
    )
    expect(result?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('returns the grant date for an active promotional subscription grant', () => {
    // RC lists dashboard grants among subscriptions, so any active grant counts.
    const result = supporterSinceDate(
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'rc_promo_Monthly Donator_monthly',
            store: 'PROMOTIONAL',
            originalPurchaseDate: '2026-03-01T00:00:00Z',
          }),
        },
        activeSubscriptions: ['rc_promo_Monthly Donator_monthly'],
      })
    )
    expect(result?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('counts the subscription, not the tip, when a user has both', () => {
    const result = supporterSinceDate(
      customer({
        active: {
          'One Time Donator': entitlement({
            identifier: 'One Time Donator',
            productIdentifier: 'tip_product_1',
            originalPurchaseDate: '2024-06-01T00:00:00Z',
          }),
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
    // The Lifetime grant qualifies on its identifier alone, even when its
    // promotional product isn't in `activeSubscriptions`.
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

  describe('RevenueCat Billing sandbox purchases', () => {
    const webSandboxMonthly = (
      overrides: Partial<PurchasesEntitlementInfo> = {}
    ) =>
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'web_jwtime_399_1mo',
            store: 'RC_BILLING',
            isSandbox: true,
            originalPurchaseDate: '2026-10-01T00:00:00Z',
            ...overrides,
          }),
        },
        activeSubscriptions: ['web_jwtime_399_1mo'],
      })

    it('does not count a web sandbox subscription in production or Beta', () => {
      expect(supporterSinceDate(webSandboxMonthly(), 'production')).toBeNull()
      expect(supporterSinceDate(webSandboxMonthly(), 'beta')).toBeNull()
    })

    it('does not count one by default in a production build', () => {
      expect(supporterSinceDate(webSandboxMonthly())).toBeNull()
    })

    it('counts a web sandbox subscription in development', () => {
      expect(
        supporterSinceDate(webSandboxMonthly(), 'development')?.toISOString()
      ).toBe('2026-10-01T00:00:00.000Z')
    })

    it('counts a live web subscription everywhere', () => {
      for (const variant of ['production', 'beta', 'development'] as const) {
        expect(
          supporterSinceDate(
            webSandboxMonthly({ isSandbox: false }),
            variant
          )?.toISOString()
        ).toBe('2026-10-01T00:00:00.000Z')
      }
    })

    it('still counts an App Store sandbox subscription everywhere', () => {
      for (const variant of ['production', 'beta', 'development'] as const) {
        expect(
          supporterSinceDate(
            webSandboxMonthly({ store: 'APP_STORE', isSandbox: true }),
            variant
          )?.toISOString()
        ).toBe('2026-10-01T00:00:00.000Z')
      }
    })

    it('leaves Lifetime Supporter unchanged', () => {
      const lifetime = customer({
        active: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: entitlement({
            identifier: LIFETIME_SUPPORTER_ENTITLEMENT,
            productIdentifier: 'rc_promo_lifetime_supporter_lifetime',
            store: 'PROMOTIONAL',
            originalPurchaseDate: '2026-05-19T12:00:00Z',
          }),
        },
      })
      for (const variant of ['production', 'beta', 'development'] as const) {
        expect(supporterSinceDate(lifetime, variant)?.toISOString()).toBe(
          '2026-05-19T12:00:00.000Z'
        )
      }
    })

    it('keeps the live subscription when a sandbox one sits beside it', () => {
      const both = customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'web_jwtime_399_1mo',
            store: 'RC_BILLING',
            isSandbox: true,
            originalPurchaseDate: '2026-01-01T00:00:00Z',
          }),
          'Annual Donator': entitlement({
            identifier: 'Annual Donator',
            productIdentifier: 'jwtime_2899_1yr',
            store: 'APP_STORE',
            isSandbox: false,
            originalPurchaseDate: '2026-06-01T00:00:00Z',
          }),
        },
        activeSubscriptions: ['web_jwtime_399_1mo', 'jwtime_2899_1yr'],
      })
      expect(supporterSinceDate(both, 'production')?.toISOString()).toBe(
        '2026-06-01T00:00:00.000Z'
      )
    })

    // RevenueCat names one product per entitlement, the one ending last, and
    // monthly and annual both unlock `Monthly Donator`. A sandbox web
    // subscription named there mustn't hide a real one behind it.
    const sandboxNamingMonthlyDonator = (behind: PurchasesSubscriptionInfo) =>
      customer({
        active: {
          'Monthly Donator': entitlement({
            identifier: 'Monthly Donator',
            productIdentifier: 'web_jwtime_2899_1yr',
            store: 'RC_BILLING',
            isSandbox: true,
            originalPurchaseDate: '2026-10-01T00:00:00Z',
          }),
        },
        activeSubscriptions: [
          'web_jwtime_2899_1yr',
          ...(behind.isActive ? [behind.productIdentifier] : []),
        ],
        subscriptions: [
          subscription({
            productIdentifier: 'web_jwtime_2899_1yr',
            store: 'RC_BILLING',
            isSandbox: true,
            originalPurchaseDate: '2026-10-01T00:00:00Z',
            expiresDate: '2027-10-01T00:00:00Z',
          }),
          behind,
        ],
      })

    it('counts an App Store subscription behind a sandbox one on the same entitlement', () => {
      const result = supporterSinceDate(
        sandboxNamingMonthlyDonator(
          subscription({
            productIdentifier: 'jwtime_399_1mo',
            store: 'APP_STORE',
            originalPurchaseDate: '2025-02-01T00:00:00Z',
            expiresDate: '2026-11-01T00:00:00Z',
          })
        ),
        'production'
      )
      // Since when that subscription first started, not the sandbox one.
      expect(result?.toISOString()).toBe('2025-02-01T00:00:00.000Z')
    })

    it('does not count an expired App Store subscription behind a sandbox one', () => {
      const result = supporterSinceDate(
        sandboxNamingMonthlyDonator(
          subscription({
            productIdentifier: 'jwtime_399_1mo',
            store: 'APP_STORE',
            originalPurchaseDate: '2025-02-01T00:00:00Z',
            expiresDate: '2026-02-01T00:00:00Z',
            isActive: false,
          })
        ),
        'production'
      )
      expect(result).toBeNull()
    })

    it('does not count another sandbox web subscription behind a sandbox one', () => {
      const result = supporterSinceDate(
        sandboxNamingMonthlyDonator(
          subscription({
            productIdentifier: 'web_jwtime_399_1mo',
            store: 'RC_BILLING',
            isSandbox: true,
          })
        ),
        'production'
      )
      expect(result).toBeNull()
    })

    it('counts a Play subscription behind a sandbox one, listed with its base plan', () => {
      const result = supporterSinceDate(
        customer({
          active: {
            'Monthly Donator': entitlement({
              identifier: 'Monthly Donator',
              productIdentifier: 'web_jwtime_2899_1yr',
              store: 'RC_BILLING',
              isSandbox: true,
            }),
          },
          activeSubscriptions: [
            'web_jwtime_2899_1yr',
            'witnesswork_supporter:monthly-399',
          ],
          subscriptions: [
            subscription({
              productIdentifier: 'web_jwtime_2899_1yr',
              store: 'RC_BILLING',
              isSandbox: true,
            }),
            subscription({
              productIdentifier: 'witnesswork_supporter',
              store: 'PLAY_STORE',
              originalPurchaseDate: '2025-07-01T00:00:00Z',
            }),
          ],
        }),
        'production'
      )
      expect(result?.toISOString()).toBe('2025-07-01T00:00:00.000Z')
    })
  })
})
