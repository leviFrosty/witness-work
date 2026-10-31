import fs from 'node:fs'
import path from 'node:path'
import type { Page, Request } from '@playwright/test'
import type { Catalog } from './revenueCat'
import { NO_WEB_SALES_COUNTRIES } from '../../src/features/supporter/lib/webSalesRegions'
import {
  expect,
  openBlankOnOrigin,
  readStoreRow,
  strings,
  test,
} from './fixtures'

/**
 * Web purchases (docs/web-purchases.md): the paywall's Buy, the region notice,
 * and the checkout return page. RevenueCat's API is mocked here, as its sandbox
 * answers it (`api.revenuecat.com`, and SDK events on `e.revenue.cat`), so a
 * run reaches no real service and doesn't depend on the sandbox's catalog.
 * Checkout itself is never followed.
 *
 * Needs a build with RevenueCat Billing's sandbox key and links (`.env.local`,
 * see docs/build.md); without them the web sells nothing and these skip.
 */

const en = strings('en-US')
const dist = path.join(__dirname, '../../dist')

/** Whether the export carries a RevenueCat Billing key. */
const sellsOnWeb = (() => {
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
    const entry = /src="\/(_expo\/static\/js\/web\/index-[^"]+\.js)"/.exec(html)
    return (
      !!entry &&
      /rcb_(?:sb_)?[A-Za-z0-9]/.test(
        fs.readFileSync(path.join(dist, entry[1]), 'utf8')
      )
    )
  } catch {
    return false
  }
})()

test.skip(!sellsOnWeb, 'the export has no RevenueCat Billing key')

/** A made-up customer id checkout might return with. */
const THROWAWAY_ID = 'ww_test_buyer_7f3a9c2e51'

/** Offerings by id, each with one package, as the sandbox config has them. */
const CATALOG: Catalog = {
  'Monthly $0.49': {
    pkg: '$rc_monthly',
    product: { id: 'web_jwtime_49_1mo', cents: 49, period: 'P1M' },
  },
  'Monthly $2.99': {
    pkg: '$rc_monthly',
    product: { id: 'web_jwtime_299_1mo', cents: 299, period: 'P1M' },
  },
  'Monthly $3.99': {
    pkg: '$rc_monthly',
    product: { id: 'web_jwtime_399_1mo', cents: 399, period: 'P1M' },
  },
  'Annual $14.99': {
    pkg: '$rc_annual',
    product: { id: 'web_jwtime_1499_1yr', cents: 1499, period: 'P1Y' },
  },
  'Annual $9.99': {
    pkg: '$rc_annual',
    product: { id: 'web_jwtime_999_1yr', cents: 999, period: 'P1Y' },
  },
  'One Time $2.99': {
    pkg: 'One Time',
    product: { id: 'web_jwtime_299_oneTime', cents: 299, period: null },
  },
  'One Time $4.99': {
    pkg: 'One Time',
    product: { id: 'web_jwtime_499_oneTime', cents: 499, period: null },
  },
}

test.use({ revenueCatCatalog: CATALOG })

/** Every request the page sends, with its body, to check for the id. */
function recordRequests(page: Page, opened: string) {
  const sent: string[] = []
  const record = (request: Request) => {
    // The test's own navigation to the return page.
    if (request.isNavigationRequest() && request.url().endsWith(opened)) return
    sent.push(`${request.url()}\n${request.postData() ?? ''}`)
  }
  page.context().on('request', record)
  return sent
}

/** The customer ids this browser asks RevenueCat about, as it asks. */
function recordCustomerIds(page: Page) {
  const ids: string[] = []
  page.context().on('request', (request) => {
    const match =
      /^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/([^/?]+)$/.exec(
        request.url()
      )
    if (match) ids.push(decodeURIComponent(match[1]))
  })
  return ids
}

/** Fails the test if a checkout URL is ever written into the page. */
async function watchForCheckoutUrls(page: Page) {
  const leaks: string[] = []
  await page.exposeBinding('__wwCheckoutLeak', (_source, value: string) => {
    leaks.push(value)
  })
  await page.addInitScript(() => {
    const report = (value: string | null | undefined) => {
      if (value && value.includes('pay.rev.cat'))
        (
          window as unknown as { __wwCheckoutLeak: (value: string) => void }
        ).__wwCheckoutLeak(value)
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof Element
        )
          report(mutation.target.getAttribute(mutation.attributeName!))
        if (mutation.type === 'characterData')
          report(mutation.target.textContent)
        mutation.addedNodes.forEach((node) =>
          report(node instanceof Element ? node.outerHTML : node.textContent)
        )
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  })
  return leaks
}

/** Every script on the page loads from the app's own origin. */
async function expectOnlyOwnScripts(page: Page) {
  const sources = await page.evaluate(() =>
    [...document.scripts].map((script) => script.src)
  )
  const origin = new URL(page.url()).origin
  for (const source of sources)
    if (source) expect(new URL(source).origin).toBe(origin)
  expect(sources.join(' ')).not.toMatch(/revenuecat|rev\.cat|stripe|paddle/i)
}

async function openPaywall(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('button', { name: en.becomeSupporter, exact: true })
    .first()
    .click()
}

test.describe('the web paywall', () => {
  test('shows prices, no Restore, and Buy opens checkout without writing its URL', async ({
    page,
    app,
    shot,
  }) => {
    const leaks = await watchForCheckoutUrls(page)
    await page.reload()
    await openPaywall(app)
    await expect(app.getByText('$14.99').first()).toBeVisible()
    await expect(app.getByText(en.restorePurchase)).toHaveCount(0)
    await expectOnlyOwnScripts(page)
    await shot('paywall-web')

    // Checkout is a navigation away, intercepted and never followed.
    const checkout = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        new URL(request.url()).host === 'pay.rev.cat'
    )
    await page.route('https://pay.rev.cat/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    )
    await app
      .getByRole('button', { name: /^Become a Supporter — \$14\.99/ })
      .click()
    const url = new URL((await checkout).url())
    await page.waitForURL(/^https:\/\/pay\.rev\.cat\//)
    expect(url.origin).toBe('https://pay.rev.cat')
    expect(url.pathname).toMatch(
      /^\/sandbox\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]{8,64}$/
    )
    expect(url.searchParams.get('package_id')).toBe('$rc_annual')
    expect(url.searchParams.get('hide_back_button')).toBe('true')
    expect(url.searchParams.get('skip_purchase_success')).toBe('true')
    expect(leaks).toEqual([])

    // The device keeps the tier and the time, never an id.
    await openBlankOnOrigin(page)
    const record = JSON.parse(
      (await readStoreRow(page, 'web-checkout', 'record')) as string
    )
    expect(Object.keys(record).sort()).toEqual(['startedAt', 'tier'])
    expect(record.tier).toBe('supporter')
  })

  test('hides a price whose offering has no link', async ({ app }) => {
    await openPaywall(app)
    await app
      .getByRole('button', { name: en.paywallBillingMonthly, exact: true })
      .click()
    await expect(app.getByText('$2.99').first()).toBeVisible()
    await expect(app.getByText('$0.49')).toHaveCount(0)
  })

  test('says to sign in instead of Buy where the build gates it (dev_buy_gate)', async ({
    page,
    app,
    shot,
  }) => {
    // A development build on localhost gating Buy as Beta and production do:
    // this browser has no account session.
    await page.goto('/?dev_buy_gate=1')
    await expect(page).not.toHaveURL(/dev_buy_gate/)
    await openPaywall(app)
    await expect(app.getByText('$14.99').first()).toBeVisible()
    await expect(app.getByText(en.paywallSignInToBuyWeb)).toBeVisible()
    await expect(
      app.getByRole('button', { name: /^Become a Supporter — \$14\.99/ })
    ).toBeDisabled()
    await shot('paywall-sign-in-to-buy')
  })

  test('gives its controls 44pt targets', async ({ app, shot }) => {
    await openPaywall(app)
    await expect(app.getByText('$14.99').first()).toBeVisible()
    const targets = [
      app.getByRole('button', { name: en.goBack, exact: true }),
      app.getByRole('button', { name: en.paywallLearnMore, exact: true }),
      app.getByRole('button', { name: en.paywallBillingMonthly, exact: true }),
      app.getByRole('button', {
        name: new RegExp(`^${en.paywallBillingAnnual}`),
      }),
      app.getByRole('button', { name: en.paywallCtaSendTip, exact: true }),
      app.getByRole('radio').first(),
    ]
    for (const target of targets) {
      const box = await target.first().boundingBox()
      expect(box, String(target)).not.toBeNull()
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44)
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44)
    }
    // Shows the frames measured above.
    for (const target of targets)
      await target
        .first()
        .evaluate((element) => (element.style.outline = '2px dashed #e5484d'))
    await shot('paywall-targets-header')
    await targets[2].scrollIntoViewIfNeeded()
    await shot('paywall-targets-prices')
  })
})

test.describe('the region notice', () => {
  for (const country of ['GB', 'MX']) {
    test(`follows the sales list for ${country}`, async ({
      page,
      app,
      shot,
    }) => {
      await page.goto(`/?dev_country=${country}`)
      await expect(page).not.toHaveURL(/dev_country/)
      await openPaywall(app)
      if (NO_WEB_SALES_COUNTRIES.has(country)) {
        await expect(app.getByText(en.paywallRegionTitleWeb)).toBeVisible()
        // Real links, to pages with no ids, in a new tab.
        for (const [name, href] of [
          [
            en.paywallRegionAppStoreWeb,
            'https://apps.apple.com/app/id6469723047',
          ],
          [
            en.paywallRegionPlayStoreWeb,
            'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime',
          ],
        ]) {
          const link = app.getByRole('link', { name })
          await expect(link).toBeVisible()
          await expect(link).toHaveAttribute('href', href)
          await expect(link).toHaveAttribute('target', '_blank')
          await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
          const box = await link.boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(44)
        }
        await expect(app.getByText('$14.99')).toHaveCount(0)
        await expect(app.getByText(/^Become a Supporter — /)).toHaveCount(0)
        await app
          .getByRole('link', { name: en.paywallRegionPlayStoreWeb })
          .scrollIntoViewIfNeeded()
        await shot(`region-notice-${country}`)
      } else {
        await expect(app.getByText('$14.99').first()).toBeVisible()
        await expect(app.getByText(en.paywallRegionTitleWeb)).toHaveCount(0)
      }
    })
  }
})

test.describe('the checkout return page', () => {
  test('drops the id before anything sees it, and never keeps it', async ({
    page,
    app,
    shot,
  }) => {
    const returned = `/supporter/thank-you?tier=supporter&app_user_id=${THROWAWAY_ID}`
    const sent = recordRequests(page, returned)
    await page.goto(returned)
    await expect(
      app.getByText(en.webPurchaseReturn_completeTitleWeb)
    ).toBeVisible()
    // No account session in this browser.
    await expect(
      app.getByText(en.webPurchaseReturn_signedOutBodyWeb)
    ).toBeVisible()
    expect(await page.evaluate(() => location.href)).not.toContain(
      'app_user_id'
    )
    expect(page.url()).toMatch(/\/supporter\/thank-you\?tier=supporter$/)
    await expectOnlyOwnScripts(page)
    await shot('return-signed-out')

    // Let anything queued go out, then check every request and the storage.
    await page.waitForTimeout(2000)
    for (const request of sent) expect(request).not.toContain(THROWAWAY_ID)
    const stored = await page.evaluate(async () => {
      const values: string[] = [
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
      ]
      for (const name of ['witnesswork-stores', 'witnesswork-keys']) {
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const request = indexedDB.open(name)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        })
        if (!db) continue
        for (const store of db.objectStoreNames) {
          const all = await new Promise<unknown[]>((resolve) => {
            const request = db.transaction(store).objectStore(store).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve([])
          })
          values.push(
            JSON.stringify(all, (_key, value) =>
              value instanceof ArrayBuffer
                ? new TextDecoder().decode(value)
                : value
            )
          )
        }
        db.close()
      }
      return values.join('\n')
    })
    expect(stored).not.toContain(THROWAWAY_ID)
  })
})

test.describe('the checkout return page, for a Supporter', () => {
  test.use({ revenueCatCustomer: 'supporter' })

  test('confirms a purchase it sees before the account link is considered', async ({
    page,
    app,
  }) => {
    // This browser has no account session, so the link finds none: before,
    // that said "complete elsewhere" even though customer info confirmed it.
    const ids = recordCustomerIds(page)
    await page.reload()
    await expect.poll(() => ids.length).toBeGreaterThan(0)
    await page.goto(
      `/supporter/thank-you?tier=supporter&app_user_id=${encodeURIComponent(ids[0])}`
    )
    await expect(app.getByText(en.thankYou, { exact: true })).toBeVisible()
    await expect(
      app.getByText(en.webPurchaseReturn_completeTitleWeb)
    ).toHaveCount(0)
  })

  test('confirms a return with no id from customer info alone', async ({
    page,
    app,
  }) => {
    await page.goto('/supporter/thank-you?tier=supporter')
    await expect(app.getByText(en.thankYou, { exact: true })).toBeVisible()
  })

  test('never confirms for another customer’s id', async ({ page, app }) => {
    await page.goto(
      `/supporter/thank-you?tier=supporter&app_user_id=${THROWAWAY_ID}`
    )
    await expect(
      app.getByText(en.webPurchaseReturn_completeTitleWeb)
    ).toBeVisible()
    await expect(app.getByText(en.thankYou, { exact: true })).toHaveCount(0)
  })

  test('names a purchase it finds when the address names none', async ({
    page,
    app,
  }) => {
    await page.goto('/supporter/thank-you?tier=everything')
    await expect(app.getByText(en.thankYou, { exact: true })).toBeVisible()
  })
})

test.describe('the checkout return page, without a tier', () => {
  test('never claims a purchase it can’t find', async ({ page, app, shot }) => {
    await page.goto('/supporter/thank-you')
    await expect(
      app.getByText(en.webPurchaseReturn_notFoundTitleWeb)
    ).toBeVisible()
    await expect(
      app.getByText(en.webPurchaseReturn_completeTitleWeb)
    ).toHaveCount(0)
    await expect(
      app.getByRole('button', { name: en.goBack, exact: true })
    ).toBeVisible()
    await shot('return-not-found')
  })
})
