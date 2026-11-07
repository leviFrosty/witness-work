import { describe, expect, it, vi } from 'vitest'
import type { CustomerInfo } from 'react-native-purchases'
import {
  checkWebPurchaseReturn,
  webReturnKind,
  type WebPurchaseReturnDeps,
} from '@/features/supporter/lib/webPurchaseReturn'

const ID = 'ww_buyer_0123456789'
const startedAt = Date.parse('2026-10-30T12:00:00Z')

const supporter = { supporter: true } as unknown as CustomerInfo
const free = {
  supporter: false,
  nonSubscriptionTransactions: [],
} as unknown as CustomerInfo
const tipped = {
  supporter: false,
  nonSubscriptionTransactions: [
    {
      productIdentifier: 'web_jwtime_499_oneTime',
      purchaseDate: '2026-10-30T12:01:00Z',
      transactionIdentifier: 't1',
    },
  ],
} as unknown as CustomerInfo

const confirmed = (tier: 'supporter' | 'tip') => ({
  outcome: 'confirmed',
  tier,
})

const deps = (
  overrides: Partial<WebPurchaseReturnDeps> = {}
): WebPurchaseReturnDeps & { sleep: ReturnType<typeof vi.fn> } => ({
  tier: 'supporter',
  returnedAppUserId: ID,
  available: true,
  appUserId: async () => ID,
  fetchCustomer: async () => supporter,
  link: async () => ({
    result: 'linked',
    supporter: true,
    expiresAt: null,
    accountId: 'acct_one',
  }),
  isSupporter: (customer) =>
    (customer as unknown as { supporter: boolean }).supporter,
  checkoutStartedAt: startedAt,
  clearRecord: vi.fn(),
  ...overrides,
  sleep: vi.fn(async () => {}),
})

describe('checkWebPurchaseReturn', () => {
  it('confirms a subscription from fresh customer info and links the account', async () => {
    const link = vi.fn(async () => ({ result: 'skipped' }) as const)
    const fetchCustomer = vi.fn(async () => supporter)
    await expect(
      checkWebPurchaseReturn(deps({ link, fetchCustomer }))
    ).resolves.toEqual(confirmed('supporter'))
    expect(fetchCustomer).toHaveBeenCalledTimes(1)
    expect(link).toHaveBeenCalledTimes(1)
  })

  it('confirms a Tip bought after checkout opened', async () => {
    await expect(
      checkWebPurchaseReturn(
        deps({ tier: 'tip', fetchCustomer: async () => tipped })
      )
    ).resolves.toEqual(confirmed('tip'))
  })

  it('retries with backoff, then says it’s still pending', async () => {
    const fetchCustomer = vi.fn(async () => free)
    const run = deps({ fetchCustomer })
    await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
      outcome: 'pending',
    })
    expect(run.sleep.mock.calls.map(([ms]) => ms)).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ])
    expect(fetchCustomer).toHaveBeenCalledTimes(5)
  })

  it('confirms on a later try, and survives a failed read', async () => {
    const fetchCustomer = vi
      .fn<() => Promise<CustomerInfo>>()
      .mockResolvedValueOnce(free)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(supporter)
    const run = deps({ fetchCustomer })
    await expect(checkWebPurchaseReturn(run)).resolves.toEqual(
      confirmed('supporter')
    )
    expect(run.sleep).toHaveBeenCalledTimes(2)
  })

  it.each(['no_session', 'no_customer'] as const)(
    'says the purchase is complete elsewhere when it isn’t confirmed and the link finds %s',
    async (result) => {
      const run = deps({
        fetchCustomer: async () => free,
        link: async () => ({ result }),
      })
      await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
        outcome: 'signed_out',
      })
      expect(run.sleep).not.toHaveBeenCalled()
      expect(run.clearRecord).not.toHaveBeenCalled()
    }
  )

  describe('a purchase confirmed on the first check', () => {
    it.each(['no_session', 'no_customer'] as const)(
      'is confirmed before the link’s %s is considered',
      async (result) => {
        const link = vi.fn(async () => ({ result }))
        const run = deps({ link })
        await expect(checkWebPurchaseReturn(run)).resolves.toEqual(
          confirmed('supporter')
        )
        expect(link).toHaveBeenCalledTimes(1)
        expect(run.clearRecord).toHaveBeenCalledTimes(1)
      }
    )

    it('is confirmed when no id came back, whatever the link says', async () => {
      const run = deps({
        returnedAppUserId: null,
        link: async () => ({ result: 'no_session' }),
      })
      await expect(checkWebPurchaseReturn(run)).resolves.toEqual(
        confirmed('supporter')
      )
    })

    it('is another customer’s when the ids differ', async () => {
      const run = deps({ appUserId: async () => 'ww_someone_else_123' })
      await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
        outcome: 'other_customer',
      })
      expect(run.clearRecord).not.toHaveBeenCalled()
    })

    it('is signed out when the ids differ and the link finds no session', async () => {
      const run = deps({
        appUserId: async () => 'ww_someone_else_123',
        link: async () => ({ result: 'no_session' }),
      })
      await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
        outcome: 'signed_out',
      })
    })
  })

  it('clears the checkout record once a later try confirms', async () => {
    const run = deps({
      fetchCustomer: vi
        .fn<() => Promise<CustomerInfo>>()
        .mockResolvedValueOnce(free)
        .mockResolvedValueOnce(supporter),
    })
    await expect(checkWebPurchaseReturn(run)).resolves.toEqual(
      confirmed('supporter')
    )
    expect(run.clearRecord).toHaveBeenCalledTimes(1)
  })

  it('keeps the checkout record while it’s still pending', async () => {
    const run = deps({ fetchCustomer: async () => free })
    await checkWebPurchaseReturn(run)
    expect(run.clearRecord).not.toHaveBeenCalled()
  })

  describe('without a tier it can name', () => {
    it('confirms a Supporter', async () => {
      await expect(
        checkWebPurchaseReturn(deps({ tier: null }))
      ).resolves.toEqual(confirmed('supporter'))
    })

    it('confirms a web Tip bought after checkout opened', async () => {
      await expect(
        checkWebPurchaseReturn(
          deps({ tier: null, fetchCustomer: async () => tipped })
        )
      ).resolves.toEqual(confirmed('tip'))
    })

    it('never confirms a Tip without the time checkout opened', async () => {
      await expect(
        checkWebPurchaseReturn(
          deps({
            tier: null,
            checkoutStartedAt: null,
            fetchCustomer: async () => tipped,
          })
        )
      ).resolves.toEqual({ outcome: 'not_found' })
    })

    it('finds nothing, after retrying, when customer info shows neither', async () => {
      const run = deps({ tier: null, fetchCustomer: async () => free })
      await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
        outcome: 'not_found',
      })
      expect(run.sleep).toHaveBeenCalledTimes(4)
      expect(run.clearRecord).not.toHaveBeenCalled()
    })

    it.each([
      ['signed out', { link: async () => ({ result: 'no_session' }) }],
      ['another customer', { appUserId: async () => 'ww_someone_else_123' }],
      ['RevenueCat missing', { available: false }],
    ] as const)(
      'never says a purchase is complete when %s',
      async (_, overrides) => {
        await expect(
          checkWebPurchaseReturn(
            deps({
              tier: null,
              fetchCustomer: async () => free,
              ...(overrides as Partial<WebPurchaseReturnDeps>),
            })
          )
        ).resolves.toEqual({ outcome: 'not_found' })
      }
    )
  })

  it('says so without RevenueCat in this build', async () => {
    const fetchCustomer = vi.fn(async () => supporter)
    await expect(
      checkWebPurchaseReturn(deps({ available: false, fetchCustomer }))
    ).resolves.toEqual({ outcome: 'signed_out' })
    expect(fetchCustomer).not.toHaveBeenCalled()
  })

  it('never confirms for another customer, even when this one is a Supporter', async () => {
    const run = deps({ appUserId: async () => 'ww_someone_else_123' })
    await expect(checkWebPurchaseReturn(run)).resolves.toEqual({
      outcome: 'other_customer',
    })
    expect(run.sleep).not.toHaveBeenCalled()
  })

  it('confirms a forwarded return, which has no id, from customer info alone', async () => {
    await expect(
      checkWebPurchaseReturn(
        deps({
          returnedAppUserId: null,
          appUserId: async () => 'ww_this_browser_123',
        })
      )
    ).resolves.toEqual(confirmed('supporter'))
  })

  it('goes on when the link is offline', async () => {
    await expect(
      checkWebPurchaseReturn(
        deps({ link: async () => ({ result: 'offline' }) })
      )
    ).resolves.toEqual(confirmed('supporter'))
  })
})

describe('webReturnKind', () => {
  it.each([
    [ID, false, 'returned'],
    [ID, true, 'returned'],
    [null, true, 'forwarded'],
    [null, false, 'direct'],
  ] as const)('with id %s and forwarded %s is %s', (id, forwarded, kind) => {
    expect(webReturnKind({ returnedAppUserId: id, forwarded })).toBe(kind)
  })
})
