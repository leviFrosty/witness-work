import type { Page } from '@playwright/test'
import { expect, openBlankOnOrigin, readStoreRow, test } from './fixtures'

/**
 * The web keeps the User's data in IndexedDB, one tab at a time
 * (docs/web-storage.md).
 */

test.use({ preferences: { role: 'regularPioneer', roleHistory: null } })

/** The first visible element with exactly this text. */
const shown = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).filter({ visible: true }).first()

async function addContact(page: Page, name: string) {
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
  await page.getByRole('button', { name: 'Add Contact' }).first().click()
  await page.getByRole('textbox', { name: "What's their name?" }).fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  // Saving offers to log the first visit, then shows the new contact.
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(shown(page, name)).toBeVisible()
  // On a phone the contact covers the tabs.
  if (!(await page.getByRole('button', { name: 'Quick Action' }).isVisible()))
    await page.goBack()
  await expect(page.getByRole('button', { name: 'Quick Action' })).toBeVisible()
}

/** Contacts, from a fresh page load. */
async function expectContactAfterLoad(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(shown(page, name)).toBeVisible()
}

async function addTwoHours(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Time' })
    .click()
  await page.getByTestId('time-entry-duration-pill').click()
  // Scroll the hours wheel two rows, as a finger or trackpad would.
  await page.evaluate(() => {
    const wheel = [...document.querySelectorAll<HTMLElement>('*')].find(
      (el) =>
        el.scrollHeight > el.clientHeight + 100 &&
        /^0\s*1\s*2/.test(el.textContent ?? '')
    )!
    wheel.scrollTop = (wheel.scrollHeight / 100) * 2
    wheel.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('heading', { name: 'Add Time' })).toBeHidden()
}

const timeEntries = (raw: unknown) =>
  Object.values(
    JSON.parse(raw as string).state.serviceReports as Record<
      string,
      Record<string, { hours: number; minutes: number }[]>
    >
  ).flatMap((month) => Object.values(month).flat())

/** What the app keeps in `localStorage` (SDKs' own keys aside). */
const appKeysInLocalStorage = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage).filter(
      (key) =>
        key.includes('\\') ||
        key.startsWith('mmkv') ||
        /contacts|serviceReports|preferences/.test(
          localStorage.getItem(key) ?? ''
        )
    )
  )

test('keeps a new contact and time entry across a reload, in IndexedDB only', async ({
  app,
}) => {
  await addContact(app, 'Rowan Persist')
  await addTwoHours(app)
  await expectContactAfterLoad(app, 'Rowan Persist')

  const contacts = await readStoreRow(app, 'mmkv.default', 'contacts')
  expect(contacts).toContain('Rowan Persist')
  const entries = timeEntries(
    await readStoreRow(app, 'mmkv.default', 'serviceReports')
  )
  expect(entries.some((e) => e.hours * 60 + e.minutes > 0)).toBe(true)

  expect(await appKeysInLocalStorage(app)).toEqual([])
  console.log(
    'localStorage keys:',
    JSON.stringify(await app.evaluate(() => Object.keys(localStorage)))
  )
})

test('runs in one tab at a time, and Use Here takes over without losing an edit', async ({
  app,
  shot,
}) => {
  const other = await app.context().newPage()
  await other.goto('/')
  await expect(
    other.getByText('WitnessWork Is Open in Another Tab')
  ).toBeVisible()
  const useHere = other.getByRole('button', { name: 'Use Here' })
  const box = await useHere.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await other.bringToFront()
  await other.waitForTimeout(1000)
  await other.screenshot({
    path: `${process.env.WW_WEB_SHOTS ?? '/tmp'}/in-another-tab-${test.info().project.name}.png`,
  })

  // An edit in the first tab, then straight to the other one.
  await addContact(app, 'Edited Before Takeover')
  await useHere.click()
  await expect(
    other.getByRole('button', { name: 'Quick Action' })
  ).toBeVisible()
  await other.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(shown(other, 'Edited Before Takeover')).toBeVisible()

  // The first tab stood down.
  await expect(
    app.getByText('WitnessWork Is Open in Another Tab')
  ).toBeVisible()
  await shot('first-tab-after-takeover')

  // And an edit in the new tab isn't overwritten by the old one.
  await addContact(other, 'Edited After Takeover')
  await expectContactAfterLoad(other, 'Edited After Takeover')
  await expect(shown(other, 'Edited Before Takeover')).toBeVisible()
  await other.close()
})

test('says once when the browser is out of space, keeps working, and saves later', async ({
  app,
}) => {
  await app.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if ((globalThis as { wwFull?: boolean }).wwFull) {
        throw new DOMException('Simulated', 'QuotaExceededError')
      }
      return put.apply(this, args)
    }
  })
  await app.reload()
  await expect(app.getByRole('button', { name: 'Quick Action' })).toBeVisible()
  await app.evaluate(() => ((globalThis as { wwFull?: boolean }).wwFull = true))
  await addContact(app, 'Saved Later')
  await expect(
    app.getByText('This browser is out of space for WitnessWork')
  ).toBeVisible()
  expect(await readStoreRow(app, 'mmkv.default', 'contacts')).not.toContain(
    'Saved Later'
  )

  // Space comes back; leaving the page retries.
  await app.evaluate(() => {
    ;(globalThis as { wwFull?: boolean }).wwFull = false
    window.dispatchEvent(new Event('pagehide'))
  })
  await expect
    .poll(() => readStoreRow(app, 'mmkv.default', 'contacts'))
    .toContain('Saved Later')
  await expectContactAfterLoad(app, 'Saved Later')
})

test('runs from memory, and says so, where the browser refuses IndexedDB', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('Refused', 'SecurityError')
      },
    })
  })
  await page.goto('/')
  await expect(
    page.getByText("This browser isn't letting WitnessWork save")
  ).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
})

test('boots as a fresh install once the site’s data is gone', async ({
  app,
}) => {
  await addContact(app, 'Wiped Away')
  // As Safari's 7-day wipe or clearing site data leaves it.
  await openBlankOnOrigin(app)
  await app.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('witnesswork-stores')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
  )
  await app.goto('/')
  await expect(app.getByRole('button', { name: 'Get Started' })).toBeVisible()
})
