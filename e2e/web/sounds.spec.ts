import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({
  signedIn: true,
  preferences: {
    audioEnabled: true,
    role: 'regularPioneer',
    roleHistory: null,
  },
})

type Play = { src: string; outcome: string }
type Probe = { __plays: Play[] }

const watchPlayback = (page: Page) =>
  page.evaluate(() => {
    const plays: Play[] = []
    ;(window as unknown as Probe).__plays = plays
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      const entry: Play = {
        src: this.currentSrc || this.src,
        outcome: 'pending',
      }
      plays.push(entry)
      this.addEventListener('error', () => {
        entry.outcome = `error ${this.error?.code} ${this.error?.message}`
      })
      const result = play.call(this)
      result.then(
        () => {
          entry.outcome = 'playing'
        },
        (error: Error) => {
          entry.outcome = `rejected ${error.name}: ${error.message}`
        }
      )
      return result
    }
  })

async function addTwoHours(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Time' })
    .click()
  await page.getByTestId('time-entry-duration-pill').click()
  await page.getByRole('listbox', { name: 'Hours' }).selectOption('2')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('time-entry-save').click()
}

async function expectChime(page: Page, plays: boolean) {
  await watchPlayback(page)
  await addTwoHours(page)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Probe).__plays))
    .toEqual([
      {
        src: expect.stringMatching(/success-chime\.[0-9a-f]{32}\.mp3$/),
        outcome: plays
          ? 'playing'
          : expect.stringMatching(/^(playing|pending)$/),
      },
    ])
  const [{ src }] = await page.evaluate(
    () => (window as unknown as Probe).__plays
  )
  expect(
    await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { Range: 'bytes=0-1' } })
      return {
        status: response.status,
        range: response.headers.get('Content-Range')?.replace(/\/\d+$/, ''),
        bytes: (await response.arrayBuffer()).byteLength,
      }
    }, src),
    'Safari asks for the first two bytes of a sound before it plays it'
  ).toEqual({ status: 206, range: 'bytes 0-1', bytes: 2 })
}

test('saving time plays the chime, from a file served in byte ranges', async ({
  app,
  browserName,
}) => {
  await expectChime(app, browserName !== 'webkit')
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('the chime plays from the precache, in byte ranges', async ({ app }) => {
    await expect
      .poll(
        () =>
          app.evaluate(async () => {
            const names = (await caches.keys()).filter((name) =>
              name.startsWith('workbox-precache')
            )
            const urls = (
              await Promise.all(
                names.map(async (name) => (await caches.open(name)).keys())
              )
            ).flat()
            return (
              navigator.serviceWorker.controller !== null &&
              urls.some((request) => request.url.includes('success-chime'))
            )
          }),
        { timeout: 60_000 }
      )
      .toBe(true)
    await expectChime(app, false)
  })
})
