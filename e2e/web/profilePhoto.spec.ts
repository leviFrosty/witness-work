import { randomBytes } from 'node:crypto'
import type { Page, Route } from '@playwright/test'
import {
  derivePhotoKeys,
  photoName,
  sealPhoto,
  sealPhotoMeta,
} from '../../src/lib/syncTransport/server/photoCrypto'
import {
  filenameForContact,
  filenameForProfile,
} from '../../src/lib/syncTransport/imageNames'
import {
  expect,
  profile as webProfile,
  readStoreRow,
  strings,
  test,
} from './fixtures'
import { cors, TEST_ACCOUNT_ID } from './session'
import { makePng } from './testFiles'

const en = strings('en-US')

const ACCOUNT_KEY = new Uint8Array(32).fill(7)
const PROFILE_REVISION = 'rev-profile-from-phone'
const CONTACT = 'a1b2c3d4-0000-4000-8000-000000000001'
const CONTACT_REVISION = 'rev-contact-from-phone'

const contact = {
  id: CONTACT,
  createdAt: '2026-10-01T10:00:00.000Z',
  name: 'Daniel Okafor',
  address: { line1: '', line2: '', city: '', state: '', zip: '', country: '' },
  email: '',
  phone: '',
  phoneRegionCode: 'US',
  customFields: {},
  updatedAt: 1793403316101,
  avatar: {
    type: 'image',
    value: `icloud://contact-${CONTACT}`,
    revision: CONTACT_REVISION,
  },
}

type Harness = {
  __WW_DEV__: {
    cloudSync: { photoPull: () => string; last: unknown }
  }
}

async function servePhonePhotos(page: Page) {
  const { photoKey, nameKey } = derivePhotoKeys(ACCOUNT_KEY)
  const photos = new Map<
    string,
    { name: string; meta: string; blob: Uint8Array }
  >()
  for (const [filename, side] of [
    [filenameForProfile(PROFILE_REVISION), 96],
    [filenameForContact(CONTACT, CONTACT_REVISION), 120],
  ] as const) {
    const address = {
      accountId: TEST_ACCOUNT_ID,
      name: photoName(nameKey, filename),
    }
    const blob = await sealPhoto(
      photoKey,
      new Uint8Array(await makePng(side, side)),
      address,
      new Uint8Array(randomBytes(24))
    )
    photos.set(address.name, {
      name: address.name,
      meta: sealPhotoMeta(
        photoKey,
        filename,
        address,
        new Uint8Array(randomBytes(24))
      ),
      blob,
    })
  }
  const requested: string[] = []
  const answer = (route: Route, respond: () => Promise<void>) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : respond()
  const api = `${webProfile.apiOrigin}/accounts/v1/sync/photos`
  await page.route(`${api}/list`, (route) =>
    answer(route, () =>
      route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          photos: [...photos.values()].map(({ name, meta, blob }) => ({
            name,
            size: blob.length,
            sha256: 'unchecked',
            createdAt: 1793403316101,
            meta,
          })),
          cursor: null,
          usage: { bytes: 0, count: photos.size, limit: 2 * 1024 ** 3 },
        }),
      })
    )
  )
  await page.route(`${api}/get`, (route) =>
    answer(route, async () => {
      const { name } = route.request().postDataJSON() as { name: string }
      requested.push(name)
      const photo = photos.get(name)
      await route.fulfill(
        photo
          ? {
              status: 200,
              headers: cors,
              contentType: 'application/octet-stream',
              body: Buffer.from(photo.blob),
            }
          : { status: 404, headers: cors }
      )
    })
  )
  return requested
}

async function pullPhotos(page: Page) {
  await page.evaluate(() =>
    (globalThis as unknown as Harness).__WW_DEV__.cloudSync.photoPull()
  )
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (globalThis as unknown as Harness).__WW_DEV__.cloudSync.last
        ),
      { timeout: 20_000 }
    )
    .toEqual({ done: true })
}

const shownImage = (container: ReturnType<Page['locator']>) =>
  container.locator('img').evaluateAll((images) =>
    images
      .filter((img) => img.getBoundingClientRect().width > 0)
      .map((img) => ({
        blob: (img as HTMLImageElement).src.startsWith('blob:'),
        width: (img as HTMLImageElement).naturalWidth,
      }))
  )

const storedProfileAvatar = async (page: Page) =>
  JSON.parse((await readStoreRow(page, 'mmkv.default', 'profile')) as string)
    .state.avatar

async function openSettingsProfile(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const picture = page.getByRole('button', { name: en.profilePicture }).last()
  if (!(await picture.isVisible()))
    await page.getByText('Profile', { exact: true }).first().click()
  return picture
}

async function openContacts(page: Page) {
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

test.describe('avatar photos over Cloud Sync', () => {
  test.use({
    colorScheme: 'dark',
    signedIn: true,
    accountKey: ACCOUNT_KEY,
    preferences: {
      badgesWelcome: 'done',
      iCloudSyncEnabled: true,
      cloudSyncEntitled: true,
      cloudSyncConfig: { enabled: true, entitlement: 'everyone' },
      cloudSyncPhotos: true,
    },
    seed: { contacts: [contact] },
    storeState: {
      profile: {
        name: 'Maria',
        hasCompletedProfileSetup: true,
        avatar: {
          type: 'image',
          value: 'icloud://profile',
          revision: PROFILE_REVISION,
        },
      },
    },
  })

  test("the phone's profile and contact photos download and show in the browser", async ({
    app,
    shot,
  }) => {
    const requested = await servePhonePhotos(app)
    await pullPhotos(app)
    expect(requested).toHaveLength(2)

    await expect
      .poll(async () => (await storedProfileAvatar(app)).value)
      .toMatch(
        /^webphoto:avatars\/profile-avatar-synced-rev-profile-from-phone\.jpg\?t=\d+$/
      )
    expect((await storedProfileAvatar(app)).revision).toBe(PROFILE_REVISION)

    const picture = await openSettingsProfile(app)
    await expect
      .poll(() => shownImage(picture))
      .toEqual([{ blob: true, width: 96 }])
    await shot('profile-photo-from-phone')
    await app.screenshot({
      path: '.verify/artifacts/web-profile-photo-from-phone.png',
    })

    await openContacts(app)
    const row = app.getByText('Daniel Okafor').first()
    await row.click()
    await app
      .getByText('Done', { exact: true })
      .click({ timeout: 5_000 })
      .catch(() => undefined)
    await expect
      .poll(() =>
        shownImage(app.locator('body')).then((images) =>
          images.filter((image) => image.width === 120)
        )
      )
      .toContainEqual({ blob: true, width: 120 })
    await shot('contact-photo-from-phone')
    await app.screenshot({
      path: '.verify/artifacts/web-contact-photo-from-phone.png',
    })
  })

  test('a photo chosen in the browser is kept for the phones as a profile photo', async ({
    app,
  }) => {
    const picture = await openSettingsProfile(app)
    await picture.click()
    const chooser = app.waitForEvent('filechooser')
    await app.getByText(en.choosePhoto).first().click()
    await (
      await chooser
    ).setFiles([
      {
        name: 'me.png',
        mimeType: 'image/png',
        buffer: await makePng(200, 160),
      },
    ])
    await app.getByText(en.applyCrop).first().click()

    await expect
      .poll(async () => (await storedProfileAvatar(app)).value)
      .toMatch(/^webphoto:avatars\/profile-avatar-picked-[\w-]+\.jpg\?t=/)
    const stored = await storedProfileAvatar(app)
    expect(stored.revision).toEqual(expect.any(String))
    expect(stored.value).toContain(stored.revision)
    await app.keyboard.press('Escape')
    await expect
      .poll(() => shownImage(picture))
      .toEqual([{ blob: true, width: 160 }])
    await app.screenshot({
      path: '.verify/artifacts/web-profile-photo-chosen.png',
    })

    await app.reload()
    const after = await openSettingsProfile(app)
    await expect
      .poll(() => shownImage(after))
      .toEqual([{ blob: true, width: 160 }])
  })
})
