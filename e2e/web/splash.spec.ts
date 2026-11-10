import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'

const en = strings('en-US')
const ENTRY = /\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js$/
const FONTS = /\.ttf$/

const PAGE_BAR = '#launch-splash-progress'
const APP_BAR = '.launch-splash-progress:not(#launch-splash-progress)'

function hold(page: Page, url: RegExp) {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  return page
    .route(url, async (route) => {
      await held
      await route.continue()
    })
    .then(() => release)
}

const splashState = (page: Page, bar: string) =>
  page.locator(bar).evaluate((bar) => {
    const box = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return [x, y, width, height].map((value) => Math.round(value * 10) / 10)
    }
    const animation = bar.firstElementChild!.getAnimations()[0]
    return {
      mark: box(bar.parentElement!.querySelector('svg')!),
      bar: box(bar),
      background: getComputedStyle(bar.closest('.launch-splash')!)
        .backgroundColor,
      animation: (animation as CSSAnimation).animationName,
      startTime: animation.startTime,
    }
  })

test('the splash shows a progress bar before the app’s script arrives, and the app’s splash carries it on', async ({
  page,
}) => {
  const releaseEntry = await hold(page, ENTRY)
  const releaseFonts = await hold(page, FONTS)
  await page.goto('/', { waitUntil: 'commit' })

  const pageBar = page.getByRole('progressbar', { name: en.common_loading })
  await expect(pageBar).toBeVisible()
  await expect(pageBar).toHaveAttribute('id', 'launch-splash-progress')
  const before = await splashState(page, PAGE_BAR)
  expect(before.animation).toBe('launch-splash-slide')
  expect(before.background).toBe('rgb(75, 210, 124)')
  const viewport = page.viewportSize()!
  expect(before.mark[0] + before.mark[2] / 2).toBeCloseTo(viewport.width / 2, 0)
  expect(before.mark[1] + before.mark[3] / 2).toBeCloseTo(
    viewport.height / 2,
    0
  )
  expect(before.bar[1]).toBeGreaterThan(before.mark[1] + before.mark[3])

  releaseEntry()
  await expect(page.locator(APP_BAR)).toBeVisible()
  await expect(page.locator(PAGE_BAR)).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveAccessibleName(
    en.common_loading
  )
  expect(await splashState(page, APP_BAR)).toEqual(before)

  releaseFonts()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the bar fades in place instead of sliding', async ({ page }) => {
    const releaseEntry = await hold(page, ENTRY)
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.getByRole('progressbar')).toBeVisible()
    expect((await splashState(page, PAGE_BAR)).animation).toBe(
      'launch-splash-pulse'
    )
    releaseEntry()
    await expect(page.locator(PAGE_BAR)).toHaveCount(0)
  })
})

test.describe('in another language', () => {
  test.use({ locale: 'ja-JP' })

  test('the bar is named in the browser’s language before the app loads', async ({
    page,
  }) => {
    const releaseEntry = await hold(page, ENTRY)
    await page.goto('/', { waitUntil: 'commit' })
    const bar = page.getByRole('progressbar', {
      name: strings('ja-JP').common_loading,
    })
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('lang', 'ja-JP')
    releaseEntry()
    await expect(page.locator(PAGE_BAR)).toHaveCount(0)
  })
})
