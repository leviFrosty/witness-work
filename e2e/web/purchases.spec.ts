import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, type Page, type Request } from '@playwright/test'
import type { Catalog } from './revenueCat'
import { webSalesAllowed } from '../../src/features/supporter/lib/webSalesRegions'
import { parseDevLocation } from '../../src/lib/visitorLocation'
import {
  expect,
  localApiOrigin,
  openBlankOnOrigin,
  readStoreRow,
  strings,
  test,
} from './fixtures'
import { mockRevenueCat } from './revenueCat'

const en = strings('en-US')
const dist = path.join(__dirname, '../../dist')

const sellsOnWeb = (() => {
  if (process.env.E2E_SELLS_ON_WEB === '1') return true
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
    const entry = /src="\/(_expo\/static\/js\/web\/index-[^"]+\.js)"/.exec(html)
    return (
      !!entry &&
      /["']rcb_(?:sb_)?[A-Za-z0-9]{16,}["']/.test(
        fs.readFileSync(path.join(dist, entry[1]), 'utf8')
      )
    )
  } catch {
    return false
  }
})()

test.skip(!sellsOnWeb, 'the export has no RevenueCat Billing key')

const THROWAWAY_ID = 'ww_test_buyer_7f3a9c2e51'

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

function recordRequests(page: Page, opened: string) {
  const sent: string[] = []
  const record = (request: Request) => {
    if (request.isNavigationRequest() && request.url().endsWith(opened)) return
    sent.push(`${request.url()}\n${request.postData() ?? ''}`)
  }
  page.context().on('request', record)
  return sent
}

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

  test.describe('signing in from the paywall', () => {
    test.use({ withoutAccountOnce: true })

    test('says to sign in instead of Buy where the build gates it, and signs in (dev_buy_gate)', async ({
      page,
      app,
      shot,
    }) => {
      await page.goto('/?dev_buy_gate=1')
      await expect(page).not.toHaveURL(/dev_buy_gate/)
      await openPaywall(app)
      await expect(app.getByText('$14.99').first()).toBeVisible()
      await expect(app.getByText(en.paywallSignInToBuyWeb)).toBeVisible()
      await expect(
        app.getByRole('button', { name: /^Become a Supporter — \$14\.99/ })
      ).toBeDisabled()
      const signIn = app.getByRole('button', {
        name: en.paywallSignInToBuyWebAction,
        exact: true,
      })
      const box = (await signIn.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await shot('paywall-sign-in-to-buy')

      await signIn.focus()
      await expect(signIn).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(
        page.getByText(en.webSignIn_title, { exact: true })
      ).toBeVisible()
    })
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

    for (const target of targets)
      await target
        .first()
        .evaluate((element) => (element.style.outline = '2px dashed #e5484d'))
    await shot('paywall-targets-header')
    await targets[2].scrollIntoViewIfNeeded()
    await shot('paywall-targets-prices')
  })
})

async function expectRegionNotice(app: Page) {
  await expect(app.getByText(en.paywallRegionTitleWeb)).toBeVisible()
  for (const [name, href] of [
    [en.paywallRegionAppStoreWeb, 'https://apps.apple.com/app/id6469723047'],
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
}

async function expectPrices(app: Page) {
  await expect(app.getByText('$14.99').first()).toBeVisible()
  await expect(app.getByText(en.paywallRegionTitleWeb)).toHaveCount(0)
}

async function launchWith(
  page: Page,
  { config, trace }: { config: Record<string, unknown>; trace: string }
) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  }
  await page.route('**/app/v1/config*', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          headers: cors,
          json: { ok: true, minAppVersion: null, sync: null, ...config },
        })
  )
  await page.route('**/cdn-cgi/trace', (route) =>
    route.fulfill({
      contentType: 'text/plain',
      body: `fl=1\nloc=${trace}\ntls=TLSv1.3\n`,
    })
  )
  await page.reload()
}

test.describe('the region notice', () => {
  for (const [place, blocked] of [
    ['GB', true],
    ['MX', true],
    ['CA-MB', true],
    ['CA-SK', true],
    ['CA-ON', false],
    ['US', false],
  ] as const) {
    test(`follows the sales list for ${place}`, async ({ page, app, shot }) => {
      expect(webSalesAllowed(parseDevLocation(place))).toBe(!blocked)
      await page.goto(`/?dev_country=${place}`)
      await expect(page).not.toHaveURL(/dev_country/)
      await openPaywall(app)
      if (blocked) {
        await expectRegionNotice(app)
        await app
          .getByRole('link', { name: en.paywallRegionPlayStoreWeb })
          .scrollIntoViewIfNeeded()
        await shot(`region-notice-${place}`)
      } else {
        await expectPrices(app)
      }
    })
  }

  test("follows the app config's province (Manitoba)", async ({
    page,
    app,
  }) => {
    await launchWith(page, {
      config: { country: 'CA', regionCode: 'MB' },
      trace: 'US',
    })
    await openPaywall(app)
    await expectRegionNotice(app)
  })

  test("follows the app config's province (Ontario)", async ({ page, app }) => {
    await launchWith(page, {
      config: { country: 'CA', regionCode: 'ON' },
      trace: 'GB',
    })
    await openPaywall(app)
    await expectPrices(app)
  })

  test('blocks Canada when the config has no province', async ({
    page,
    app,
  }) => {
    await launchWith(page, {
      config: { country: 'CA', regionCode: null },
      trace: 'US',
    })
    await openPaywall(app)
    await expectRegionNotice(app)
  })

  test('falls back to the trace for an older worker', async ({ page, app }) => {
    await launchWith(page, { config: {}, trace: 'CA' })
    await openPaywall(app)
    await expectRegionNotice(app)
  })

  test('falls back to the trace, which can allow, for an older worker', async ({
    page,
    app,
  }) => {
    await launchWith(page, { config: {}, trace: 'US' })
    await openPaywall(app)
    await expectPrices(app)
  })
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

    await expect(
      app.getByText(en.webPurchaseReturn_signedOutBodyWeb)
    ).toBeVisible()
    expect(await page.evaluate(() => location.href)).not.toContain(
      'app_user_id'
    )
    expect(page.url()).toMatch(/\/supporter\/thank-you\?tier=supporter$/)
    await expectOnlyOwnScripts(page)
    await shot('return-signed-out')

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

const fingerprint = (id: string) =>
  createHash('sha256').update(id).digest('hex').slice(0, 12)

const revenueCatState = (page: Page) =>
  page.evaluate(() => {
    const state = (
      globalThis as unknown as {
        __WW_DEV__: {
          revenueCat: {
            state: () => {
              accountId: string | null
              ownClaim: { id: string } | null
              settled: string | null
            }
          }
        }
      }
    ).__WW_DEV__.revenueCat.state()
    return {
      accountId: state.accountId,
      claim: state.ownClaim?.id ?? null,
      settled: state.settled,
    }
  })

type SessionHarness = {
  signUp: () => Promise<{ recoveryKey: string }>
  signInWithRecoveryKey: (recoveryKey: string) => Promise<unknown>
}
const harnessReady = (page: Page) =>
  page.waitForFunction(
    () => '__WW_WEB_SESSION__' in globalThis && '__WW_DEV__' in globalThis,
    null,
    { timeout: 120_000 }
  )

async function accountInUse(
  baseURL: string
): Promise<{ recoveryKey: string; claim: string }> {
  const folder = test.info().project.outputDir
  const file = path.join(folder, 'settled-id-account.json')
  const lock = path.join(folder, 'settled-id-account.lock')
  fs.mkdirSync(folder, { recursive: true })
  try {
    fs.mkdirSync(lock)
  } catch {
    await expect
      .poll(() => fs.existsSync(file), { timeout: 120_000 })
      .toBe(true)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  const first = await chromium.launch()
  try {
    const context = await first.newContext({ baseURL })
    await mockRevenueCat(context, CATALOG, 'free')
    const other = await context.newPage()
    const cdp = await context.newCDPSession(other)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf: true,
      },
    })
    await other.goto('/')
    await harnessReady(other)
    const recoveryKey = await other.evaluate(() =>
      (
        globalThis as unknown as { __WW_WEB_SESSION__: SessionHarness }
      ).__WW_WEB_SESSION__
        .signUp()
        .then((opened) => opened.recoveryKey)
    )
    await expect
      .poll(async () => (await revenueCatState(other)).settled, {
        timeout: 60_000,
      })
      .not.toBeNull()
    const state = await revenueCatState(other)
    expect(state.settled).toBe(state.claim)
    const account = { recoveryKey, claim: state.claim! }
    fs.writeFileSync(file, JSON.stringify(account), { mode: 0o600 })
    return account
  } finally {
    await first.close()
  }
}

test.describe('Buy and the settled id (dev_buy_gate)', () => {
  test.skip(!localApiOrigin, 'needs a local ww-api (E2E_API_ORIGIN)')

  test.use({ withoutAccountOnce: true })

  test("waits for the complete pull, then buys as the account's claim", async ({
    page,
    shot,
  }) => {
    test.setTimeout(240_000)
    const { recoveryKey, claim: accountClaim } = await accountInUse(
      test.info().project.use.baseURL!
    )

    await openBlankOnOrigin(page)
    await page.evaluate(() => sessionStorage.removeItem('ww-web-sign-in-later'))
    await page.goto('/')
    await harnessReady(page)
    await page.waitForLoadState('networkidle')
    const ownId = (await revenueCatState(page)).accountId
    await page.evaluate(
      (key) =>
        (
          globalThis as unknown as { __WW_WEB_SESSION__: SessionHarness }
        ).__WW_WEB_SESSION__.signInWithRecoveryKey(key),
      recoveryKey
    )

    await expect(
      page.getByRole('button', { name: 'Settings', exact: true })
    ).toBeVisible({ timeout: 60_000 })
    await harnessReady(page)
    await expect
      .poll(async () => (await revenueCatState(page)).settled, {
        timeout: 60_000,
      })
      .toBe(accountClaim)
    expect(ownId).not.toBe(accountClaim)
    await page.waitForLoadState('networkidle')

    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/accounts/v1/sync/list', async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/?dev_buy_gate=1&dev_country=US')
    await expect(page).not.toHaveURL(/dev_buy_gate/)
    await openPaywall(page)
    await expect(page.getByText('$14.99').first()).toBeVisible()
    const buy = page.getByRole('button', {
      name: /^Become a Supporter — \$14\.99/,
    })
    await expect(page.getByText(en.paywallGettingAccountReadyWeb)).toBeVisible()
    await expect(buy).toBeDisabled()
    expect((await revenueCatState(page)).settled).toBeNull()
    await shot('paywall-getting-account-ready')

    release()
    await expect(buy).toBeEnabled({ timeout: 30_000 })
    await expect(page.getByText(en.paywallGettingAccountReadyWeb)).toHaveCount(
      0
    )
    expect((await revenueCatState(page)).settled).toBe(accountClaim)

    const checkout = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        new URL(request.url()).host === 'pay.rev.cat'
    )
    await page.route('https://pay.rev.cat/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    )
    await buy.click()
    const url = new URL((await checkout).url())
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!)
    expect(fingerprint(id)).toBe(accountClaim)
  })
})
