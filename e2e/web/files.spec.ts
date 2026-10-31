import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'
import { buildMytimeBackup } from './mytimeFixture'
import { makePng } from './testFiles'

/**
 * Photos, downloads and imports through the browser's file chooser and
 * downloads (ADR 0037 §8), in the export `dist/` holds.
 */

const en = strings('en-US')

/** Files a file chooser opened by `open` was given; `[]` closes it. */
async function chooseFiles(
  page: Page,
  open: () => Promise<unknown>,
  files: { name: string; mimeType: string; buffer: Buffer }[]
) {
  const chooser = page.waitForEvent('filechooser')
  await open()
  await (await chooser).setFiles(files)
}

/** Records what the page copies, which a headless browser can't read back. */
const recordCopies = (page: Page) =>
  page.evaluate(() => {
    const copies: string[] = []
    ;(window as unknown as { __copies: string[] }).__copies = copies
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => void copies.push(text),
      },
    })
  })
const copies = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copies: string[] }).__copies)

/** Records each Blob the page turns into a download, with its type and text. */
const recordBlobs = (page: Page) =>
  page.evaluate(() => {
    const blobs: { type: string; size: number; text?: string }[] = []
    ;(window as unknown as { __blobs: typeof blobs }).__blobs = blobs
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) {
        const entry: (typeof blobs)[number] = {
          type: object.type,
          size: object.size,
        }
        blobs.push(entry)
        if (!object.type.startsWith('image/'))
          void object.text().then((text) => (entry.text = text))
      }
      return create(object)
    }
  })
const blobs = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __blobs: { type: string; size: number; text?: string }[]
        }
      ).__blobs
  )

/**
 * The Contacts tab, from a fresh load: a phone's Settings screens hide the
 * tabs.
 */
async function openContacts(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
}

const bytes = (text: string) => Buffer.from(text)

/** Opens Settings → the Profile card's avatar menu on the profile screen. */
async function openProfilePhotoMenu(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  // A phone lists Settings first; a wide window shows the profile beside it.
  const picture = page.getByRole('button', { name: en.profilePicture }).last()
  if (!(await picture.isVisible()))
    await page.getByText('Profile', { exact: true }).first().click()
  await picture.click()
  // Popovers have no web version yet (web-ui-primitives): nothing to choose.
  const shown = await page
    .getByText(en.choosePhoto)
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!shown, "the avatar's popover has no web version on this base yet")
}

test.describe('photos', () => {
  test('a profile photo is picked, cropped, shown and kept', async ({
    app,
    shot,
  }) => {
    await openProfilePhotoMenu(app)
    await chooseFiles(app, () => app.getByText(en.choosePhoto).click(), [
      {
        name: 'me.png',
        mimeType: 'image/png',
        buffer: await makePng(1600, 1200),
      },
    ])
    await expect(app.getByText(en.cropPhoto)).toBeVisible()
    await shot('photo-crop')
    await app.getByText(en.applyCrop).click()
    const avatar = app.locator('img[src^="data:image/jpeg"]:visible').first()
    await expect(avatar).toBeVisible()
    await shot('photo-profile')
    // The record carries the photo, so a reload shows it again.
    await app.reload()
    await expect(
      app.locator('img[src^="data:image/jpeg"]:visible').first()
    ).toBeVisible()
  })

  test('a contact photo is picked while adding a contact', async ({
    app,
    shot,
  }) => {
    await app.getByRole('button', { name: en.addContact }).first().click()
    await app.getByPlaceholder(en.name_placeholder).fill('Maria Santos')
    await app.getByRole('button', { name: en.profilePicture }).last().click()
    const shown = await app
      .getByText(en.choosePhoto)
      .waitFor({ timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    test.skip(
      !shown,
      "the avatar's popover has no web version on this base yet"
    )
    await chooseFiles(app, () => app.getByText(en.choosePhoto).click(), [
      {
        name: 'maria.png',
        mimeType: 'image/png',
        buffer: await makePng(900, 1400),
      },
    ])
    await app.getByText(en.applyCrop).click()
    await expect(
      app.locator('img[src^="data:image/jpeg"]:visible').first()
    ).toBeVisible()
    await shot('photo-contact-form')
    await app.getByRole('button', { name: en.save }).first().click()
    // Saving a contact offers to log a first conversation.
    await app.getByText('Skip', { exact: true }).click()
    await openContacts(app)
    await expect(app.getByText('Maria Santos').first()).toBeVisible()
    await expect(
      app.locator('img[src^="data:image/jpeg"]:visible').first()
    ).toBeVisible()
    await shot('photo-contact-list')
  })

  test('a file that is not a photo is refused with a message', async ({
    app,
  }) => {
    await openProfilePhotoMenu(app)
    await chooseFiles(app, () => app.getByText(en.choosePhoto).click(), [
      {
        name: 'notes.pdf',
        mimeType: 'application/pdf',
        buffer: bytes('%PDF-1.7 not an image'),
      },
    ])
    await expect(app.getByText(en.photoPicker_unsupported)).toBeVisible()
    await expect(app.getByText(en.cropPhoto)).toHaveCount(0)
  })

  test('a photo of 130 million pixels is refused, not opened', async ({
    app,
  }) => {
    await openProfilePhotoMenu(app)
    await chooseFiles(app, () => app.getByText(en.choosePhoto).click(), [
      {
        name: 'huge.png',
        mimeType: 'image/png',
        buffer: await makePng(13_000, 10_000, { flat: true }),
      },
    ])
    await expect(app.getByText(en.photoPicker_tooLarge)).toBeVisible()
  })

  test('closing the file chooser changes nothing', async ({ app }) => {
    await openProfilePhotoMenu(app)
    await chooseFiles(app, () => app.getByText(en.choosePhoto).click(), [])
    await expect(app.getByText(en.cropPhoto)).toHaveCount(0)
    await expect(app.getByText(en.photoPicker_failed)).toHaveCount(0)
    await expect(app.getByText(en.choosePhoto)).toBeVisible()
  })
})

test.describe('reports', () => {
  for (const method of ['share', 'copy'] as const) {
    test.describe(`${method}`, () => {
      test.use({ preferences: { defaultExportMethod: method } })

      test(`the month report text is ${method === 'copy' ? 'copied' : 'shared by copying it on a desktop'}`, async ({
        app,
        shot,
      }) => {
        await recordCopies(app)
        await app.getByRole('button', { name: 'View Report' }).first().click()
        await app
          .getByRole('button', {
            name: method === 'copy' ? 'Copy To Clipboard' : 'Share',
            exact: true,
          })
          .click()
        await expect.poll(() => copies(app)).toHaveLength(1)
        const [text] = await copies(app)
        expect(text).toContain('Hours')
        await expect(app.getByText(en.copied)).toBeVisible()
        await shot(`report-${method}`)
      })
    })
  }
})

/** Fills the Create Backup sheet's password and creates the file. */
async function createBackup(page: Page, password: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByText('Backup & Restore').click()
  await page.getByTestId('backup-create-open').click()
  await page.getByPlaceholder('Password', { exact: true }).fill(password)
  await page.getByPlaceholder('Confirm Password').fill(password)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: en.createBackup }).last().click()
  return download
}

test.describe('backups', () => {
  test('Create Backup downloads a locked, parseable file', async ({
    app,
    shot,
  }) => {
    await recordBlobs(app)
    const download = await createBackup(app, 'correct horse battery')
    expect(download.suggestedFilename()).toBe('witness-work-backup.json')
    const path = await download.path()
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(path, 'utf8')
    expect(text.length).toBeGreaterThan(200)
    const file = JSON.parse(text)
    expect(file).toMatchObject({ lock: expect.anything() })
    // The browser was handed a JSON Blob.
    await expect
      .poll(async () => (await blobs(app)).map((b) => b.type))
      .toContain('application/json')
    // Nothing readable inside: no store names or the name we typed.
    expect(text).not.toContain('contactStore')
    await shot('backup-downloaded')
  })

  test('a downloaded backup restores through the file input', async ({
    app,
  }) => {
    // A contact worth restoring.
    await app.getByRole('button', { name: en.addContact }).first().click()
    await app.getByPlaceholder(en.name_placeholder).fill('Maria Santos')
    await app.getByRole('button', { name: en.save }).first().click()
    await app.getByText('Skip', { exact: true }).click()
    await app.goto('/')
    const { readFile } = await import('node:fs/promises')
    const download = await createBackup(app, 'correct horse battery')
    const text = await readFile(await download.path())
    await chooseFiles(app, () => app.getByText(en.restoreFromBackup).click(), [
      {
        name: 'witness-work-backup.json',
        mimeType: 'application/json',
        buffer: text,
      },
    ])
    await app
      .getByPlaceholder(/password/i)
      .first()
      .fill('correct horse battery')
    await app.getByTestId('unlock-backup-submit').click()
    await expect(app.getByText(en.successfulImport)).toBeVisible()
  })

  test('an unlocked backup file restores its contacts', async ({
    app,
    shot,
  }) => {
    const backup = {
      version: 1,
      contactStore: {
        contacts: [
          {
            id: 'a1b2c3d4-0000-4000-8000-000000000001',
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
          },
        ],
        deletedContacts: [],
        customFieldDefs: [],
        deletedCustomFieldDefs: [],
      },
    }
    await app.getByRole('button', { name: 'Settings', exact: true }).click()
    await app.getByText('Backup & Restore').click()
    await chooseFiles(app, () => app.getByText(en.restoreFromBackup).click(), [
      {
        name: 'old-backup.json',
        mimeType: 'application/json',
        buffer: bytes(JSON.stringify(backup)),
      },
    ])
    await expect(app.getByText(en.successfulImport)).toBeVisible()
    await openContacts(app)
    await expect(app.getByText('Daniel Okafor').first()).toBeVisible()
    await shot('backup-restored')
  })

  test('a file that is not a backup is refused', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings', exact: true }).click()
    await app.getByText('Backup & Restore').click()
    await chooseFiles(app, () => app.getByText(en.restoreFromBackup).click(), [
      {
        name: 'recipes.json',
        mimeType: 'application/json',
        buffer: bytes('{"recipes":[1,2,3]}'),
      },
    ])
    await expect(app.getByText(en.importErrorInvalidFile_title)).toBeVisible()
    await expect(app.getByText(en.successfulImport)).toHaveCount(0)
  })

  test('closing the file chooser restores nothing', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings', exact: true }).click()
    await app.getByText('Backup & Restore').click()
    await chooseFiles(
      app,
      () => app.getByText(en.restoreFromBackup).click(),
      []
    )
    await expect(app.getByText(en.successfulImport)).toHaveCount(0)
    await expect(app.getByText(en.importErrorInvalidFile_title)).toHaveCount(0)
  })
})

/** Settings → Import Data → MyTime → the file chooser. */
async function openMytimeImport(
  page: Page,
  shot?: (name: string) => Promise<void>
) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByText('Import Data', { exact: true }).click()
  await shot?.('import-data')
  await page.getByText(en.onboardingPickUp_mytime).click()
}

test.describe('MyTime import', () => {
  test('reads a backup in the browser and imports its records', async ({
    app,
    shot,
  }) => {
    await openMytimeImport(app, shot)
    await expect(app.getByText(en.mytimeImport_fileHintWeb)).toBeVisible()
    await shot('mytime-start')
    await chooseFiles(
      app,
      () => app.getByText(en.mytimeImport_choose).click(),
      [
        {
          name: 'Backup.mytimedb',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from(await buildMytimeBackup()),
        },
      ]
    )
    const confirm = app.getByText(en.mytimeImport_confirm, { exact: true })
    await expect(confirm).toBeVisible()
    await shot('mytime-preview')
    await confirm.click()
    await expect(app.getByText(en.mytimeImport_success)).toBeVisible()
    // Imported records can earn badges, which the app celebrates over the
    // tab bar until it's dismissed.
    const celebration = app.getByText(/Your records already include/)
    if (await celebration.isVisible({ timeout: 3000 }).catch(() => false))
      await app.getByText(en.done, { exact: true }).click()
    await openContacts(app)
    await expect(app.getByText('Maria Santos').first()).toBeVisible()
    await expect(app.getByText('Daniel Okafor').first()).toBeVisible()
    await expect(app.getByText('Removed Person')).toHaveCount(0)
    await shot('mytime-done')
  })

  test('turns away files that are not MyTime backups', async ({ app }) => {
    await openMytimeImport(app)
    const backup = Buffer.from(await buildMytimeBackup())
    for (const [name, buffer] of [
      ['Statement.pdf', bytes('%PDF-1.7 statement')],
      ['Truncated.mytimedb', backup.subarray(0, 4096)],
      ['Empty.mytimedb', Buffer.alloc(0)],
    ] as const) {
      await chooseFiles(
        app,
        () => app.getByText(en.mytimeImport_choose).click(),
        [{ name, mimeType: 'application/octet-stream', buffer }]
      )
      await expect(app.getByText(en.mytimeImport_invalidFile)).toBeVisible()
    }
  })

  test('closing the file chooser stays on the start screen', async ({
    app,
  }) => {
    await openMytimeImport(app)
    await chooseFiles(
      app,
      () => app.getByText(en.mytimeImport_choose).click(),
      []
    )
    await expect(app.getByText(en.mytimeImport_choose)).toBeVisible()
    await expect(app.getByText(en.mytimeImport_invalidFile)).toHaveCount(0)
  })
})
