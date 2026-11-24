import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'

const PRIYA = 'a1b2c3d4-0000-4000-8000-000000000011'
const en = strings('en-US')

test.use({
  colorScheme: 'dark',
  signedIn: true,
  preferences: {
    role: 'regularPioneer',
    roleHistory: null,
    badgesWelcome: 'done',
    defaultExportMethod: 'hourglass',
    defaultNavigationMapProvider: 'google',
  },
  seed: {
    contacts: [
      {
        id: PRIYA,
        name: 'Priya Nair',
        createdAt: '2026-11-01T10:00:00.000Z',
        address: {
          line1: '123 Oak St',
          line2: '',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
          country: 'USA',
        },
        email: 'priya@example.com',
        phone: '',
        phoneRegionCode: 'US',
        customFields: {},
        updatedAt: 1793403316101,
      },
    ],
  },
})

async function expectOpensInNewTab(
  app: Page,
  trigger: () => Promise<void>,
  expectedUrl: RegExp
) {
  const beforeUrl = app.url()
  await app
    .context()
    .route(expectedUrl, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    )
  const popupPromise = app.context().waitForEvent('page')
  await trigger()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  expect(popup.url()).toMatch(expectedUrl)
  expect(await popup.evaluate(() => window.opener)).toBeNull()
  expect(app.url()).toBe(beforeUrl)
  await popup.close()
}

test('external actions open in a new tab and never replace the app tab', async ({
  app,
}) => {
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await app.getByRole('button', { name: /^Priya Nair,/ }).click()
  await expect(
    app.getByRole('button', { name: en.navigate, exact: true })
  ).toBeVisible()

  await expectOpensInNewTab(
    app,
    () => app.getByRole('button', { name: en.navigate, exact: true }).click(),
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/
  )
  await expect(
    app.getByRole('button', { name: en.navigate, exact: true })
  ).toBeVisible()

  await app.getByRole('button', { name: 'Progress', exact: true }).click()
  await app
    .getByRole('button', { name: en.viewReport, exact: true })
    .filter({ visible: true })
    .first()
    .click()
  const submitHourglass = en.submitToApp.replace('{{app}}', en.hourglass)
  await expect(
    app.getByRole('button', { name: submitHourglass, exact: true })
  ).toBeVisible()

  await expectOpensInNewTab(
    app,
    () =>
      app.getByRole('button', { name: submitHourglass, exact: true }).click(),
    /^https:\/\/app\.hourglass-app\.com\/report\/submit\?/
  )
  await expect(
    app.getByRole('button', { name: submitHourglass, exact: true })
  ).toBeVisible()

  await app.getByRole('button', { name: en.close, exact: true }).click()
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  const privacy = app.getByRole('button', {
    name: en.privacyPolicy,
    exact: true,
  })
  await privacy.scrollIntoViewIfNeeded()
  await expectOpensInNewTab(
    app,
    () => privacy.click(),
    /^https:\/\/(beta\.)?witnesswork\.app\/privacy$/
  )
  await expect(privacy).toBeVisible()
})
