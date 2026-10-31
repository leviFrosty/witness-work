import { expect, strings, test } from './fixtures'

/**
 * The web app boots and its main screens render, reached the way a User reaches
 * them: the tabs, Settings, and the Add menu.
 */

test('Home', async ({ app, shot }) => {
  await expect(app.getByRole('button', { name: 'Create Plan' })).toBeVisible()
  await shot('home')
})

test('Contacts', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(app).toHaveURL(/\/Contacts$/)
  await expect(app.getByRole('button', { name: 'Filters' })).toBeVisible()
  await shot('contacts')
})

test('Schedule', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Schedule', exact: true }).click()
  await expect(app).toHaveURL(/\/schedule$/)
  await expect(app.getByText('Today', { exact: true }).first()).toBeVisible()
  await shot('schedule')
})

test('Settings', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(app.getByText('Preferences', { exact: true })).toBeVisible()
  await shot('settings')
})

test('Create Plan from the Add menu', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Create Plan', { exact: true }).click()
  await expect(app.getByRole('heading', { name: 'Create Plan' })).toBeVisible()
  await expect(
    app.getByRole('button', { name: 'Add One Time Plan' })
  ).toBeVisible()
  await shot('create-plan')
})

test('Log Visit from the Add menu', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Log Visit', { exact: true }).click()
  await expect(app.getByRole('heading', { name: 'Log Visit' })).toBeVisible()
  await expect(app.getByText('No contacts yet')).toBeVisible()
  await shot('log-visit')
})

test('Help Center opens offline from its bundled snapshot', async ({
  app,
  shot,
}) => {
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await app.getByRole('button', { name: 'Help Center', exact: true }).click()
  await expect(
    app.getByRole('button', { name: 'Jump to Still Need Help' })
  ).toBeVisible()
  // English's translations are in the entry chunk; its own chunk is the
  // Help Center snapshot.
  const loaded = await app.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name)
  )
  expect(loaded.some((url) => /\/en-US-\w+\.js$/.test(url))).toBe(true)
  await shot('help-center')
})

test('onboarding starts fresh', async ({ page, shot }) => {
  // The welcome intro plays before its buttons respond; Reduce Motion skips it.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Get Started' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Start fresh' }).click()
  await page
    .getByRole('button', { name: /^Continue as Kingdom Publisher/ })
    .click()
  await expect(
    page.getByRole('button', { name: 'Continue as Kingdom Publisher' })
  ).toBeHidden()
  await shot('onboarding')
})

test.describe('in Arabic', () => {
  test.use({ language: 'ar' })

  test('loads the language and lays the page out right to left', async ({
    app,
    shot,
  }) => {
    await expect(
      app.getByRole('button', { name: strings('ar').Contacts, exact: true })
    ).toBeVisible()
    await expect(app.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(app.locator('html')).toHaveAttribute('lang', 'ar')
    await shot('home-arabic')
  })
})
