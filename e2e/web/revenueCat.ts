import type { BrowserContext, Route } from '@playwright/test'

/**
 * RevenueCat's API as its sandbox config answers it in browser mode
 * (`api.revenuecat.com`, and the SDK's events on `e.revenue.cat`), so a build
 * with RevenueCat Billing's key sees a working RevenueCat without reaching it.
 * Every test gets it, with no prices unless it passes a catalog
 * (`revenueCatCatalog` in `fixtures.ts`).
 */

export type Product = {
  id: string
  cents: number
  period: 'P1M' | 'P1Y' | null
}
/** Offerings by id, each with one package. */
export type Catalog = Record<string, { pkg: string; product: Product }>
const price = (cents: number) => ({
  amount: cents,
  amount_micros: cents * 10_000,
  currency: 'USD',
})

const subscriptionOption = (id: string, cents: number, period: string) => ({
  id: 'base_option',
  price_id: `prc_${id}`,
  base: { cycle_count: 1, period_duration: period, price: price(cents) },
  discount: null,
  intro_price: null,
  trial: null,
})

const productDetails = ({ id, cents, period }: Product) =>
  period
    ? {
        identifier: id,
        product_type: 'subscription',
        title: 'WitnessWork Supporter',
        description: '',
        current_price: price(cents),
        normal_period_duration: period,
        default_purchase_option_id: 'base_option',
        default_subscription_option_id: 'base_option',
        purchase_options: {
          base_option: subscriptionOption(id, cents, period),
        },
        subscription_options: {
          base_option: subscriptionOption(id, cents, period),
        },
      }
    : {
        identifier: id,
        product_type: 'consumable',
        title: 'WitnessWork Tip',
        description: '',
        current_price: null,
        normal_period_duration: null,
        default_purchase_option_id: 'base_option',
        default_subscription_option_id: null,
        purchase_options: {
          base_option: {
            id: 'base_option',
            price_id: `prc_${id}`,
            base_price: price(cents),
            discount: null,
          },
        },
        subscription_options: {},
      }

/**
 * What customer info shows: nothing, an active web subscription (a Supporter),
 * or a web Tip bought a minute ago.
 */
export type CustomerKind = 'free' | 'supporter' | 'tipped'

const iso = (ms: number) => new Date(ms).toISOString()

const subscriber = (appUserId: string, kind: CustomerKind) => {
  const now = Date.now()
  const purchased = iso(now - 60_000)
  const expires = iso(now + 30 * 24 * 3600_000)
  const monthly = 'web_jwtime_399_1mo'
  return {
    request_date: iso(now),
    request_date_ms: now,
    subscriber: {
      entitlements:
        kind === 'supporter'
          ? {
              'Monthly Donator': {
                expires_date: expires,
                grace_period_expires_date: null,
                product_identifier: monthly,
                purchase_date: purchased,
              },
            }
          : {},
      first_seen: '2026-10-30T00:00:00Z',
      last_seen: '2026-10-30T00:00:00Z',
      management_url: null,
      non_subscriptions:
        kind === 'tipped'
          ? {
              web_jwtime_499_oneTime: [
                {
                  id: 'tip_1',
                  is_sandbox: true,
                  purchase_date: purchased,
                  store: 'rc_billing',
                },
              ],
            }
          : {},
      original_app_user_id: appUserId,
      original_application_version: null,
      original_purchase_date: null,
      other_purchases: {},
      subscriptions:
        kind === 'supporter'
          ? {
              [monthly]: {
                auto_resume_date: null,
                billing_issues_detected_at: null,
                expires_date: expires,
                grace_period_expires_date: null,
                is_sandbox: true,
                original_purchase_date: purchased,
                ownership_type: 'PURCHASED',
                period_type: 'normal',
                purchase_date: purchased,
                refunded_at: null,
                store: 'rc_billing',
                unsubscribe_detected_at: null,
              },
            }
          : {},
    },
  }
}

/** Answers RevenueCat's API with `catalog`'s offerings. */
export async function mockRevenueCat(
  context: BrowserContext,
  catalog: Catalog,
  customer: CustomerKind = 'free'
) {
  await context.route('https://e.revenue.cat/**', (route) =>
    route.fulfill({ json: {} })
  )
  await context.route('https://api.revenuecat.com/**', (route: Route) => {
    const url = new URL(route.request().url())
    const offerings = /^\/v1\/subscribers\/[^/]+\/offerings$/.exec(url.pathname)
    if (offerings)
      return route.fulfill({
        json: {
          current_offering_id: Object.keys(catalog)[0] ?? null,
          offerings: Object.entries(catalog).map(([identifier, o]) => ({
            identifier,
            description: '',
            metadata: null,
            packages: [
              {
                identifier: o.pkg,
                platform_product_identifier: o.product.id,
              },
            ],
          })),
          placements: { fallback_offering_id: Object.keys(catalog)[0] ?? null },
        },
      })
    if (/^\/rcbilling\/v1\/subscribers\/[^/]+\/products$/.test(url.pathname)) {
      const ids = new Set(url.searchParams.getAll('id'))
      return route.fulfill({
        json: {
          product_details: Object.values(catalog)
            .map((o) => o.product)
            .filter((p) => ids.has(p.id))
            .map(productDetails),
        },
      })
    }
    const customerPath = /^\/v1\/subscribers\/([^/]+)$/.exec(url.pathname)
    if (customerPath)
      return route.fulfill({
        json: subscriber(decodeURIComponent(customerPath[1]), customer),
      })
    return route.fulfill({ status: 404, json: { code: 7259, message: 'nope' } })
  })
}
