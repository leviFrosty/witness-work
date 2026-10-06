import { describe, expect, it } from 'vitest'
import type {
  CustomerInfo,
  PurchasesStoreProduct,
  PurchasesStoreProductDiscount,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'
import {
  baseProductId,
  billingKind,
  manageableSubscription,
  manageSubscriptionState,
  matchStoreProduct,
  pauseOffers,
  pauseResumeDate,
  playSubscriptionsUrl,
  type PauseRecord,
} from '@/features/supporter/lib/supporterPause'

const now = Date.parse('2026-10-05T12:00:00Z')
const day = 86400000
const date = (daysFromNow: number) =>
  new Date(now + daysFromNow * day).toISOString()
const noPause: PauseRecord = { startedAt: null, resumesAt: null }

function sub(
  overrides: Partial<PurchasesSubscriptionInfo> = {}
): PurchasesSubscriptionInfo {
  return {
    productIdentifier: 'jwtime_499_1mo',
    isActive: true,
    willRenew: true,
    store: 'APP_STORE',
    expiresDate: date(10),
    refundedAt: null,
    billingIssuesDetectedAt: null,
    periodType: 'NORMAL',
    ownershipType: 'PURCHASED',
    ...overrides,
  } as PurchasesSubscriptionInfo
}

function customer(...subs: PurchasesSubscriptionInfo[]): CustomerInfo {
  return {
    subscriptionsByProductIdentifier: Object.fromEntries(
      subs.map((s) => [s.productIdentifier, s])
    ),
  } as unknown as CustomerInfo
}

function discount(
  identifier: string,
  overrides: Partial<PurchasesStoreProductDiscount> = {}
): PurchasesStoreProductDiscount {
  const months = Number(/_(\d+)m/.exec(identifier)?.[1] ?? 1)
  return {
    identifier,
    price: 0,
    priceString: '$0.00',
    cycles: 1,
    period: `P${months}M`,
    periodUnit: 'MONTH',
    periodNumberOfUnits: months,
    ...overrides,
  }
}

function product(
  overrides: Partial<PurchasesStoreProduct> = {}
): PurchasesStoreProduct {
  return {
    identifier: 'jwtime_499_1mo',
    subscriptionPeriod: 'P1M',
    priceString: '$4.99',
    discounts: [
      discount('supporter_pause_6m_jwtime_499_1mo'),
      discount('supporter_pause_1m_jwtime_499_1mo'),
      discount('supporter_pause_3m_jwtime_499_1mo'),
    ],
    ...overrides,
  } as PurchasesStoreProduct
}

describe('Supporter pause', () => {
  describe('manageable subscription', () => {
    it('only manages active subscriptions from this platform store', () => {
      const apple = sub()
      const play = sub({
        productIdentifier: 'jwtime_499_1mo:monthly',
        store: 'PLAY_STORE',
      })
      expect(manageableSubscription(customer(apple, play), 'ios')).toBe(apple)
      expect(manageableSubscription(customer(apple, play), 'android')).toBe(
        play
      )
      expect(manageableSubscription(null, 'ios')).toBeNull()
    })

    it('ignores grants, refunds, family sharing, and expired subscriptions', () => {
      expect(
        manageableSubscription(
          customer(
            sub({ productIdentifier: 'rc_promo', store: 'PROMOTIONAL' }),
            sub({ productIdentifier: 'a', refundedAt: date(-1) }),
            sub({ productIdentifier: 'b', ownershipType: 'FAMILY_SHARED' }),
            sub({ productIdentifier: 'c', isActive: false })
          ),
          'ios'
        )
      ).toBeNull()
    })

    it('prefers a renewing subscription, then the latest expiration', () => {
      const ending = sub({
        productIdentifier: 'a',
        willRenew: false,
        expiresDate: date(300),
      })
      const soon = sub({ productIdentifier: 'b', expiresDate: date(5) })
      const later = sub({ productIdentifier: 'c', expiresDate: date(20) })
      expect(manageableSubscription(customer(ending, soon), 'ios')).toBe(soon)
      expect(manageableSubscription(customer(soon, later), 'ios')).toBe(later)
    })
  })

  describe('pause offers', () => {
    it('lists configured free offers shortest first', () => {
      expect(pauseOffers(product()).map((o) => o.months)).toEqual([1, 3, 6])
    })

    it('accepts bare identifiers and both period encodings', () => {
      const offers = pauseOffers(
        product({
          discounts: [
            discount('supporter_pause_1m'),
            discount('supporter_pause_3m', {
              period: 'P1M',
              periodNumberOfUnits: 1,
              cycles: 3,
            }),
          ],
        })
      )
      expect(offers.map((o) => o.months)).toEqual([1, 3])
    })

    it('drops unknown, paid, or mismatched offers', () => {
      expect(
        pauseOffers(
          product({
            discounts: [
              discount('rc_cancel_offer'),
              discount('supporter_pause_2m'),
              discount('supporter_pause_1m', { price: 0.99 }),
              discount('supporter_pause_3m', { periodNumberOfUnits: 1 }),
              discount('supporter_pause_6m', {
                periodUnit: 'WEEK',
                periodNumberOfUnits: 26,
              }),
            ],
          })
        )
      ).toEqual([])
      expect(pauseOffers(null)).toEqual([])
      expect(pauseOffers(product({ discounts: null }))).toEqual([])
    })
  })

  describe('helpers', () => {
    it('derives billing kind from the store period', () => {
      expect(billingKind('P1M')).toBe('monthly')
      expect(billingKind('P1Y')).toBe('annual')
      expect(billingKind('P1W')).toBe('other')
      expect(billingKind(null)).toBe('other')
    })

    it('matches Play base-plan identifiers to store products', () => {
      const p = product({ identifier: 'jwtime_499_1mo:monthly' })
      expect(baseProductId('jwtime_499_1mo:monthly')).toBe('jwtime_499_1mo')
      expect(matchStoreProduct([p], 'jwtime_499_1mo:monthly')).toBe(p)
      expect(matchStoreProduct([p], 'jwtime_499_1mo')).toBe(p)
      expect(matchStoreProduct([p], 'jwtime_999_1mo')).toBeUndefined()
    })

    it('resumes billing the chosen months after the current period', () => {
      expect(pauseResumeDate('2026-01-31T00:00:00Z', 1).toISOString()).toBe(
        '2026-02-28T00:00:00.000Z'
      )
      expect(pauseResumeDate('2026-10-15T00:00:00Z', 6).toISOString()).toBe(
        '2027-04-15T00:00:00.000Z'
      )
    })

    it('links to the subscription in Google Play', () => {
      expect(
        playSubscriptionsUrl(
          'jwtime_499_1mo:monthly',
          'com.leviwilkerson.jwtime'
        )
      ).toBe(
        'https://play.google.com/store/account/subscriptions?sku=jwtime_499_1mo&package=com.leviwilkerson.jwtime'
      )
    })
  })

  describe('state', () => {
    const state = (
      info: CustomerInfo | null,
      options: {
        platform?: 'ios' | 'android'
        product?: PurchasesStoreProduct | null
        pause?: PauseRecord
      } = {}
    ) =>
      manageSubscriptionState({
        customer: info,
        platform: options.platform ?? 'ios',
        product: options.product === undefined ? product() : options.product,
        pause: options.pause ?? noPause,
        now,
      })

    it('has nothing to manage without a store subscription', () => {
      expect(state(null).kind).toBe('none')
      expect(state(customer()).kind).toBe('none')
    })

    it('offers App Store pauses to renewing subscriptions', () => {
      const result = state(customer(sub()))
      expect(result).toMatchObject({
        kind: 'renewing',
        renewsAt: new Date(date(10)),
        pause: { kind: 'offers' },
      })
    })

    it('shows when support ends once renewal is off', () => {
      const result = state(customer(sub({ willRenew: false })))
      expect(result).toMatchObject({
        kind: 'ending',
        endsAt: new Date(date(10)),
      })
    })

    it('shows a scheduled or running pause until billing resumes', () => {
      const pause = { startedAt: now - day, resumesAt: now + 40 * day }
      expect(state(customer(sub()), { pause })).toMatchObject({
        kind: 'paused',
        resumesAt: new Date(now + 40 * day),
      })
    })

    it('allows one App Store pause every 12 months', () => {
      const startedAt = Date.parse('2025-10-06T12:00:00Z')
      const cooling = state(customer(sub()), {
        pause: { startedAt, resumesAt: now - day },
      })
      expect(cooling).toMatchObject({
        kind: 'renewing',
        pause: {
          kind: 'unavailable',
          reason: 'cooldown',
          availableAgainAt: new Date('2026-10-06T12:00:00Z'),
        },
      })
      const ready = state(customer(sub()), {
        pause: {
          startedAt: Date.parse('2025-10-05T12:00:00Z'),
          resumesAt: now - day,
        },
      })
      expect(ready).toMatchObject({ pause: { kind: 'offers' } })
    })

    it('withholds pauses during billing trouble, trials, or duplicate subscriptions', () => {
      const reason = (info: CustomerInfo) => {
        const result = state(info)
        return result.kind === 'renewing' && result.pause.kind === 'unavailable'
          ? result.pause.reason
          : null
      }
      expect(reason(customer(sub({ billingIssuesDetectedAt: date(-1) })))).toBe(
        'billing_issue'
      )
      expect(reason(customer(sub({ periodType: 'TRIAL' })))).toBe(
        'not_normal_period'
      )
      expect(
        reason(customer(sub(), sub({ productIdentifier: 'jwtime_999_1yr' })))
      ).toBe('multiple_subscriptions')
    })

    it('hides App Store pauses until offers are configured', () => {
      expect(state(customer(sub()), { product: null })).toMatchObject({
        pause: { kind: 'unavailable', reason: 'no_offers' },
      })
    })

    it('hands monthly Play subscriptions to Google Play pause', () => {
      const play = sub({
        productIdentifier: 'jwtime_499_1mo:monthly',
        store: 'PLAY_STORE',
      })
      expect(
        state(customer(play), {
          platform: 'android',
          product: product({ identifier: 'jwtime_499_1mo:monthly' }),
        })
      ).toMatchObject({ pause: { kind: 'play' } })
      expect(
        state(customer(play), {
          platform: 'android',
          product: product({ subscriptionPeriod: 'P1Y' }),
        })
      ).toMatchObject({
        pause: { kind: 'unavailable', reason: 'unsupported_plan' },
      })
    })

    it('never treats an Android device as App Store paused', () => {
      const play = sub({ store: 'PLAY_STORE' })
      expect(
        state(customer(play), {
          platform: 'android',
          pause: { startedAt: now, resumesAt: now + 30 * day },
        }).kind
      ).toBe('renewing')
    })
  })
})
