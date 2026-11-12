import type { Locator, Page } from '@playwright/test'
import { peekWindowTopIndex } from '../../src/lib/peekWindow'
import { expect, test } from './fixtures'

test.use({
  preferences: { role: 'regularPioneer', roleHistory: null },
  signedIn: true,
})

const VISIBLE_ROWS = 5

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

const today = new Date()
const daysInMonth = new Date(
  today.getFullYear(),
  today.getMonth() + 1,
  0
).getDate()

const todayIndex = daysInMonth - today.getDate()

const scrollTop = (element: Locator) =>
  element.evaluate((node) => node.scrollTop)

const outerScroller = (list: Locator) =>
  list.evaluateHandle((node) => {
    let parent = node.parentElement
    while (parent) {
      const { overflowY } = getComputedStyle(parent)
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        parent.scrollHeight > parent.clientHeight
      )
        return parent
      parent = parent.parentElement
    }
    return document.scrollingElement!
  })

test('the Days card is a five-row window that opens on today', async ({
  app,
}, testInfo) => {
  test.skip(!isPhone(app), 'wide layouts list every day in their own pane')

  await app.getByRole('button', { name: 'Progress', exact: true }).click()
  const list = app.getByTestId('days-list-scroll')
  await expect(list).toBeVisible()
  await expect(app.getByText('Show all days')).toHaveCount(0)
  await expect(app.getByText('Hide future days')).toHaveCount(0)

  const rows = list.locator('[aria-label*=", "]').filter({ visible: true })
  await expect(rows).toHaveCount(daysInMonth)
  const todayRow = list.locator('[aria-label*=", Today, "]')
  await expect(todayRow).toHaveCount(1)

  const top = peekWindowTopIndex({
    count: daysInMonth,
    visibleRows: VISIBLE_ROWS,
    focusIndex: todayIndex,
  })
  const rowHeight = (await rows.first().boundingBox())!.height

  await expect
    .poll(async () => Math.round((await scrollTop(list)) / rowHeight))
    .toBe(top)
  const frame = (await list.boundingBox())!
  const todayBox = (await todayRow.boundingBox())!
  expect(Math.round((todayBox.y - frame.y) / rowHeight)).toBe(todayIndex - top)

  expect(frame.height / rowHeight).toBeGreaterThan(VISIBLE_ROWS + 0.3)
  expect(frame.height / rowHeight).toBeLessThan(VISIBLE_ROWS + 0.8)

  await list.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await app.screenshot({
    path: testInfo.outputPath('progress-days-open.png'),
  })

  const outer = await outerScroller(list)
  const outerTop = () => outer.evaluate((node) => node.scrollTop)
  const box = (await list.boundingBox())!
  await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  await app.mouse.wheel(0, -5000)
  await expect.poll(() => scrollTop(list)).toBe(0)
  await expect(rows.first()).toBeInViewport()

  await app.mouse.wheel(0, 5000)
  await expect
    .poll(() =>
      list.evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop
      )
    )
    .toBeLessThan(1)
  await expect(rows.last()).toBeInViewport()

  await outer.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await list.evaluate((node) => {
    node.scrollTop = 0
  })
  const before = await outerTop()
  expect(before).toBeGreaterThan(0)
  const at = (await list.boundingBox())!
  await app.mouse.move(at.x + at.width / 2, at.y + rowHeight / 2)
  await app.mouse.wheel(0, -300)
  await expect.poll(outerTop).toBeLessThan(before)
  await app.screenshot({
    path: testInfo.outputPath('progress-days-outer-scrolled.png'),
  })
})

test('the Days pane beside the report opens on today', async ({
  app,
}, testInfo) => {
  test.skip(isPhone(app), 'phones show the five-row window')

  await app.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(app.getByText('Show all days')).toHaveCount(0)
  await expect(app.getByTestId('days-list-scroll')).toHaveCount(0)

  const todayRow = app.locator('[aria-label*=", Today, "]')
  await expect(todayRow).toBeVisible()
  await expect(todayRow).toBeInViewport()
  await app.screenshot({
    path: testInfo.outputPath('progress-days-pane.png'),
  })
})
