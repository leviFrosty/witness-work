#!/usr/bin/env node
// Mirror WitnessWork's in-app purchase catalog onto WitnessWork Beta so
// TestFlight sandbox purchases look and behave like the App Store app.
//
// App Store Connect: every subscription and consumable of the production app
// is created on the Beta app as `jwtimebeta_<suffix>` (product ids are unique
// per Apple account), with the same names, localizations, group levels,
// per-territory prices, availability, review screenshot and pause promotional
// offers.
//
// RevenueCat: the Beta App Store app lives in the production project so
// ww-api's server-side Supporter checks see Beta purchases. Each Beta product
// is attached to the same entitlements and offering packages as its
// production twin, so Beta gets the same offerings.
//
// Idempotent: it only fills in what's missing and never edits or deletes, so
// rerun it after adding products. Price changes to existing products must be
// mirrored by hand. Needs `asc` and `rc` logged in (see docs/build.md).
//
// Usage: node scripts/sync-beta-catalog.mjs
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ASC_PROD_APP = '6469723047'
const ASC_BETA_APP = '6816313534'
const RC_PROJECT = 'proj4c282809'
const RC_PROD_IOS_APP = 'appef8af03374'
const RC_BETA_IOS_APP = 'app6fbb58486d'

const run = promisify(execFile)
const tmp = mkdtempSync(join(tmpdir(), 'sync-beta-catalog-'))
const betaId = (productId) => productId.replace(/^jwtime_/, 'jwtimebeta_')
// Price point ids are base64url JSON whose `p` code is shared by every product
// in a territory, so swapping `s` for the Beta product gives the same price.
const encodeId = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const decodeId = (s) => JSON.parse(Buffer.from(s, 'base64url').toString())
const rel = (type, id) => ({ data: { type, id } })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
let bodies = 0

async function asc(method, path, { body, query = [], paginate } = {}) {
  const args = ['api', method, path]
  for (const q of query) args.push('--query', q)
  if (paginate) args.push('--paginate')
  if (method !== 'GET') args.push('--confirm')
  if (body) {
    const file = join(tmp, `body-${bodies++}.json`)
    writeFileSync(file, JSON.stringify(body))
    args.push('--body-file', file)
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const { stdout } = await run('asc', args, { maxBuffer: 64e6 })
      return stdout.trim() ? JSON.parse(stdout) : {}
    } catch (error) {
      const message = `${error.stderr || error.message}`.trim()
      if (attempt < 3 && /429|rate limit|timeout|status 5\d\d/i.test(message)) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        continue
      }
      throw new Error(`${method} ${path}: ${message}`, { cause: error })
    }
  }
}
const ascMaybe = (method, path, opts) =>
  asc(method, path, opts).catch(() => ({ data: null }))

async function rc(method, path, body) {
  const args = ['api', method, path, '--json']
  if (body) args.push('--body', JSON.stringify(body))
  const { stdout } = await run('rc', args, { maxBuffer: 64e6 })
  const json = stdout.trim() ? JSON.parse(stdout) : {}
  return json.data ?? json
}
async function rcAll(path) {
  const items = []
  let next = `${path}${path.includes('?') ? '&' : '?'}limit=100`
  while (next) {
    const page = await rc('GET', next)
    items.push(...page.items)
    next = page.next_page?.replace('https://api.revenuecat.com/v2', '')
  }
  return items
}

async function pool(items, size, fn) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]).catch((error) => ({ error, item: i }))
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

async function downloadReviewScreenshot(path, name) {
  const { data } = await ascMaybe('GET', path)
  const asset = data?.attributes.imageAsset
  if (!asset) throw new Error(`no review screenshot at ${path}`)
  const url = asset.templateUrl
    .replace('{w}', asset.width)
    .replace('{h}', asset.height)
    .replace('{f}', 'png')
  const file = join(tmp, name)
  writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()))
  return file
}

// ---------- App Store Connect: subscriptions ----------

async function syncGroup(prodGroup) {
  const { referenceName } = prodGroup.attributes
  const groups = await asc('GET', `/v1/apps/${ASC_BETA_APP}/subscriptionGroups`)
  let group = groups.data.find(
    (g) => g.attributes.referenceName === referenceName
  )
  if (!group) {
    group = (
      await asc('POST', '/v1/subscriptionGroups', {
        body: {
          data: {
            type: 'subscriptionGroups',
            attributes: { referenceName },
            relationships: { app: rel('apps', ASC_BETA_APP) },
          },
        },
      })
    ).data
    log('created group', referenceName)
  }
  const locsPath = (id) =>
    `/v1/subscriptionGroups/${id}/subscriptionGroupLocalizations`
  const [prodLocs, betaLocs] = await Promise.all([
    asc('GET', locsPath(prodGroup.id)),
    asc('GET', locsPath(group.id)),
  ])
  for (const { attributes: a } of prodLocs.data) {
    if (betaLocs.data.some((l) => l.attributes.locale === a.locale)) continue
    await asc('POST', '/v1/subscriptionGroupLocalizations', {
      body: {
        data: {
          type: 'subscriptionGroupLocalizations',
          attributes: {
            name: a.name,
            locale: a.locale,
            customAppName: a.customAppName,
          },
          relationships: {
            subscriptionGroup: rel('subscriptionGroups', group.id),
          },
        },
      },
    })
  }
  return group
}

async function syncSubscriptionDetails(prod, beta, screenshot) {
  const S = beta.id
  const productId = beta.attributes.productId

  const [prodLocs, betaLocs] = await Promise.all([
    asc('GET', `/v1/subscriptions/${prod.id}/subscriptionLocalizations`),
    asc('GET', `/v1/subscriptions/${S}/subscriptionLocalizations`),
  ])
  for (const { attributes: a } of prodLocs.data) {
    if (betaLocs.data.some((l) => l.attributes.locale === a.locale)) continue
    await asc('POST', '/v1/subscriptionLocalizations', {
      body: {
        data: {
          type: 'subscriptionLocalizations',
          attributes: {
            name: a.name,
            locale: a.locale,
            description: a.description,
          },
          relationships: { subscription: rel('subscriptions', S) },
        },
      },
    })
  }

  const betaAvailability = await ascMaybe(
    'GET',
    `/v1/subscriptions/${S}/subscriptionAvailability`
  )
  if (!betaAvailability.data) {
    const prodAvailability = await asc(
      'GET',
      `/v1/subscriptions/${prod.id}/subscriptionAvailability`
    )
    const territories = await asc(
      'GET',
      `/v1/subscriptionAvailabilities/${prodAvailability.data.id}/availableTerritories`,
      { paginate: true, query: ['limit=200'] }
    )
    await asc('POST', '/v1/subscriptionAvailabilities', {
      body: {
        data: {
          type: 'subscriptionAvailabilities',
          attributes: {
            availableInNewTerritories:
              prodAvailability.data.attributes.availableInNewTerritories,
          },
          relationships: {
            subscription: rel('subscriptions', S),
            availableTerritories: {
              data: territories.data.map(({ id }) => ({
                type: 'territories',
                id,
              })),
            },
          },
        },
      },
    })
  }

  const betaPrices = await asc('GET', `/v1/subscriptions/${S}/prices`, {
    query: ['limit=1'],
  })
  if (!betaPrices.data.length) {
    const prodPrices = await asc('GET', `/v1/subscriptions/${prod.id}/prices`, {
      paginate: true,
      query: ['include=subscriptionPricePoint', 'limit=200'],
    })
    // Keep the price in effect today per territory (skip scheduled changes).
    const now = new Date().toISOString().slice(0, 10)
    const current = new Map()
    for (const price of prodPrices.data) {
      const { t, p } = decodeId(
        price.relationships.subscriptionPricePoint.data.id
      )
      const start = price.attributes.startDate ?? ''
      if (start > now) continue
      if (!current.has(t) || start > current.get(t).start) {
        current.set(t, { p, start })
      }
    }
    const included = [...current].map(([t, { p }], i) => ({
      type: 'subscriptionPrices',
      id: `\${price${i}}`,
      attributes: { startDate: null, preserveCurrentPrice: false },
      relationships: {
        territory: rel('territories', t),
        subscriptionPricePoint: rel(
          'subscriptionPricePoints',
          encodeId({ s: S, t, p })
        ),
      },
    }))
    await asc('PATCH', `/v1/subscriptions/${S}`, {
      body: {
        data: {
          type: 'subscriptions',
          id: S,
          relationships: {
            prices: {
              data: included.map(({ type, id }) => ({ type, id })),
            },
          },
        },
        included,
      },
    })
  }

  const betaScreenshot = await ascMaybe(
    'GET',
    `/v1/subscriptions/${S}/appStoreReviewScreenshot`
  )
  if (!betaScreenshot.data) {
    await run('asc', [
      'subscriptions',
      'review',
      'screenshots',
      'create',
      '--subscription-id',
      S,
      '--file',
      screenshot,
    ])
  }

  // Pause offers are named `supporter_pause_<n>m_<productId>` (ADR 0016).
  const offersPath = (id) => `/v1/subscriptions/${id}/promotionalOffers`
  const [prodOffers, betaOffers] = await Promise.all([
    asc('GET', offersPath(prod.id), { query: ['limit=200'] }),
    asc('GET', offersPath(S), { query: ['limit=200'] }),
  ])
  for (const offer of prodOffers.data) {
    const a = offer.attributes
    const offerCode = a.offerCode.replace(prod.attributes.productId, productId)
    if (betaOffers.data.some((o) => o.attributes.offerCode === offerCode)) {
      continue
    }
    const prices = await asc(
      'GET',
      `/v1/subscriptionPromotionalOffers/${offer.id}/prices`,
      {
        paginate: true,
        query: ['include=territory,subscriptionPricePoint', 'limit=200'],
      }
    )
    const included = prices.data.map((price, i) => {
      const relationships = {
        territory: rel('territories', price.relationships.territory.data.id),
      }
      const pricePoint = price.relationships.subscriptionPricePoint?.data?.id
      if (pricePoint) {
        relationships.subscriptionPricePoint = rel(
          'subscriptionPricePoints',
          encodeId({ ...decodeId(pricePoint), s: S })
        )
      }
      return {
        type: 'subscriptionPromotionalOfferPrices',
        id: `\${price${i}}`,
        relationships,
      }
    })
    await asc('POST', '/v1/subscriptionPromotionalOffers', {
      body: {
        data: {
          type: 'subscriptionPromotionalOffers',
          attributes: {
            name: a.name.replace(prod.attributes.productId, productId),
            offerCode,
            duration: a.duration,
            offerMode: a.offerMode,
            numberOfPeriods: a.numberOfPeriods,
          },
          relationships: {
            subscription: rel('subscriptions', S),
            prices: { data: included.map(({ type, id }) => ({ type, id })) },
          },
        },
        included,
      },
    })
  }

  const { data } = await asc('GET', `/v1/subscriptions/${S}`)
  log('subscription', productId, data.attributes.state)
  return data.attributes.state
}

async function syncSubscriptions() {
  const prodGroups = await asc(
    'GET',
    `/v1/apps/${ASC_PROD_APP}/subscriptionGroups`
  )
  const states = []
  for (const prodGroup of prodGroups.data) {
    const group = await syncGroup(prodGroup)
    const list = (id) =>
      asc('GET', `/v1/subscriptionGroups/${id}/subscriptions`, {
        paginate: true,
        query: ['limit=200'],
      })
    const prodSubs = (await list(prodGroup.id)).data.sort(
      (a, b) => a.attributes.groupLevel - b.attributes.groupLevel
    )
    if (!prodSubs.length) continue
    const betaSubs = (await list(group.id)).data
    const screenshot = await downloadReviewScreenshot(
      `/v1/subscriptions/${prodSubs[0].id}/appStoreReviewScreenshot`,
      `subscription-${group.id}.png`
    )

    // Apple returns 500s for concurrent creates in one group: create serially.
    const pairs = []
    for (const prod of prodSubs) {
      const productId = betaId(prod.attributes.productId)
      let beta = betaSubs.find((s) => s.attributes.productId === productId)
      if (!beta) {
        const a = prod.attributes
        beta = (
          await asc('POST', '/v1/subscriptions', {
            body: {
              data: {
                type: 'subscriptions',
                attributes: {
                  name: a.name,
                  productId,
                  familySharable: !!a.familySharable,
                  subscriptionPeriod: a.subscriptionPeriod,
                  ...(a.reviewNote && { reviewNote: a.reviewNote }),
                },
                relationships: { group: rel('subscriptionGroups', group.id) },
              },
            },
          })
        ).data
        log('created subscription', productId)
      }
      pairs.push([prod, beta])
    }
    states.push(
      ...(await pool(pairs, 4, ([prod, beta]) =>
        syncSubscriptionDetails(prod, beta, screenshot)
      ))
    )

    for (const [prod, beta] of pairs) {
      const { groupLevel } = prod.attributes
      const current = await asc('GET', `/v1/subscriptions/${beta.id}`)
      if (current.data.attributes.groupLevel === groupLevel) continue
      await asc('PATCH', `/v1/subscriptions/${beta.id}`, {
        body: {
          data: {
            type: 'subscriptions',
            id: beta.id,
            attributes: { groupLevel },
          },
        },
      })
    }
  }
  return states
}

// ---------- App Store Connect: consumables ----------

async function syncInAppPurchase(prod, betaIaps, screenshot) {
  const a = prod.attributes
  const productId = betaId(a.productId)
  let beta = betaIaps.find((x) => x.attributes.productId === productId)
  if (!beta) {
    beta = (
      await asc('POST', '/v2/inAppPurchases', {
        body: {
          data: {
            type: 'inAppPurchases',
            attributes: {
              name: a.name,
              productId,
              inAppPurchaseType: a.inAppPurchaseType,
              familySharable: !!a.familySharable,
              ...(a.reviewNote && { reviewNote: a.reviewNote }),
            },
            relationships: { app: rel('apps', ASC_BETA_APP) },
          },
        },
      })
    ).data
    log('created in-app purchase', productId)
  }
  const I = beta.id

  const locsPath = (id) => `/v2/inAppPurchases/${id}/inAppPurchaseLocalizations`
  const [prodLocs, betaLocs] = await Promise.all([
    asc('GET', locsPath(prod.id)),
    asc('GET', locsPath(I)),
  ])
  for (const { attributes: l } of prodLocs.data) {
    if (betaLocs.data.some((b) => b.attributes.locale === l.locale)) continue
    await asc('POST', '/v1/inAppPurchaseLocalizations', {
      body: {
        data: {
          type: 'inAppPurchaseLocalizations',
          attributes: {
            name: l.name,
            locale: l.locale,
            description: l.description,
          },
          relationships: { inAppPurchaseV2: rel('inAppPurchases', I) },
        },
      },
    })
  }

  // Same base territory and manual prices; Apple derives the other territories.
  const betaManual = await ascMaybe(
    'GET',
    `/v1/inAppPurchasePriceSchedules/${I}/manualPrices`,
    { query: ['limit=1'] }
  )
  if (!betaManual.data?.length) {
    const schedule = await asc(
      'GET',
      `/v1/inAppPurchasePriceSchedules/${prod.id}`,
      { query: ['include=baseTerritory'] }
    )
    const manual = await asc(
      'GET',
      `/v1/inAppPurchasePriceSchedules/${prod.id}/manualPrices`,
      {
        paginate: true,
        query: ['include=inAppPurchasePricePoint,territory', 'limit=200'],
      }
    )
    const included = manual.data.map((price, i) => {
      const { t, p } = decodeId(
        price.relationships.inAppPurchasePricePoint.data.id
      )
      return {
        type: 'inAppPurchasePrices',
        id: `\${price${i}}`,
        attributes: {
          startDate: price.attributes.startDate,
          endDate: price.attributes.endDate,
        },
        relationships: {
          inAppPurchaseV2: rel('inAppPurchases', I),
          inAppPurchasePricePoint: rel(
            'inAppPurchasePricePoints',
            encodeId({ s: I, t, p })
          ),
        },
      }
    })
    await asc('POST', '/v1/inAppPurchasePriceSchedules', {
      body: {
        data: {
          type: 'inAppPurchasePriceSchedules',
          relationships: {
            inAppPurchase: rel('inAppPurchases', I),
            baseTerritory: rel(
              'territories',
              schedule.data.relationships.baseTerritory.data.id
            ),
            manualPrices: {
              data: included.map(({ type, id }) => ({ type, id })),
            },
          },
        },
        included,
      },
    })
  }

  const betaAvailability = await ascMaybe(
    'GET',
    `/v2/inAppPurchases/${I}/inAppPurchaseAvailability`
  )
  if (!betaAvailability.data) {
    const prodAvailability = await asc(
      'GET',
      `/v2/inAppPurchases/${prod.id}/inAppPurchaseAvailability`
    )
    const territories = await asc(
      'GET',
      `/v1/inAppPurchaseAvailabilities/${prodAvailability.data.id}/availableTerritories`,
      { paginate: true, query: ['limit=200'] }
    )
    await asc('POST', '/v1/inAppPurchaseAvailabilities', {
      body: {
        data: {
          type: 'inAppPurchaseAvailabilities',
          attributes: {
            availableInNewTerritories:
              prodAvailability.data.attributes.availableInNewTerritories,
          },
          relationships: {
            inAppPurchase: rel('inAppPurchases', I),
            availableTerritories: {
              data: territories.data.map(({ id }) => ({
                type: 'territories',
                id,
              })),
            },
          },
        },
      },
    })
  }

  const betaScreenshot = await ascMaybe(
    'GET',
    `/v2/inAppPurchases/${I}/appStoreReviewScreenshot`
  )
  if (!betaScreenshot.data) {
    await run('asc', [
      'iap',
      'review-screenshots',
      'create',
      '--iap-id',
      I,
      '--file',
      screenshot,
    ])
  }

  const { data } = await asc('GET', `/v2/inAppPurchases/${I}`)
  log('in-app purchase', productId, data.attributes.state)
  return data.attributes.state
}

async function syncInAppPurchases() {
  const list = (app) =>
    asc('GET', `/v1/apps/${app}/inAppPurchasesV2`, {
      paginate: true,
      query: ['limit=200'],
    })
  const prodIaps = (await list(ASC_PROD_APP)).data
  if (!prodIaps.length) return []
  const betaIaps = (await list(ASC_BETA_APP)).data
  const screenshot = await downloadReviewScreenshot(
    `/v2/inAppPurchases/${prodIaps[0].id}/appStoreReviewScreenshot`,
    'in-app-purchase.png'
  )
  return pool(prodIaps, 4, (prod) =>
    syncInAppPurchase(prod, betaIaps, screenshot)
  )
}

// ---------- RevenueCat ----------

async function syncRevenueCat() {
  const base = `/projects/${RC_PROJECT}`
  const products = await rcAll(`${base}/products`)
  const betaByStoreId = new Map(
    products
      .filter((p) => p.app_id === RC_BETA_IOS_APP)
      .map((p) => [p.store_identifier, p])
  )
  const betaFor = new Map()
  for (const prod of products.filter((p) => p.app_id === RC_PROD_IOS_APP)) {
    const storeId = betaId(prod.store_identifier)
    let beta = betaByStoreId.get(storeId)
    if (!beta) {
      beta = await rc('POST', `${base}/products`, {
        store_identifier: storeId,
        app_id: RC_BETA_IOS_APP,
        type: /_1(mo|yr)$/.test(storeId) ? 'subscription' : 'consumable',
        ...(prod.display_name && { display_name: prod.display_name }),
      })
      log('created RevenueCat product', storeId)
    }
    betaFor.set(prod.id, beta.id)
  }

  for (const entitlement of await rcAll(`${base}/entitlements`)) {
    const attached = new Set(
      (await rcAll(`${base}/entitlements/${entitlement.id}/products`)).map(
        (p) => p.id
      )
    )
    const missing = [...attached]
      .map((id) => betaFor.get(id))
      .filter((id) => id && !attached.has(id))
    if (!missing.length) continue
    await rc(
      'POST',
      `${base}/entitlements/${entitlement.id}/actions/attach_products`,
      { product_ids: missing }
    )
    log('entitlement', entitlement.lookup_key, `+${missing.length}`)
  }

  for (const offering of await rcAll(`${base}/offerings`)) {
    for (const pkg of await rcAll(
      `${base}/offerings/${offering.id}/packages`
    )) {
      const items = await rcAll(
        `${base}/packages/${pkg.id}/products?expand=items.product`
      )
      const attached = new Set(items.map((i) => i.product.id))
      const missing = items
        .filter((i) => betaFor.has(i.product.id))
        .filter((i) => !attached.has(betaFor.get(i.product.id)))
        .map((i) => ({
          product_id: betaFor.get(i.product.id),
          eligibility_criteria: i.eligibility_criteria,
        }))
      if (!missing.length) continue
      await rc('POST', `${base}/packages/${pkg.id}/actions/attach_products`, {
        products: missing,
      })
      log('package', offering.lookup_key, pkg.lookup_key, `+${missing.length}`)
    }
  }
  return betaFor.size
}

const states = [...(await syncSubscriptions()), ...(await syncInAppPurchases())]
const failures = states.filter((s) => s?.error)
for (const { error } of failures) console.error(error.message)
const notReady = states.filter(
  (s) => typeof s === 'string' && s !== 'READY_TO_SUBMIT' && s !== 'APPROVED'
)
const mapped = await syncRevenueCat()
console.log(
  `App Store Connect: ${states.length} products, ${failures.length} failed, ` +
    `${notReady.length} not ready. RevenueCat: ${mapped} products mapped.`
)
if (failures.length || notReady.length) process.exit(1)
