import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { readStoreRow, strings } from './fixtures'

const enabled = process.env.E2E_API_DEV === '1'
const en = strings('en-US')
const keyFile = process.env.E2E_API_DEV_RECOVERY_KEY_FILE

test.skip(!enabled, 'opt-in: set E2E_API_DEV=1 (see the file header)')
test.skip(({ browserName }) => browserName !== 'chromium', 'needs CDP WebAuthn')

async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  })
}

const securityCheckPassed = (page: Page, testId: string) =>
  page.waitForFunction(
    (id) => {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-testid=${id}]`
      )
      return !!button && button.getAttribute('aria-disabled') !== 'true'
    },
    testId,
    { timeout: 90_000 }
  )

async function signUp(context: BrowserContext, page: Page) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: en.webSignIn_createAccount }).click()
  await securityCheckPassed(page, 'web-sign-up-create')
  await page.getByRole('button', { name: en.webSignUp_create }).click()
  const saved = page.getByRole('button', { name: en.webSignUp_saved })
  await saved.waitFor({ timeout: 90_000 })
  if (keyFile) {
    await page.getByRole('button', { name: en.copy, exact: true }).click()
    const key = await page.evaluate(() => navigator.clipboard.readText())
    fs.writeFileSync(keyFile, key, { mode: 0o600 })
  }
  await saved.click()
}

async function signInWithRecoveryKey(page: Page, key: string) {
  await page.getByRole('button', { name: en.webSignIn_recoveryKey }).click()
  await page.getByTestId('web-sign-in-recovery-input').fill(key)
  await securityCheckPassed(page, 'web-sign-in-recovery-submit')
  await page.getByTestId('web-sign-in-recovery-submit').click()
}

async function finishOnboarding(page: Page) {
  const home = page.getByRole('button', { name: en.quickAction })
  const next = page
    .getByRole('button', {
      name: /^(Get Started|Skip|Start fresh|Continue|Next|Done|Finish)/,
    })
    .first()
  for (let step = 0; step < 20 && !(await home.isVisible()); step++) {
    await page.waitForTimeout(1_500)

    const hours = page.getByText(
      (en.hoursLoggingQuestion as unknown as { yes: string }).yes,
      {
        exact: true,
      }
    )
    if (await hours.isVisible().catch(() => false)) await hours.click()
    if (await next.isEnabled().catch(() => false)) await next.click()
  }
  await expect(home).toBeVisible({ timeout: 30_000 })
}

test('gets an account on the web, chats with Scribe AI, and applies a proposed contact', async ({
  baseURL,
}) => {
  test.setTimeout(8 * 60_000)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-scribe-api-dev-'))
  const context = await chromium.launchPersistentContext(profile, {
    baseURL,
    viewport: { width: 390, height: 844 },
  })

  context.setDefaultTimeout(30_000)

  const violations: string[] = []
  await context.exposeBinding('__wwCsp', (_source, report: string) => {
    violations.push(report)
  })
  await context.addInitScript(() => {
    if (window !== window.top) return
    document.addEventListener('securitypolicyviolation', (event) =>
      (window as unknown as { __wwCsp: (report: string) => void }).__wwCsp(
        `${event.effectiveDirective} ${event.blockedURI}`
      )
    )
  })
  if (process.env.E2E_API_DEV_LOG === '1')
    context.on('response', (response) => {
      const { origin, pathname } = new URL(response.url())
      if (origin.includes('api-dev'))
        console.log(response.status(), response.request().method(), pathname)
    })
  const shots = process.env.WW_WEB_SHOTS
  const shot = async (page: Page, name: string) => {
    if (!shots) return
    fs.mkdirSync(shots, { recursive: true })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(shots, `${name}.png`) })
  }
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await addVirtualAuthenticator(context, page)
    await page.goto('/')
    const key =
      keyFile && fs.existsSync(keyFile)
        ? fs.readFileSync(keyFile, 'utf8').trim()
        : null
    await expect(
      page.getByRole('button', { name: en.webSignIn_createAccount })
    ).toBeVisible({ timeout: 60_000 })
    if (key) await signInWithRecoveryKey(page, key)
    else await signUp(context, page)
    await finishOnboarding(page)

    await page.getByRole('button', { name: en.quickAction }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: en.scribe_orbLabelWeb })
      .click()
    const agree = page.getByRole('button', { name: en.scribe_termsAgree })
    const composer = page.getByRole('textbox', {
      name: en.scribe_composerPlaceholder,
    })
    await expect(agree.or(composer)).toBeVisible()
    if (await agree.isVisible()) {
      await agree.click()
      await page
        .getByRole('button', { name: en.scribe_consentContinue })
        .click()
    }
    await expect(composer).toBeVisible()

    await expect(page.getByText(en.scribe_blockedDeviceWeb)).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: en.scribe_speak })
    ).toHaveCount(0)
    await shot(page, 'scribe-api-dev-empty')

    const step = page.waitForResponse(
      (response) =>
        response.url().endsWith('/scribe/v1/step') &&
        response.request().method() === 'POST'
    )
    await composer.fill(
      'Add a new contact named Maria Santos, 14 Elm Street, Springfield.'
    )
    await page.getByRole('button', { name: en.scribe_send }).click()
    const response = await step
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/event-stream')
    expect(response.request().headers()['authorization']).toMatch(/^Bearer /)
    expect(response.request().postDataJSON()).toMatchObject({
      protocol: 1,
      step: 0,
      app: { platform: 'web' },
    })

    const card = page.getByRole('checkbox', { name: /Maria Santos/ })
    await expect(card).toBeVisible({ timeout: 120_000 })
    await shot(page, 'scribe-api-dev-proposal')
    await page.getByRole('button', { name: /^Add \d+$/ }).click()
    await expect
      .poll(
        async () =>
          JSON.stringify(await readStoreRow(page, 'mmkv.default', 'contacts')),
        { timeout: 30_000 }
      )
      .toContain('Maria Santos')
    await shot(page, 'scribe-api-dev-added')

    await page
      .getByRole('button', { name: en.scribe_usageTitle })
      .first()
      .click()
    await expect(page.getByText(en.scribe_usagePlanFree)).toBeVisible()
    await expect(page.getByText(/% used/).first()).toBeVisible()
    await expect(page.getByText(en.account_statusUnverified)).toHaveCount(0)
    await shot(page, 'scribe-api-dev-usage')

    expect(violations, 'CSP violations').toEqual([])
  } finally {
    await context.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
