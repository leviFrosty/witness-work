import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

test.use({
  colorScheme: 'dark',
  preferences: { badgesWelcome: 'done', showBadges: false },
  seed: {
    contacts: [
      {
        id: 'c-1',
        name: 'John Appleseed',
        address: {
          street: '18 Hawthorne Ave',
          city: 'Fort Thomas',
          region: 'Kentucky',
          postalCode: '41075-2413',
          country: 'United States',
        },
        createdAt: new Date(Date.now() - 86400_000 * 7).toISOString(),
        updatedAt: new Date(Date.now() - 86400_000).toISOString(),
      },
      {
        id: 'c-2',
        name: 'Maria Santos',
        address: {
          street: '42 Oak Lane',
          city: 'Newport',
          region: 'Kentucky',
        },
        createdAt: new Date(Date.now() - 86400_000 * 6).toISOString(),
        updatedAt: new Date(Date.now() - 86400_000).toISOString(),
      },
      {
        id: 'c-3',
        name: 'David Kim',
        address: {
          street: '900 Main St',
          city: 'Covington',
          region: 'Kentucky',
        },
        createdAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 86400_000).toISOString(),
      },
    ],
    conversations: [
      {
        id: 'v-1',
        contact: { id: 'c-1', name: 'John Appleseed' },
        date: new Date(Date.now() - 86400_000 * 3).toISOString(),
        followUp: {
          date: new Date(Date.now() + 3600_000 * 1).toISOString(),
          notifyMe: true,
          topic: 'Lesson 2',
        },
      },
      {
        id: 'v-2',
        contact: { id: 'c-2', name: 'Maria Santos' },
        date: new Date(Date.now() - 86400_000 * 2).toISOString(),
        followUp: {
          date: new Date(Date.now() + 3600_000 * 2).toISOString(),
          notifyMe: true,
          topic: 'Lesson 4',
        },
      },
      {
        id: 'v-3',
        contact: { id: 'c-3', name: 'David Kim' },
        date: new Date(Date.now() - 86400_000 * 1).toISOString(),
        followUp: {
          date: new Date(Date.now() + 3600_000 * 3).toISOString(),
          notifyMe: true,
          topic: 'Lesson 6',
        },
      },
    ],
  },
})

const getScrollInfo = (app: Page) =>
  app.evaluate(() => {
    const scroller = document.querySelector(
      '[data-ww-hdrag] > div'
    ) as HTMLElement | null
    if (!scroller) return null
    return {
      scrollLeft: Math.round(scroller.scrollLeft),
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      maxScroll: scroller.scrollWidth - scroller.clientWidth,
      snapType: getComputedStyle(scroller).scrollSnapType,
    }
  })

test('Upcoming Conversations can be navigated with buttons, mouse drag, and horizontal scroll on desktop', async ({
  app,
}) => {
  await expect(app.getByText('John Appleseed')).toBeVisible()
  await expect(app.getByText('0 of 3 done')).toBeVisible()

  const prev = app.getByRole('button', { name: 'Previous', exact: true })
  const next = app.getByRole('button', { name: 'Next', exact: true })

  await expect(prev).toBeVisible()
  await expect(next).toBeVisible()
  await expect(prev).toBeDisabled()
  await expect(next).toBeEnabled()

  const initial = await getScrollInfo(app)
  expect(initial?.scrollLeft).toBe(0)
  expect(initial?.snapType).toContain('x')

  await next.click()
  await expect
    .poll(async () => (await getScrollInfo(app))?.scrollLeft ?? 0)
    .toBeGreaterThan(250)
  await expect(prev).toBeEnabled()
  await expect(next).toBeEnabled()

  await next.click()
  await expect
    .poll(async () => {
      const info = await getScrollInfo(app)
      return info ? info.maxScroll - info.scrollLeft : 999
    })
    .toBeLessThanOrEqual(2)
  await expect(prev).toBeEnabled()
  await expect(next).toBeDisabled()

  await prev.click()
  await expect
    .poll(async () => {
      const info = await getScrollInfo(app)
      return info
        ? info.scrollLeft > 150 && info.scrollLeft < info.maxScroll - 100
        : false
    })
    .toBe(true)
  await expect(prev).toBeEnabled()
  await expect(next).toBeEnabled()

  const box = await app.locator('[data-ww-hdrag] > div').boundingBox()
  expect(box).not.toBeNull()
  const cy = box!.y + box!.height * 0.4

  await app.waitForTimeout(300)
  await app.mouse.move(box!.x + box!.width * 0.75, cy)
  await app.mouse.down()
  await app.mouse.move(box!.x + box!.width * 0.25, cy, { steps: 10 })
  await app.mouse.up()

  await expect
    .poll(async () => {
      const info = await getScrollInfo(app)
      return info ? info.maxScroll - info.scrollLeft : 999
    })
    .toBeLessThanOrEqual(2)
  await expect(next).toBeDisabled()
  await expect(app.getByText('0 of 3 done')).toBeVisible()

  await app.waitForTimeout(300)
  await app.mouse.move(box!.x + box!.width * 0.25, cy)
  await app.mouse.down()
  await app.mouse.move(box!.x + box!.width * 0.75, cy, { steps: 10 })
  await app.mouse.up()
  await expect
    .poll(async () => {
      const info = await getScrollInfo(app)
      return info ? info.scrollLeft < info.maxScroll - 100 : false
    })
    .toBe(true)
  await expect(next).toBeEnabled()

  await app.waitForTimeout(300)
  await app.mouse.move(box!.x + box!.width * 0.5, cy)
  await app.mouse.wheel(-500, 0)
  await expect
    .poll(async () => (await getScrollInfo(app))?.scrollLeft ?? 999)
    .toBeLessThanOrEqual(2)
  await expect(prev).toBeDisabled()
  await expect(next).toBeEnabled()

  await app.mouse.wheel(0, 200)
  await app.waitForTimeout(200)
  expect((await getScrollInfo(app))?.scrollLeft).toBeLessThanOrEqual(2)

  await app.mouse.wheel(0, -200)
  await app.waitForTimeout(200)
  await app.getByRole('button', { name: 'John Appleseed' }).click()
  await expect(app.getByText('Lesson 2')).toBeVisible()
})
