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

/**
 * Masked session replay on the web (ADR 0043), through the web host's Worker so
 * the enforcing CSP and Trusted Types judge the bundled recorder. PostHog's
 * ingestion host is a stand-in that keeps what the page sends it, decoded; the
 * checks read those recordings. Sampling is forced on by the test-only hook a
 * development build reads (`__WW_REPLAY_TEST__`); a shipped build never does.
 */

const en = strings('en-US')

// Made-up people at made-up places.
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
  /** The visitor's country; null when Cloudflare can't say. */
  visitorCountry: string | null
  /** Sampling is forced on for the run (otherwise off, as for 90% of sessions). */
  sampled: boolean
}

const test = base.extend<Options & { ingest: Ingest }>({
  visitorCountry: ['US', { option: true }],
  sampled: [true, { option: true }],
  ingest: async ({ page, visitorCountry, sampled }, provide) => {
    // The app reads the country from ww-api's config, else from the trace. Here
    // the config says nothing (`readVisitorLocation.test.ts` covers its own
    // answer), so the stubbed trace decides.
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
    // The page under test only: the fixture's tab that seeds the stores must not
    // record, or it closes late and saves over the seed.
    await page.addInitScript(
      ({ sampleRate, debug }) => {
        ;(window as unknown as Record<string, unknown>).__WW_REPLAY_TEST__ = {
          sampleRate,
          asProduction: true,
          // Headless browsers look like bots, which the SDK skips.
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

/** Contacts opens on the map: its frame, and pins named for each Contact. */
const preferences = {
  showBadges: false,
  contactsView: 'map',
  hasCompletedMapOnboarding: true,
}

test.use({
  // Safari reports the recorder's look at the map's frame, which it can't
  // read, as a page error. It's the browser's note, not a failure of the page.
  tolerateErrors: /Blocked a frame with origin/,
  // Nothing here is about offline, and in WebKit a page the worker controls
  // sends some requests past the tests' stand-ins, to the real hosts.
  serviceWorkers: 'block',
  signedIn: true,
  seed: { contacts: people, conversations: visits },
  preferences,
})

const tab = (app: Page, name: string) =>
  app.getByRole('button', { name, exact: true })

/** The recorder's code has been fetched: the gate opened. */
const recorderLoaded = (ingest: Ingest) =>
  ingest.everyUrl.some((entry) => entry.url.pathname.includes('module.full'))

/** Clicks between tabs for `ms`, or until `done`. */
async function interact(
  app: Page,
  ms: number,
  done: () => boolean = () => false
) {
  const tabs = ['Schedule', 'Contacts', 'Home', 'Contacts']
  const end = Date.now() + ms
  for (let i = 0; Date.now() < end && !done(); i++) {
    const target = tab(app, tabs[i % tabs.length]!)
    // A phone's detail screens, Settings among them, have no tab bar.
    for (let back = 0; back < 4 && !(await target.isVisible()); back++)
      await app.goBack()
    await target.click()
    await app.waitForTimeout(600)
  }
}

/**
 * Clicks about until the first upload: the recorder holds everything until the
 * User interacts after it starts, and it starts a moment after it loads.
 */
async function recordUntilUploaded(app: Page, ingest: Ingest) {
  await expect
    .poll(() => recorderLoaded(ingest), { timeout: 30_000 })
    .toBe(true)
  await interact(app, 25_000, () => ingest.uploads().length > 0)
  await expect
    .poll(() => ingest.uploads().length, { timeout: 15_000 })
    .toBeGreaterThan(0)
}

/** Settings → Preferences → Privacy. */
async function openPrivacy(app: Page) {
  // A phone's Settings button is on Home; a computer's is in the sidebar.
  await tab(app, 'Home').click()
  await tab(app, 'Settings').click()
  await app.getByText('Preferences', { exact: true }).first().click()
  await app.getByText(en.privacy, { exact: true }).first().click()
  await expect(app.getByText(en.anonymousAnalytics)).toBeVisible()
}

const replayRow = (app: Page) =>
  app.getByRole('switch', { name: en.sessionReplayOptIn })
const analyticsRow = (app: Page) =>
  app.getByRole('switch', { name: en.anonymousAnalytics })
const protectionRow = (app: Page) =>
  app.getByRole('switch', { name: en.dataProtectionSwitchLabel })

/** Nothing is sent or fetched while the User keeps using the app. */
async function expectNoRecording(app: Page, ingest: Ingest) {
  await interact(app, 6_000)
  expect(recorderLoaded(ingest), 'the recorder was fetched').toBe(false)
  expect(ingest.uploads(), 'recordings sent').toEqual([])
}

/** Once the gate has closed, the count of uploads stays where it is. */
async function expectStopped(app: Page, ingest: Ingest) {
  // What was in flight when the gate closed has landed by now.
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

    // The page shows the names and addresses the recording must not. The map's
    // card shows the address of whichever Contact it has selected.
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

    // Typed text in a field, then a trail of screens that show it.
    await tab(app, 'Quick Action').click()
    await app.getByText('Create Plan', { exact: true }).click()
    const title = app.getByPlaceholder('Title (Optional)')
    await title.fill(TYPED)
    await expect(title).toHaveValue(TYPED)
    await app.waitForTimeout(1_500)
    await app.goBack()
    await tab(app, 'Contacts').click()
    await expect(app.locator('iframe').first()).toBeAttached()

    // The recording flushes every few seconds.
    await app.waitForTimeout(8_000)

    const events = ingest.snapshots()
    const recording = describeRecording(events)
    const everything = JSON.stringify(events)

    // The recording was decoded: the page's own chrome is in it.
    expect(recording.tags).toContain('div')
    expect(recording.texts).toContain('Contacts')

    for (const value of sensitive)
      expect(everything, `${value} in the recording`).not.toContain(value)

    // Interface text stays; everything else is stars.
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

    // Inputs: the field was typed in, and what was typed is masked.
    expect(recording.inputs.length).toBeGreaterThan(0)
    for (const input of recording.inputs) expect(input).toMatch(/^\**$/)

    // Attributes that carry content are blank.
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

    // The map frame, images and canvases are blocked: the recording holds an
    // empty box of the same size, with no address, content or drawing.
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
      // Only the recorder's own size and position, no `src` or anything else.
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
    // The recorder's own client sends nothing but a recording's snapshots, so
    // an event never reaches PostHog twice.
    expect(new Set(ingest.eventNames())).toEqual(new Set(['$snapshot']))
    // Besides the recording, the app's own client asks for its flags.
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
      // The map frame runs its own script on its own origin (docs/web-maps.md).
      if (resourceType === 'script')
        expect([origin, profile.mapsOrigin], `script ${url}`).toContain(
          url.origin
        )
      expect(url.hostname, `${url}`).not.toMatch(/posthog\.com$/)
    }
    // The ingestion host is asked for JSON and given data, never scripts.
    for (const { url, method } of ingest.requests) {
      expect(url.pathname).not.toMatch(/\.js$|^\/static\//)
      expect(method === 'GET' ? url.pathname : '/array/').toMatch(/^\/array\//)
    }
    // The fixture fails the test on a CSP or Trusted Types violation.
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
      // Data Protection Mode defaults on here; the opt-in is the gate too.
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

  // Leaving mid-request or while CanvasKit loads aborts it, which WebKit reports.
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
    // Outside the regions there is nothing to opt into.
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
