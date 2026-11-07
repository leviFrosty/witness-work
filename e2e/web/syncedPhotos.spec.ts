import type { Page } from '@playwright/test'
import { contentHash } from '../../src/lib/contentHash'
import { expect, readStoreRow, strings, test } from './fixtures'

const en = strings('en-US')

const CONTACT = 'a1b2c3d4-0000-4000-8000-000000000001'
const PHOTO = 'phone-photo-0001'
const REVISION = 'rev-from-the-phone'

const backup = {
  version: 1,
  contactStore: {
    contacts: [
      {
        id: CONTACT,
        createdAt: '2026-10-01T10:00:00.000Z',
        name: 'Daniel Okafor',
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
        avatar: {
          type: 'image',
          value: `icloud://contact-${CONTACT}`,
          revision: REVISION,
        },
      },
    ],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  },
  conversationStore: {
    conversations: [
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000002',
        contact: { id: CONTACT },
        date: '2026-10-02T10:00:00.000Z',
        note: 'Talked about the garden',
        noteDoc: {
          v: 1,
          textHash: contentHash('Talked about the garden'),
          doc: {
            type: 'doc',
            content: [
              { type: 'paragraph' },
              {
                type: 'image',
                attrs: { id: PHOTO, width: 400, height: 300 },
              },
            ],
          },
        },
        updatedAt: 1793403316101,
      },
    ],
    deletedConversations: [],
  },
}

async function dismissBadgesWelcome(page: Page) {
  await page
    .getByText('Done', { exact: true })
    .click({ timeout: 10_000 })
    .catch(() => undefined)
}

async function restorePhoneRecords(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByText('Backup & Restore').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByText(en.restoreFromBackup).click()
  await (
    await chooser
  ).setFiles([
    {
      name: 'phone.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    },
  ])
  await expect(page.getByText(en.successfulImport)).toBeVisible()
}

async function openContacts(page: Page) {
  await page.goto('/')
  const tab = page.getByRole('button', { name: 'Contacts', exact: true })
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await tab.click({ timeout: 6000 })
      return
    } catch {
      await page
        .getByText(en.badges_welcomeLater, { exact: true })
        .click({ timeout: 3000 })
        .catch(() => undefined)
    }
  }
  await tab.click()
}

const brokenImages = (page: Page) =>
  page.evaluate(() =>
    [...document.images]
      .filter(
        (img) =>
          img.getBoundingClientRect().width > 0 &&
          (img.src.startsWith('icloud:') ||
            (img.hasAttribute('src') && img.complete && !img.naturalWidth))
      )
      .map((img) => img.outerHTML.slice(0, 120))
  )

const storedContact = async (page: Page) => {
  const row = (await readStoreRow(page, 'mmkv.default', 'contacts')) as string
  return JSON.parse(row).state.contacts.find(
    (contact: { id: string }) => contact.id === CONTACT
  )
}

test.describe('photos without photo sync', () => {
  test.use({ preferences: { badgesWelcome: 'done' }, signedIn: true })

  test('the avatar menus offer emoji but no photo to choose', async ({
    app,
    shot,
  }) => {
    await app.getByRole('button', { name: 'Settings', exact: true }).click()
    const picture = app.getByRole('button', { name: en.profilePicture }).last()
    if (!(await picture.isVisible()))
      await app.getByText('Profile', { exact: true }).first().click()
    await picture.click()
    await expect(app.getByText('🌱').first()).toBeVisible()
    await expect(app.getByText(en.choosePhoto)).toHaveCount(0)
    await shot('avatar-menu-profile')
  })

  test('adding a contact offers no photo to choose', async ({ app, shot }) => {
    await app.getByRole('button', { name: en.addContact }).first().click()
    await app.getByPlaceholder(en.name_placeholder).fill('Maria Santos')
    await app.getByRole('button', { name: en.profilePicture }).last().click()
    await expect(app.getByText('🌱').first()).toBeVisible()
    await expect(app.getByText(en.choosePhoto)).toHaveCount(0)
    await shot('avatar-menu-contact')
  })

  test("a phone's contact photo shows initials, and editing the contact keeps its reference", async ({
    app,
    shot,
  }) => {
    await restorePhoneRecords(app)
    await openContacts(app)
    await app.getByText('Daniel Okafor').first().click()
    await dismissBadgesWelcome(app)
    await expect(
      app.getByText('D', { exact: true }).filter({ visible: true }).first()
    ).toBeVisible()
    expect(await brokenImages(app)).toEqual([])
    await shot('contact-detail-phone-photo')

    await app.getByRole('button', { name: en.moreActions }).last().click()
    await app.getByText(en.edit, { exact: true }).first().click()
    await expect(app.getByText(en.choosePhoto)).toHaveCount(0)
    await app.getByTestId('contact-name-input').fill('Daniel O. Okafor')
    await shot('contact-editor-phone-photo')
    await app.getByRole('button', { name: en.save }).first().click()
    await expect
      .poll(async () => (await storedContact(app)).name)
      .toBe('Daniel O. Okafor')
    expect((await storedContact(app)).avatar).toEqual({
      type: 'image',
      value: `icloud://contact-${CONTACT}`,
      revision: REVISION,
    })
    expect(await brokenImages(app)).toEqual([])
  })

  test("a phone's note photo shows a placeholder, and the note can't add photos", async ({
    app,
    shot,
  }) => {
    await restorePhoneRecords(app)
    await openContacts(app)
    await app.getByText('Daniel Okafor').first().click()
    await dismissBadgesWelcome(app)
    await app.getByText('Show more', { exact: true }).first().click()
    await expect(app.getByText(en.richText_photoMissing).first()).toBeVisible()
    expect(await brokenImages(app)).toEqual([])
    await shot('visit-phone-note-photo')
  })
})
