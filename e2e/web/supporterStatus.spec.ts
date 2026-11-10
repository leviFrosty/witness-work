import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'
import { TEST_ACCESS_TOKEN, corsFor } from './session'

test.use({ serviceWorkers: 'block', signedIn: true })

test.skip(
  !process.env.E2E_EXTERNAL,
  "needs the dev server's harness to hand the page a peer's claim"
)

const en = strings('en-US')
const DAY = 24 * 60 * 60_000

type Answer = { supporter: boolean; expiresAt: number | null }

const account = { answer: { supporter: false, expiresAt: null } as Answer }
let reads = 0

test.beforeEach(async ({ page }) => {
  account.answer = { supporter: false, expiresAt: null }
  reads = 0
  await page.context().route('**/accounts/v1/**', async (route) => {
    const request = route.request()
    const headers = await corsFor(request)
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    const { pathname } = new URL(request.url())
    if (pathname.endsWith('/accounts/v1/sessions/refresh'))
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          accessToken: TEST_ACCESS_TOKEN,
          accessExpiresAt: Date.now() + 15 * 60_000,
          refreshToken: `web-smoke-refresh-token-${Date.now()}`,
          sessionExpiresAt: Date.now() + 30 * DAY,
        }),
      })
    if (pathname.endsWith('/accounts/v1/supporter')) {
      reads += 1
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, ...account.answer, customers: 1 }),
      })
    }
    return route.fulfill({ status: 503, headers })
  })
})

type Harness = {
  __WW_DEV__: {
    revenueCat: {
      state: () => {
        server: {
          active: boolean
          supporter: boolean | null
          expiresAt: number | null
        }
      }
      peerClaim: (appUserId: string, entitled: boolean) => string
    }
  }
}

const server = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as Harness).__WW_DEV__.revenueCat.state().server
  )

const peerSays = (page: Page, entitled: boolean) =>
  page.evaluate(
    (entitled) =>
      (globalThis as unknown as Harness).__WW_DEV__.revenueCat.peerClaim(
        'peer-phone-customer-0001',
        entitled
      ),
    entitled
  )

const openSettings = (page: Page) =>
  page.getByRole('button', { name: 'Settings', exact: true }).click()

const expectShown = async (page: Page, text: string) => {
  const label = page.getByText(text).first()
  await expect(label).toBeVisible()
  await label.scrollIntoViewIfNeeded()
}

test('a purchase on a phone shows on the web without a reload, and its end does too', async ({
  app: page,
  shot,
}) => {
  await expect.poll(() => server(page)).toMatchObject({ supporter: false })
  const readsAtSignIn = reads
  expect(readsAtSignIn).toBeGreaterThan(0)
  await openSettings(page)
  await expectShown(page, en.becomeSupporter)
  await expect(page.getByText(en.supporterCardTitle)).toHaveCount(0)
  await shot('supporter-web-1-before-purchase')

  account.answer = { supporter: true, expiresAt: Date.now() + 30 * DAY }
  await peerSays(page, true)

  await expect.poll(() => server(page)).toMatchObject({ active: true })
  await expectShown(page, en.supporterCardTitle)
  expect(reads).toBe(readsAtSignIn + 1)
  await shot('supporter-web-2-after-phone-purchase')

  account.answer = { supporter: false, expiresAt: null }
  await peerSays(page, false)

  await expect
    .poll(() => server(page))
    .toMatchObject({ active: false, supporter: false })
  await expectShown(page, en.becomeSupporter)
  await expect(page.getByText(en.supporterCardTitle)).toHaveCount(0)
  expect(reads).toBe(readsAtSignIn + 2)
  await shot('supporter-web-3-after-it-ended')
})

test("asks again when the phone's link reaches the server late", async ({
  app: page,
}) => {
  await expect.poll(() => server(page)).toMatchObject({ supporter: false })
  const readsAtSignIn = reads

  await peerSays(page, true)
  await expect.poll(() => reads).toBe(readsAtSignIn + 1)
  expect(await server(page)).toMatchObject({ active: false })

  account.answer = { supporter: true, expiresAt: Date.now() + 30 * DAY }
  await expect
    .poll(() => server(page), { timeout: 30_000 })
    .toMatchObject({ active: true })
  expect(reads).toBe(readsAtSignIn + 2)
})

test.describe('an answer that reaches its end', () => {
  test.beforeEach(() => {
    account.answer = { supporter: true, expiresAt: Date.now() + 20_000 }
  })

  test('is read again at once: a renewal keeps Supporter', async ({
    app: page,
  }) => {
    await expect.poll(() => server(page)).toMatchObject({ active: true })
    const first = (await server(page)).expiresAt as number
    const readsBefore = reads
    const renewed = Date.now() + 30 * DAY
    account.answer = { supporter: true, expiresAt: renewed }

    await expect
      .poll(() => server(page), { timeout: 40_000 })
      .toMatchObject({ active: true, expiresAt: renewed })
    expect(Date.now()).toBeGreaterThanOrEqual(first)
    expect(reads).toBe(readsBefore + 1)
  })

  test('is read again at once: a lapse ends it', async ({ app: page }) => {
    await expect.poll(() => server(page)).toMatchObject({ active: true })
    const readsBefore = reads
    account.answer = { supporter: false, expiresAt: null }

    await expect
      .poll(() => server(page), { timeout: 40_000 })
      .toMatchObject({ active: false, supporter: false })
    expect(reads).toBe(readsBefore + 1)
  })
})
