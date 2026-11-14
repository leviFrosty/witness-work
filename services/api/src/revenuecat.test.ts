import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  countsWebSandboxSubscriptions,
  fetchSupporterStatus,
  isSupporter,
  LIFETIME_SUPPORTER_ENTITLEMENT,
  RevenueCatError,
} from './revenuecat'

const NOW = Date.parse('2026-06-18T00:00:00Z')
const FUTURE = '2027-01-01T00:00:00Z'
const PAST = '2025-01-01T00:00:00Z'
// RevenueCat stamps lifetime promotional grants ~200 years out, not null.
const PROMO_LIFETIME = '2226-05-19T12:00:00Z'

const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof fetch

const call = (status: number, body: unknown) =>
  isSupporter({
    apiKey: 'sk_test',
    appUserId: 'uuid-123',
    entitlementId: 'Supporter',
    fetchImpl: fakeFetch(status, body),
    nowMs: NOW,
  })

const subscriber = (subscriber: {
  entitlements?: Record<string, unknown>
  subscriptions?: Record<string, unknown>
  non_subscriptions?: Record<string, unknown>
}) => call(200, { subscriber })

// Entitlement and product names below match the production RevenueCat project.
const monthly = {
  entitlements: {
    'Monthly Donator': {
      expires_date: FUTURE,
      product_identifier: 'jwtime_399_1mo',
    },
  },
  subscriptions: {
    jwtime_399_1mo: { expires_date: FUTURE, store: 'app_store' },
  },
}

const tip = {
  entitlements: {
    'One Time Donator': {
      expires_date: null,
      product_identifier: 'witnesswork_tip_299',
    },
  },
  non_subscriptions: {
    witnesswork_tip_299: [{ id: 'abc', store: 'play_store' }],
  },
}

describe('isSupporter', () => {
  it('is true for an active monthly subscription', async () => {
    expect(await subscriber(monthly)).toBe(true)
  })

  it('is true for an active annual subscription', async () => {
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: 'jwtime_4799_1yr',
          },
        },
        subscriptions: {
          jwtime_4799_1yr: { expires_date: FUTURE, store: 'app_store' },
        },
      })
    ).toBe(true)
  })

  it('is true for a Google Play subscription with a base plan', async () => {
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: 'witnesswork_supporter',
            product_plan_identifier: 'annual-2899',
          },
        },
        subscriptions: {
          witnesswork_supporter: {
            expires_date: FUTURE,
            product_plan_identifier: 'annual-2899',
            store: 'play_store',
          },
        },
      })
    ).toBe(true)
  })

  it('is false for an expired subscription', async () => {
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: PAST,
            product_identifier: 'jwtime_399_1mo',
          },
        },
        subscriptions: {
          jwtime_399_1mo: { expires_date: PAST, store: 'app_store' },
        },
      })
    ).toBe(false)
  })

  it('is false when the backing subscription has expired', async () => {
    expect(
      await subscriber({
        ...monthly,
        subscriptions: {
          jwtime_399_1mo: { expires_date: PAST, store: 'app_store' },
        },
      })
    ).toBe(false)
  })

  it('is true for a Lifetime Supporter grant', async () => {
    const productId = `rc_promo_${LIFETIME_SUPPORTER_ENTITLEMENT}_lifetime`
    expect(
      await subscriber({
        entitlements: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: {
            expires_date: PROMO_LIFETIME,
            product_identifier: productId,
          },
        },
        subscriptions: {
          [productId]: { expires_date: PROMO_LIFETIME, store: 'promotional' },
        },
      })
    ).toBe(true)
  })

  it('is true for a Lifetime Supporter grant with no backing product', async () => {
    expect(
      await subscriber({
        entitlements: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: {
            expires_date: null,
            product_identifier: 'rc_promo_lifetime_supporter_lifetime',
          },
        },
      })
    ).toBe(true)
  })

  it('is false for a revoked Lifetime Supporter grant', async () => {
    expect(
      await subscriber({
        entitlements: {
          [LIFETIME_SUPPORTER_ENTITLEMENT]: {
            expires_date: PAST,
            product_identifier: 'rc_promo_lifetime_supporter_lifetime',
          },
        },
      })
    ).toBe(false)
  })

  it('is true for an active promotional grant of a subscription entitlement', async () => {
    const productId = 'rc_promo_Monthly Donator_monthly'
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: productId,
          },
        },
        subscriptions: {
          [productId]: { expires_date: FUTURE, store: 'promotional' },
        },
      })
    ).toBe(true)
  })

  it('is false for a one-time tip', async () => {
    expect(await subscriber(tip)).toBe(false)
  })

  it('is false for a tip product that unlocks a subscription entitlement', async () => {
    // A non-subscription product reports a non-expiring entitlement; it still
    // isn't backed by a subscription, so it must not grant Supporter status.
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: null,
            product_identifier: 'witnesswork_tip_299',
          },
        },
        non_subscriptions: tip.non_subscriptions,
      })
    ).toBe(false)
  })

  it('is true for a tip plus an active subscription', async () => {
    expect(
      await subscriber({
        entitlements: { ...tip.entitlements, ...monthly.entitlements },
        subscriptions: monthly.subscriptions,
        non_subscriptions: tip.non_subscriptions,
      })
    ).toBe(true)
  })

  it('is false for a tip plus an expired subscription', async () => {
    expect(
      await subscriber({
        entitlements: {
          ...tip.entitlements,
          'Monthly Donator': {
            expires_date: PAST,
            product_identifier: 'jwtime_399_1mo',
          },
        },
        subscriptions: {
          jwtime_399_1mo: { expires_date: PAST, store: 'app_store' },
        },
        non_subscriptions: tip.non_subscriptions,
      })
    ).toBe(false)
  })

  it('ignores a product id that only exists on the object prototype', async () => {
    expect(
      await subscriber({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: 'constructor',
          },
        },
        subscriptions: {},
      })
    ).toBe(false)
  })

  it('is false when there are no entitlements', async () => {
    expect(await subscriber({})).toBe(false)
  })

  it('is false for an unknown subscriber (404)', async () => {
    expect(await call(404, { error: 'not found' })).toBe(false)
  })

  it('throws RevenueCatError on an unexpected status', async () => {
    await expect(call(500, { error: 'boom' })).rejects.toBeInstanceOf(
      RevenueCatError
    )
  })
})

describe('fetchSupporterStatus deadline', () => {
  const read = (fetchImpl: typeof fetch) =>
    fetchSupporterStatus({
      apiKey: 'sk_test',
      appUserId: 'uuid-123',
      fetchImpl,
      nowMs: NOW,
      timeoutMs: 20,
    })

  it('gives up on headers that never come, as unreachable', async () => {
    const hang = (() => new Promise<Response>(() => {})) as typeof fetch
    await expect(read(hang)).rejects.toBeInstanceOf(RevenueCatError)
  })

  it('gives up on a body that never ends', async () => {
    const slowBody = (async () =>
      ({
        ok: true,
        status: 200,
        json: () => new Promise(() => {}),
      }) as unknown as Response) as typeof fetch
    await expect(read(slowBody)).rejects.toBeInstanceOf(RevenueCatError)
  })

  it('passes the deadline on to the fetch', async () => {
    let signal: AbortSignal | null | undefined
    const capture = (async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal
      return Response.json({ subscriber: {} })
    }) as typeof fetch
    await read(capture)
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})

// RevenueCat Billing (web) purchases, in the shape RevenueCat answers for a
// sandbox Stripe test card. Ids and dates are made up.
const SOONER = '2026-12-01T00:00:00Z'
const webMonthly = (isSandbox: boolean, expires = FUTURE) => ({
  display_name: 'Web Monthly',
  expires_date: expires,
  is_sandbox: isSandbox,
  period_type: 'normal',
  price: { amount: 3.99, currency: 'USD' },
  purchase_date: '2026-06-01T00:00:00Z',
  store: 'rc_billing',
  store_transaction_id: 'sub_test_0000000000000000',
})
const webSubscriber = (isSandbox: boolean) => ({
  entitlements: {
    'Monthly Donator': {
      expires_date: FUTURE,
      product_identifier: 'web_jwtime_399_1mo',
    },
  },
  subscriptions: { web_jwtime_399_1mo: webMonthly(isSandbox) },
})

const status = (
  sub: Record<string, unknown>,
  options: { countWebSandbox?: boolean } = {}
) =>
  fetchSupporterStatus({
    apiKey: 'sk_test',
    appUserId: 'uuid-123',
    fetchImpl: fakeFetch(200, { subscriber: sub }),
    nowMs: NOW,
    ...options,
  })

describe('web sandbox subscriptions', () => {
  it('ignores an rc_billing sandbox subscription by default', async () => {
    expect(await status(webSubscriber(true))).toEqual({
      known: true,
      supporter: false,
      expiresAt: null,
    })
  })

  it('counts an rc_billing sandbox subscription with the switch on', async () => {
    expect(
      await status(webSubscriber(true), { countWebSandbox: true })
    ).toEqual({ known: true, supporter: true, expiresAt: Date.parse(FUTURE) })
  })

  it('counts an rc_billing production subscription either way', async () => {
    for (const countWebSandbox of [false, true]) {
      expect(
        (await status(webSubscriber(false), { countWebSandbox })).supporter
      ).toBe(true)
    }
  })

  it('counts an App Store sandbox subscription either way', async () => {
    const sandbox = {
      ...monthly,
      subscriptions: {
        jwtime_399_1mo: {
          expires_date: FUTURE,
          is_sandbox: true,
          store: 'app_store',
        },
      },
    }
    for (const countWebSandbox of [false, true]) {
      expect((await status(sandbox, { countWebSandbox })).supporter).toBe(true)
    }
  })

  it('counts an App Store subscription beside an ignored one, to its expiry', async () => {
    expect(
      await status({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: 'web_jwtime_399_1mo',
          },
          'Annual Donator': {
            expires_date: SOONER,
            product_identifier: 'jwtime_4799_1yr',
          },
        },
        subscriptions: {
          web_jwtime_399_1mo: webMonthly(true),
          jwtime_4799_1yr: { expires_date: SOONER, store: 'app_store' },
        },
      })
    ).toEqual({ known: true, supporter: true, expiresAt: Date.parse(SOONER) })
  })

  it('finds an App Store subscription an ignored one shadows on the same entitlement', async () => {
    // RevenueCat names one product per entitlement, the one that ends last,
    // so a later web sandbox purchase hides the App Store one behind it.
    expect(
      await status({
        entitlements: {
          'Monthly Donator': {
            expires_date: FUTURE,
            product_identifier: 'web_jwtime_399_1mo',
          },
        },
        subscriptions: {
          web_jwtime_399_1mo: webMonthly(true),
          jwtime_399_1mo: { expires_date: SOONER, store: 'app_store' },
        },
      })
    ).toEqual({ known: true, supporter: true, expiresAt: Date.parse(SOONER) })
  })

  it('ignores an expired subscription an ignored one shadows', async () => {
    expect(
      (
        await status({
          entitlements: {
            'Monthly Donator': {
              expires_date: FUTURE,
              product_identifier: 'web_jwtime_399_1mo',
            },
          },
          subscriptions: {
            web_jwtime_399_1mo: webMonthly(true),
            jwtime_399_1mo: { expires_date: PAST, store: 'app_store' },
          },
        })
      ).supporter
    ).toBe(false)
  })

  it('still counts a promotional grant and Lifetime Supporter', async () => {
    const lifetime = `rc_promo_${LIFETIME_SUPPORTER_ENTITLEMENT}_lifetime`
    expect(
      (
        await status({
          entitlements: {
            'Monthly Donator': {
              expires_date: FUTURE,
              product_identifier: 'rc_promo_Monthly Donator_monthly',
            },
          },
          subscriptions: {
            'rc_promo_Monthly Donator_monthly': {
              expires_date: FUTURE,
              store: 'promotional',
            },
          },
        })
      ).supporter
    ).toBe(true)
    expect(
      (
        await status({
          entitlements: {
            [LIFETIME_SUPPORTER_ENTITLEMENT]: {
              expires_date: PROMO_LIFETIME,
              product_identifier: lifetime,
            },
          },
          subscriptions: {
            [lifetime]: { expires_date: PROMO_LIFETIME, store: 'promotional' },
          },
        })
      ).supporter
    ).toBe(true)
  })
})

describe('countsWebSandboxSubscriptions', () => {
  it('is set only for the local development worker, never Beta or production', () => {
    const toml = readFileSync(
      new URL('../wrangler.toml', import.meta.url),
      'utf8'
    )
    const sections = toml
      .split(/^(?=\[)/m)
      .filter((section) => /^REVENUECAT_COUNT_WEB_SANDBOX\s*=/m.test(section))
      .map((section) => section.split('\n')[0])
    expect(sections).toEqual(['[env.dev.vars]'])
  })

  it('is on only on a development worker with the var set', () => {
    expect(
      countsWebSandboxSubscriptions({
        APP_ATTEST_ENVIRONMENT: 'development',
        REVENUECAT_COUNT_WEB_SANDBOX: 'true',
      })
    ).toBe(true)
    expect(
      countsWebSandboxSubscriptions({ APP_ATTEST_ENVIRONMENT: 'development' })
    ).toBe(false)
    for (const value of ['false', '1', 'TRUE'])
      expect(
        countsWebSandboxSubscriptions({
          APP_ATTEST_ENVIRONMENT: 'development',
          REVENUECAT_COUNT_WEB_SANDBOX: value,
        })
      ).toBe(false)
    expect(
      countsWebSandboxSubscriptions({
        APP_ATTEST_ENVIRONMENT: 'production',
        REVENUECAT_COUNT_WEB_SANDBOX: 'true',
      })
    ).toBe(false)
  })
})
