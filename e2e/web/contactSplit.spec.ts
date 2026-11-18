import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PRIYA = 'a1b2c3d4-0000-4000-8000-000000000001'
const HOUR = 60 * 60 * 1000

test.use({
  colorScheme: 'dark',
  preferences: {
    role: 'regularPioneer',
    roleHistory: null,
    badgesWelcome: 'done',
  },
  seed: {
    contacts: [
      {
        id: PRIYA,
        name: 'Priya Nair',
        createdAt: '2026-11-01T10:00:00.000Z',
        address: {
          line1: '',
          line2: '',
          city: '',
          state: '',
          zip: '',
          country: '',
        },
        email: '',
        phone: '',
        phoneRegionCode: 'US',
        customFields: {},
        updatedAt: 1793403316101,
      },
    ],
    conversations: [
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000002',
        contact: { id: PRIYA },
        date: new Date(Date.now() - 24 * HOUR).toISOString(),
        note: 'Talked about the garden',
        followUp: {
          date: new Date(Date.now() + HOUR).toISOString(),
          notifyMe: false,
        },
        updatedAt: 1793403316101,
      },
    ],
  },
  signedIn: true,
})

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

async function createContact(page: Page, name: string, finish: 'Add' | 'Skip') {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Contact' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByPlaceholder("What's their name?").fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/Visit(%20| )Form/)
  await page.getByRole('button', { name: finish, exact: true }).click()
}

const contactsHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Contacts', exact: true })

async function expectSplitShows(page: Page, name: string) {
  await expect(
    page.getByRole('button', { name: new RegExp(`^${name},`) })
  ).toBeVisible()
  await expect(
    page.getByText(name, { exact: true }).filter({ visible: true })
  ).not.toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Add to Favorites' })
  ).toBeVisible()
}

for (const finish of ['Add', 'Skip'] as const) {
  test(`a new contact opens where its details belong after ${finish}`, async ({
    app,
    shot,
  }) => {
    const name = `Jordan Ellis ${finish}`
    await createContact(app, name, finish)
    await expect(app).not.toHaveURL(/Visit(%20| )Form/)
    await expect(
      app.getByText(name).filter({ visible: true }).first()
    ).toBeVisible()
    await shot(`new-contact-${finish.toLowerCase()}`)

    if (isPhone(app)) {
      await expect(app).toHaveURL(/\/contact\/[0-9a-f-]+$/)
      await expect(contactsHeading(app)).toBeHidden()
      await expect(app.getByText(name).filter({ visible: true })).toHaveCount(1)
      await app.goBack()
      await expect(app).toHaveURL(/\/home\b/)
      return
    }

    await expect(app).toHaveURL(/\/contacts\/[0-9a-f-]+$/)
    await expect(contactsHeading(app)).toBeVisible()
    await expect(
      app.getByRole('button', { name: 'Home', exact: true })
    ).toBeVisible()
    await expectSplitShows(app, name)

    await app.goBack()
    await expect(app).toHaveURL(/\/home\b/)
    await app.goForward()
    await expect(app).toHaveURL(/\/contacts\/[0-9a-f-]+$/)
    await expectSplitShows(app, name)

    await app.reload()
    await expect(contactsHeading(app)).toBeVisible()
    await expectSplitShows(app, name)

    await app.getByRole('button', { name: /^Priya Nair,/ }).click()
    await expect(app).toHaveURL(new RegExp(`/contacts/${PRIYA}$`))
    await expectSplitShows(app, 'Priya Nair')
  })
}

test('a contact opened from Visit Details over Home lands where its details belong, and Back returns Home', async ({
  app,
  shot,
}) => {
  await expect(app).toHaveURL(/\/home\b/)
  await app.getByText('Priya Nair').filter({ visible: true }).first().click()
  await expect(app).toHaveURL(/\/visit\//)
  await app.getByTestId('visit-details-contact').click()

  if (isPhone(app)) {
    await expect(app).toHaveURL(new RegExp(`/contact/${PRIYA}`))
    await expect(contactsHeading(app)).toBeHidden()
  } else {
    await expect(app).toHaveURL(new RegExp(`/contacts/${PRIYA}$`))
    await expect(contactsHeading(app)).toBeVisible()
    await expectSplitShows(app, 'Priya Nair')
  }
  await shot('visit-details-contact')

  await app.goBack()
  await expect(app).toHaveURL(/\/home\b/)
  await expect(contactsHeading(app)).toBeHidden()
})
