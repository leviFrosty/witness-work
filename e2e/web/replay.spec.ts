import type { Page } from '@playwright/test'
import { expect, profile, strings, test as base } from './fixtures'
import { answerMapKitTokens, mapsFrame, serveMapsFrame } from './mapsFrame'
import {
  captureIngest,
  describeRecording,
  walk,
  type Ingest,
} from './replayCapture'
import { cors } from './session'

const en = strings('en-US')

const people = [
  {
    id: 'c0ffee00-0000-4000-8000-0000000000a1',
    name: 'Avery Quillfeather',
    address: { line1: '1417 Lindenwood Lane', city: 'Maplecrest' },
    coordinate: { latitude: 39.1012, longitude: -84.5121 },
    note: 'Prefers visits after lunch on Tuesdays',
  },
  {
    id: 'c0ffee00-0000-4000-8000-0000000000a2',
    name: 'Briar Holloway',
    address: { line1: '22 Thistlewick Court', city: 'Maplecrest' },
    coordinate: { latitude: 39.1048, longitude: -84.5047 },
    note: 'Asked about the resurrection hope',
  },
].map(({ note, ...person }) => ({
  ...person,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: 1_788_000_000_000,
  customFields: { note },
}))

const visits = people.map((person, index) => ({
  id: `visit-${index + 1}`,
  contact: { id: person.id },
  date: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
  note: `Left the brochure titled Zanzibar${index}`,
  isBibleStudy: false,
}))

const TYPED = 'Marigold-Typed-Secret-4471'

const sensitive = [
  ...people.flatMap((person) => [
    person.name,
    person.name.split(' ')[1]!,
    person.address.line1,
    person.address.city,
    person.id,
    person.customFields.note,
  ]),
  'Zanzibar0',
  'Zanzibar1',
  TYPED,
]

type Options = {
  visitorCountry: string | null

  sampled: boolean
}

const test = base.extend<Options & { ingest: Ingest }>({
  visitorCountry: ['US', { option: true }],
  sampled: [true, { option: true }],
  ingest: async ({ page, visitorCountry, sampled }, provide) => {
    await page.route('**/app/v1/config*', (route) =>
      route.fulfill({
        status: route.request().method() === 'OPTIONS' ? 204 : 503,
        headers: cors,
      })
    )
    await page.route('**/cdn-cgi/trace', (route) =>
      visitorCountry === null
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            contentType: 'text/plain',
            body: `fl=1\nloc=${visitorCountry}\ntls=TLSv1.3\n`,
          })
    )

    await page.addInitScript(
      ({ sampleRate, debug }) => {
        ;(window as unknown as Record<string, unknown>).__WW_REPLAY_TEST__ = {
          sampleRate,
          asProduction: true,

          allowBots: true,
          debug,
        }
      },
      { sampleRate: sampled ? 1 : 0, debug: !!process.env.REPLAY_DEBUG }
    )
    await serveMapsFrame(page.context(), 'double')
    await answerMapKitTokens(page.context(), 200)
    await provide(await captureIngest(page))
  },
})

const preferences = {
  showBadges: false,
  contactsView: 'map',
  hasCompletedMapOnboarding: true,
}

test.use({
  tolerateErrors: /Blocked a frame with origin/,

  serviceWorkers: 'block',
  signedIn: true,
  seed: { contacts: people, conversations: visits },
  preferences,
})

const tab = (app: Page, name: string) =>
  app.getByRole('button', { name, exact: true })

const recorderLoaded = (ingest: Ingest) =>
  ingest.everyUrl.some((entry) => entry.url.pathname.includes('module.full'))

async function interact(
  app: Page,
  ms: number,
  done: () => boolean = () => false
) {
  const tabs = ['Schedule', 'Contacts', 'Home', 'Contacts']
  const end = Date.now() + ms
  for (let i = 0; Date.now() < end && !done(); i++) {
    const target = tab(app, tabs[i % tabs.length]!)

    for (let back = 0; back < 4 && !(await target.isVisible()); back++)
      await app.goBack()
    await target.click()
    await app.waitForTimeout(600)
  }
}

async function recordUntilUploaded(app: Page, ingest: Ingest) {
  await expect
    .poll(() => recorderLoaded(ingest), { timeout: 30_000 })
    .toBe(true)
  await interact(app, 25_000, () => ingest.uploads().length > 0)
  await expect
    .poll(() => ingest.uploads().length, { timeout: 15_000 })
    .toBeGreaterThan(0)
}

async function openPrivacy(app: Page) {
  await tab(app, 'Home').click()
  await tab(app, 'Settings').click()
  await app.getByText('Features', { exact: true }).first().click()
  await app.getByText(en.privacy, { exact: true }).first().click()
  await expect(app.getByText(en.anonymousAnalytics)).toBeVisible()
}

const replayRow = (app: Page) =>
  app.getByRole('switch', { name: en.sessionReplayOptIn })
const analyticsRow = (app: Page) =>
  app.getByRole('switch', { name: en.anonymousAnalytics })
const protectionRow = (app: Page) =>
  app.getByRole('switch', { name: en.dataProtectionSwitchLabel })

async function expectNoRecording(app: Page, ingest: Ingest) {
  await interact(app, 6_000)
  expect(recorderLoaded(ingest), 'the recorder was fetched').toBe(false)
  expect(ingest.uploads(), 'recordings sent').toEqual([])
}

async function expectStopped(app: Page, ingest: Ingest) {
  await app.waitForTimeout(2_000)
  const before = ingest.uploads().length
  await app.waitForTimeout(7_000)
  expect(ingest.uploads().length, 'recordings sent since').toBe(before)
}

test.describe('a sampled session outside the opt-in regions', () => {
  test('is recorded with every name, address, note and typed value masked', async ({
    ingest,
    app,
  }) => {
    await tab(app, 'Contacts').click()
    await mapsFrame(app)
    for (const person of people)
      await expect(
        app
          .getByRole('button', { name: new RegExp(`^${person.name}, `) })
          .first()
      ).toBeVisible()
    await recordUntilUploaded(app, ingest)

    const addresses = people.map((person) => person.address.line1)
    let onScreen = ''
    await expect
      .poll(
        async () => {
          await tab(app, 'Contacts').click()
          onScreen = await app.locator('body').innerText()
          return addresses.some((address) => onScreen.includes(address))
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    for (const person of people)
      expect(onScreen, `${person.name} on the page`).toContain(person.name)

    await tab(app, 'Quick Action').click()
    await app.getByText('Create Plan', { exact: true }).click()
    const title = app.getByPlaceholder('Title (Optional)')
    await title.fill(TYPED)
    await expect(title).toHaveValue(TYPED)
    await app.waitForTimeout(1_500)
    await app.goBack()
    await tab(app, 'Contacts').click()
    await expect(app.locator('iframe').first()).toBeAttached()

    await app.waitForTimeout(8_000)

    const events = ingest.snapshots()
    const recording = describeRecording(events)
    const everything = JSON.stringify(events)

    expect(recording.tags).toContain('div')
    expect(recording.texts).toContain('Contacts')

    for (const value of sensitive)
      expect(everything, `${value} in the recording`).not.toContain(value)

    const masked = recording.texts.filter((text) => /^\**$/.test(text.trim()))
    expect(masked.length).toBeGreaterThan(0)
    const interfaceStrings = new Set<string>()
    walk(en, (value) => {
      if (typeof value === 'string')
        interfaceStrings.add(value.replace(/\s+/g, ' ').trim())
    })
    for (const text of recording.texts) {
      if (!/\p{L}/u.test(text)) continue
      const trimmed = text.replace(/\s+/g, ' ').trim()
      expect(
        interfaceStrings.has(trimmed),
        `"${trimmed}" is not an interface string`
      ).toBe(true)
    }

    expect(recording.inputs.length).toBeGreaterThan(0)
    for (const input of recording.inputs) expect(input).toMatch(/^\**$/)

    const named = recording.attributes.filter(
      ({ name }) =>
        /^(aria-.*|title|alt|placeholder|href|src|srcset|value|id|name|for|content|label)$/i.test(
          name
        ) || name.startsWith('data-')
    )
    expect(named.length, 'content attributes in the recording').toBeGreaterThan(
      0
    )
    for (const { name, value } of named)
      expect(value, `${name}=${JSON.stringify(value)}`).toBeFalsy()

    const blockedTags = ['iframe', 'img', 'canvas', 'video', 'picture']
    const blocked = recording.elements.filter((element) =>
      blockedTags.includes(String(element.tagName))
    )
    expect(
      blocked.some((element) => element.tagName === 'iframe'),
      'the map frame is in the page'
    ).toBe(true)
    for (const element of blocked) {
      const attributes = (element.attributes ?? {}) as Record<string, unknown>

      const names = Object.keys(attributes)
      expect(names, `${element.tagName}`).toContain('rr_width')
      for (const name of names) expect(name).toMatch(/^rr_/)
      expect(element.childNodes ?? []).toEqual([])
    }
  })

  test('sends only snapshots, and no address that names anything', async ({
    ingest,
    app,
  }) => {
    await recordUntilUploaded(app, ingest)
    await app.waitForTimeout(3_000)

    expect(new Set(ingest.eventNames())).toEqual(new Set(['$snapshot']))

    for (const request of ingest.requests)
      if (request.method === 'POST')
        expect(request.url.pathname).toMatch(/^\/(s|flags)\//)
    for (const properties of ingest.snapshotProperties()) {
      expect(properties).toMatchObject({
        app_platform: 'web',
        app_variant: 'development',
      })
      for (const value of Object.values(properties))
        if (typeof value === 'string' && /^https?:/.test(value))
          expect(value).not.toMatch(/[?#]/)
    }
    for (const event of ingest.snapshots()) {
      const href = (event.data as { href?: unknown } | undefined)?.href
      if (event.type === 4 && typeof href === 'string')
        expect(href).not.toMatch(/[?#]|[0-9a-f]{8}-/)
    }
  })

  test('loads nothing from PostHog', async ({ ingest, app }) => {
    await recordUntilUploaded(app, ingest)
    const origin = new URL(app.url()).origin
    for (const { url, resourceType } of ingest.everyUrl) {
      if (resourceType === 'script')
        expect([origin, profile.mapsOrigin], `script ${url}`).toContain(
          url.origin
        )
      expect(url.hostname, `${url}`).not.toMatch(/posthog\.com$/)
    }

    for (const { url, method } of ingest.requests) {
      expect(url.pathname).not.toMatch(/\.js$|^\/static\//)
      expect(method === 'GET' ? url.pathname : '/array/').toMatch(/^\/array\//)
    }
  })
})

test.describe('a session outside the sample', () => {
  test.use({ sampled: false })

  test('records nothing and never fetches the recorder', async ({
    ingest,
    app,
  }) => {
    await expectNoRecording(app, ingest)
  })
})

test.describe('analytics off', () => {
  test.use({ preferences: { ...preferences, analyticsEnabled: false } })

  test('records nothing', async ({ ingest, app }) => {
    await expectNoRecording(app, ingest)
  })
})

test.describe('Data Protection Mode', () => {
  test.use({
    preferences: {
      ...preferences,
      dataProtectionMode: true,
      dataProtectionModeSetByUser: true,
    },
  })

  test('records nothing', async ({ ingest, app }) => {
    await expectNoRecording(app, ingest)
  })
})

test.describe('Data Protection Mode, with an opt-in', () => {
  test.use({
    visitorCountry: 'DE',
    preferences: {
      ...preferences,
      dataProtectionMode: true,
      dataProtectionModeSetByUser: true,
      sessionReplayOptIn: true,
    },
  })

  test('records nothing', async ({ ingest, app }) => {
    await expectNoRecording(app, ingest)
  })
})

for (const country of ['CH', 'DE', 'GB']) {
  test.describe(`a visitor in ${country}`, () => {
    test.use({
      visitorCountry: country,

      preferences: {
        ...preferences,
        dataProtectionMode: false,
        dataProtectionModeSetByUser: true,
      },
    })

    test('is not recorded before opting in', async ({ ingest, app }) => {
      await expectNoRecording(app, ingest)
    })
  })
}

test.describe('a visitor whose country is unknown', () => {
  test.use({ visitorCountry: null })

  test('is not recorded before opting in', async ({ ingest, app }) => {
    await expectNoRecording(app, ingest)
  })
})

test.describe('opting in', () => {
  test.use({
    visitorCountry: 'DE',
    preferences: {
      ...preferences,
      dataProtectionMode: false,
      dataProtectionModeSetByUser: true,
    },
  })

  test('starts recording when Settings turns it on, and stops when it is turned off', async ({
    ingest,
    app,
    shot,
  }) => {
    await expectNoRecording(app, ingest)
    await openPrivacy(app)
    await expect(replayRow(app)).not.toBeChecked()
    await shot('replay-opt-in')
    await replayRow(app).click()
    await expect(replayRow(app)).toBeChecked()
    await recordUntilUploaded(app, ingest)
    await openPrivacy(app)
    await replayRow(app).click()
    await expect(replayRow(app)).not.toBeChecked()
    await expectStopped(app, ingest)
  })

  test.use({
    tolerateErrors:
      /Blocked a frame with origin|fetching of the wasm failed|Fetch API cannot load/,
  })

  test('is remembered by this browser', async ({ ingest, app }) => {
    await openPrivacy(app)
    await replayRow(app).click()
    await expect(replayRow(app)).toBeChecked()
    await app.goto('/')
    await expect(tab(app, 'Home')).toBeVisible()
    await recordUntilUploaded(app, ingest)
  })
})

test.describe('with the opt-in already given', () => {
  test.use({
    visitorCountry: 'GB',
    preferences: {
      ...preferences,
      dataProtectionMode: false,
      dataProtectionModeSetByUser: true,
      sessionReplayOptIn: true,
    },
  })

  test('records, and stops when Data Protection Mode turns on', async ({
    ingest,
    app,
  }) => {
    await recordUntilUploaded(app, ingest)
    await openPrivacy(app)
    await protectionRow(app).click()
    await expect(protectionRow(app)).toBeChecked()
    await expectStopped(app, ingest)
  })
})

test.describe('mid-session', () => {
  test('stops as soon as analytics turn off', async ({ ingest, app }) => {
    await recordUntilUploaded(app, ingest)
    await openPrivacy(app)

    await expect(replayRow(app)).toHaveCount(0)
    await analyticsRow(app).click()
    await expect(analyticsRow(app)).not.toBeChecked()
    await expectStopped(app, ingest)
  })

  test('stops as soon as Data Protection Mode turns on', async ({
    ingest,
    app,
  }) => {
    await recordUntilUploaded(app, ingest)
    await openPrivacy(app)
    await protectionRow(app).click()
    await expect(protectionRow(app)).toBeChecked()
    await expectStopped(app, ingest)
  })
})
