#!/usr/bin/env node

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const url = flag('url')
const profile = flag('profile')
const shots = flag('shots')
const steps = (flag('steps') ?? '').split(',').filter(Boolean)
const recoveryOut = flag('recovery-out')
const recover = flag('recover')
if (!url || !profile) {
  console.error(
    'Usage: node scripts/perf/web-network-sign-up.mjs --url <app url> --profile <dir> [--recovery-out <file> | --recover <file>] [--signed-up] [--shots <dir>]'
  )
  process.exit(1)
}
if (
  !/^https?:\/\/(localhost|127\.0\.0\.1|app-dev\.witnesswork\.app)(:|\/|$)/.test(
    url
  )
)
  throw new Error('Sign-up automation is for local and dev hosts only')

const SLOW = Number(process.env.WW_SIGN_UP_TIMEOUT ?? 180_000)
const context = await chromium.launchPersistentContext(path.resolve(profile), {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
  timeout: 300_000,
})
context.setDefaultTimeout(SLOW)
const page = context.pages()[0] ?? (await context.newPage())
let shotIndex = 0
const shot = async (name) => {
  if (!shots) return
  fs.mkdirSync(shots, { recursive: true })
  await page
    .screenshot({
      path: path.join(
        shots,
        `${String(++shotIndex).padStart(2, '0')}-${name}.png`
      ),
    })
    .catch(() => undefined)
}
const visible = (testId, timeout = 4_000) =>
  page
    .getByTestId(testId)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false
    )
const text = () =>
  page.evaluate(() => globalThis.document.body.innerText.slice(0, 600))

try {
  const cdp = await context.newCDPSession(page)
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
  page.on('pageerror', (error) => console.error('[page error]', error.message))
  if (process.env.WW_SIGN_UP_DEBUG) {
    const origin = new URL(url).origin
    page.on('requestfailed', (request) =>
      console.error(
        '[failed]',
        request.method(),
        request.url(),
        request.failure()?.errorText
      )
    )
    page.on('response', (response) => {
      if (!response.url().startsWith(origin))
        console.error(
          '[response]',
          response.status(),
          response.request().method(),
          response.url()
        )
    })
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        console.error('[console]', message.text().slice(0, 300))
    })
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SLOW })

  if (steps.length) {
    for (const step of steps) {
      const [kind, ...rest] = step.split(':')
      const value = rest.join(':')
      if (kind === 'click') await page.getByTestId(value).first().click()
      else if (kind === 'text')
        await page.getByText(value, { exact: true }).first().click()
      else if (kind === 'role')
        await page.getByRole('button', { name: value }).first().click()
      else if (kind === 'wait') await page.waitForTimeout(Number(value))
      else if (kind === 'dump') console.log(await text())
      await shot(step.replace(/[^a-z0-9]+/gi, '-'))
    }
  } else {
    if (recover) {
      await page.getByTestId('web-sign-in-recovery').click()
      await page
        .getByTestId('web-sign-in-recovery-input')
        .fill(fs.readFileSync(recover, 'utf8').trim())
      await shot('recovery-key-entered')
      await page.getByTestId('web-sign-in-recovery-submit').click()
      if (await visible('web-sign-in-continue', 20_000))
        await page.getByTestId('web-sign-in-continue').click()
      await page.waitForTimeout(3_000)
      await shot('after-sign-in')
    } else if (!process.argv.includes('--signed-up')) {
      await page.getByTestId('web-sign-in-create-account').click()
      await shot('sign-up')
      const create = page.getByTestId('web-sign-up-create')
      await create.waitFor({ state: 'visible' })
      await page.waitForFunction(
        () => {
          const button = globalThis.document.querySelector(
            '[data-testid="web-sign-up-create"]'
          )
          return button && button.getAttribute('aria-disabled') !== 'true'
        },
        null,
        { timeout: SLOW }
      )
      await create.click()
      await page.getByTestId('web-sign-up-recovery-copy').click()
      if (recoveryOut)
        fs.writeFileSync(
          recoveryOut,
          await page.evaluate(() => navigator.clipboard.readText()),
          { mode: 0o600 }
        )
      await shot('recovery-key')
      await page.getByTestId('web-sign-up-recovery-saved').click()
      await page.waitForTimeout(3_000)
      await shot('after-sign-up')
    }

    await page.waitForFunction(
      () => globalThis.document.body.innerText.length > 0
    )
    await page.waitForTimeout(2_000)
    await page.route('**/__blank', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    )
    await page.goto(new URL('/__blank', url).href)
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = globalThis.indexedDB.open('witnesswork-stores')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('entries', 'readwrite')
            const entries = tx.objectStore('entries')
            const get = entries.get(['mmkv.default', 'preferences'])
            get.onsuccess = () => {
              const saved = JSON.parse(get.result)
              Object.assign(saved.state, {
                onboardingComplete: true,
                scheduleIntroSeen: true,
              })
              entries.put(JSON.stringify(saved), [
                'mmkv.default',
                'preferences',
              ])
            }
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }
        })
    )
    await page.unroute('**/__blank')
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SLOW })
    await page.waitForTimeout(8_000)
    await shot('home')
    console.log(
      'stored keys:',
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const request = globalThis.indexedDB.open('witnesswork-keys')
            request.onerror = () => resolve('unreadable')
            request.onsuccess = () => {
              const keys = request.result
                .transaction('kv')
                .objectStore('kv')
                .getAllKeys()
              keys.onsuccess = () => resolve(keys.result.join(', '))
            }
          })
      )
    )
    console.log((await text()).replace(/\s+/g, ' ').slice(0, 300))
  }
} catch (error) {
  await shot('failed')
  console.error(await text().catch(() => ''))
  throw error
} finally {
  await page.waitForTimeout(2_000).catch(() => undefined)
  await context.close()
}
