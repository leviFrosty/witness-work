import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'
import { buildMytimeBackup } from './mytimeFixture'

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
  const tab = page.getByRole('button', { name: 'Contacts', exact: true })
  // Imported records can earn badges, whose welcome covers the tab bar when it
  // arrives, however late: dismiss it as often as it gets in the way.
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

const bytes = (text: string) => Buffer.from(text)

// Choosing a photo isn't offered on the web (it has no photo sync): see
// `syncedPhotos.spec.ts`. Picking and downscaling stay covered in
// `src/lib/files/pickWebImages.test.ts` and `webImages` for other flows.
// TODO: bring back the photo chooser cases (unsupported file, too large,
// cancel, crop) with Choose Photo, and `makePng` with them.

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
    // tab bar until it's dismissed: "Your badges are here" with Later, or
    // "Your records already include" with Done.
    const celebration = app
      .getByText(en.badges_welcomeTitle)
      .or(app.getByText(/Your records already include/))
    const celebrated = await celebration
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (celebrated)
      await app
        .getByText(en.badges_welcomeLater, { exact: true })
        .or(app.getByText(en.done, { exact: true }))
        .first()
        .click()
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
