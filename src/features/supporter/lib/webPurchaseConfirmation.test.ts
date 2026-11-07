import { describe, expect, it } from 'vitest'
import type { CustomerInfo } from 'react-native-purchases'
import {
  confirmWebPurchase,
  toWebCheckoutRecord,
} from '@/features/supporter/lib/webPurchaseConfirmation'

const startedAt = Date.parse('2026-10-30T12:00:00Z')

const customer = (
  transactions: { productIdentifier: string; purchaseDate: string }[]
): CustomerInfo =>
  ({
    nonSubscriptionTransactions: transactions.map((t, i) => ({
      ...t,
      transactionIdentifier: `t${i}`,
    })),
  }) as unknown as CustomerInfo

describe('confirmWebPurchase', () => {
  it('confirms a subscription once the User is a Supporter', () => {
    const base = {
      tier: 'supporter',
      customer: customer([]),
      checkoutStartedAt: startedAt,
    } as const
    expect(confirmWebPurchase({ ...base, isSupporter: true })).toBe('confirmed')
    expect(confirmWebPurchase({ ...base, isSupporter: false })).toBe('pending')
  })

  it('confirms a subscription without a checkout record', () => {
    expect(
      confirmWebPurchase({
        tier: 'supporter',
        customer: null,
        checkoutStartedAt: null,
        isSupporter: true,
      })
    ).toBe('confirmed')
  })

  it('confirms a web tip from after checkout opened', () => {
    expect(
      confirmWebPurchase({
        tier: 'tip',
        customer: customer([
          {
            productIdentifier: 'web_jwtime_499_oneTime',
            purchaseDate: '2026-10-30T12:03:00Z',
          },
        ]),
        checkoutStartedAt: startedAt,
        isSupporter: false,
      })
    ).toBe('confirmed')
  })

  it('allows five minutes of clock skew, and no more', () => {
    const tip = (purchaseDate: string) =>
      confirmWebPurchase({
        tier: 'tip',
        customer: customer([
          { productIdentifier: 'web_jwtime_499_oneTime', purchaseDate },
        ]),
        checkoutStartedAt: startedAt,
        isSupporter: false,
      })
    expect(tip('2026-10-30T11:55:00Z')).toBe('confirmed')
    expect(tip('2026-10-30T11:54:59Z')).toBe('pending')
  })

  it('ignores an older tip, a store tip and a malformed date', () => {
    expect(
      confirmWebPurchase({
        tier: 'tip',
        customer: customer([
          {
            productIdentifier: 'web_jwtime_499_oneTime',
            purchaseDate: '2026-09-01T00:00:00Z',
          },
          {
            productIdentifier: 'jwtime_499_oneTime',
            purchaseDate: '2026-10-30T12:03:00Z',
          },
          {
            productIdentifier: 'web_jwtime_999_oneTime',
            purchaseDate: 'not a date',
          },
        ]),
        checkoutStartedAt: startedAt,
        isSupporter: true,
      })
    ).toBe('pending')
  })

  it('keeps a tip pending without a customer or a checkout record', () => {
    const tips = customer([
      {
        productIdentifier: 'web_jwtime_499_oneTime',
        purchaseDate: '2026-10-30T12:03:00Z',
      },
    ])
    expect(
      confirmWebPurchase({
        tier: 'tip',
        customer: null,
        checkoutStartedAt: startedAt,
        isSupporter: false,
      })
    ).toBe('pending')
    expect(
      confirmWebPurchase({
        tier: 'tip',
        customer: tips,
        checkoutStartedAt: null,
        isSupporter: false,
      })
    ).toBe('pending')
  })
})

describe('toWebCheckoutRecord', () => {
  it('keeps only the tier and the time', () => {
    expect(
      toWebCheckoutRecord({ tier: 'tip', startedAt, appUserId: 'x', link: 'y' })
    ).toEqual({ tier: 'tip', startedAt })
  })

  it('rejects anything else', () => {
    for (const value of [
      null,
      'tip',
      {},
      { tier: 'lifetime', startedAt },
      { tier: 'tip', startedAt: 'now' },
      { tier: 'tip', startedAt: Number.NaN },
      { tier: 'supporter', startedAt: -1 },
    ]) {
      expect(toWebCheckoutRecord(value)).toBeNull()
    }
  })
})
