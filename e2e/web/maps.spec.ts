import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'
import {
  answerDirections,
  answerMapKitTokens,
  answerPlaceSearch,
  mapsFrame,
  mapsFrames,
  receivedByFrame,
  serveMapsFrame,
} from './mapsFrame'

/**
 * The web's map (docs/web-maps.md): the app frames the maps frame at the
 * profile's maps origin and draws its own pins and cards over it. These run
 * against the frame's test double, which speaks the real protocol through the
 * real frame controller, and against the real frame for the unavailable state.
 */

const en = strings('en-US')

// Made-up people at made-up places around one block.
const people = [
  {
    id: 'c0ffee00-0000-4000-8000-000000000001',
    name: 'Avery Quillfeather',
    address: { line1: '1417 Lindenwood Lane', city: 'Maplecrest' },
    coordinate: { latitude: 39.1012, longitude: -84.5121 },
  },
  {
    id: 'c0ffee00-0000-4000-8000-000000000002',
    name: 'Briar Holloway',
    address: { line1: '22 Thistlewick Court', city: 'Maplecrest' },
    coordinate: { latitude: 39.1048, longitude: -84.5047 },
  },
  {
    id: 'c0ffee00-0000-4000-8000-000000000003',
    name: 'Corin Ashdale',
    address: { line1: '905 Quarry Bend Road', city: 'Maplecrest' },
    coordinate: { latitude: 39.0981, longitude: -84.5008 },
  },
].map((person) => ({
  ...person,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: 1_788_000_000_000,
  // Kept on the Contact, never sent anywhere.
  customFields: { note: 'Prefers visits after lunch on Tuesdays' },
}))

/** Today's Follow-ups with each, so today's route has three stops. */
/**
 * Today's Follow-ups, still ahead whenever the run starts, so Home offers Plan
 * Route: ten minutes apart, and never past midnight.
 */
const followUpAt = (index: number) => {
  const endOfDay = new Date().setHours(23, 59, 0, 0)
  const at = Math.min(
    Date.now() + (index + 1) * 10 * 60_000,
    endOfDay - (people.length - index) * 60_000
  )
  return new Date(at).toISOString()
}

const followUps = people.map((person, index) => ({
  id: `visit-${index + 1}`,
  contact: { id: person.id },
  date: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(),
  note: 'Prefers visits after lunch',
  isBibleStudy: false,
  followUp: {
    date: followUpAt(index),
    notifyMe: false,
    topic: 'Bring the brochure',
  },
}))

const sensitive = [
  ...people.flatMap((person) => [
    person.name,
    person.address.line1,
    person.address.city,
    person.id,
  ]),
  'Prefers visits after lunch',
  'Bring the brochure',
]

test.use({
  signedIn: true,
  seed: { contacts: people, conversations: followUps },
  // The seeded visits earn badges, whose welcome would cover the map.
  preferences: {
    contactsView: 'map',
    hasCompletedMapOnboarding: true,
    showBadges: false,
  },
})

/** No name, address, note, topic or Contact id in what the frame got. */
const expectNothingSensitive = (received: unknown[]) => {
  const sent = JSON.stringify(received)
  for (const value of sensitive) expect(sent).not.toContain(value)
}

/** Opens the Contacts tab, which shows the map. */
async function openMap(app: Page) {
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  const frame = await mapsFrame(app)
  await expect(frame.locator('#map')).toBeVisible()
  return frame
}

/** A Contact's pin over the map, named as its accessibility label names it. */
const pinFor = (app: Page, name: string) =>
  app
    .getByTestId('map-view')
    .getByRole('button', { name: new RegExp(`^${name}, `) })

const box = async (app: Page, name: string) =>
  (await pinFor(app, name).boundingBox())!

test.describe('with the test double', () => {
  test.beforeEach(async ({ page }) => {
    await serveMapsFrame(page.context(), 'double')
  })

  test('shows pins for Contacts, and moves them with the map', async ({
    app,
    shot,
  }) => {
    const tokens = await answerMapKitTokens(app.context(), 200)
    const frame = await openMap(app)
    for (const person of people)
      await expect(pinFor(app, person.name)).toBeVisible()
    // The app asked with its session, for this frame's origin only.
    expect(tokens[0]).toEqual({
      body: { origin: 'https://maps-dev.witnesswork.app' },
      authorization: 'Bearer web-smoke-access-token',
    })
    await shot('maps-pins')

    // Drag the map: the app's own pins follow.
    const before = await box(app, people[0]!.name)
    const map = (await frame.locator('#map').boundingBox())!
    const start = { x: map.x + 40, y: map.y + map.height / 2 }
    await app.mouse.move(start.x, start.y)
    await app.mouse.down()
    await app.mouse.move(start.x + 60, start.y + 30, { steps: 8 })
    await app.mouse.up()
    await expect
      .poll(async () => (await box(app, people[0]!.name)).x - before.x)
      .toBeCloseTo(60, -1)
    expect((await box(app, people[0]!.name)).y - before.y).toBeCloseTo(30, -1)

    // Zoom out: the pins draw together.
    const spread = async () =>
      (await box(app, people[1]!.name)).x - (await box(app, people[0]!.name)).x
    const wide = await spread()
    await app.mouse.move(map.x + map.width / 2, map.y + map.height / 2)
    await app.mouse.wheel(0, 400)
    await expect.poll(spread).toBeLessThan(wide * 0.6)
  })

  test("opens a Contact's card from their pin", async ({ app, shot }) => {
    await answerMapKitTokens(app.context(), 200)
    await openMap(app)
    // Where the User taps: its card's clear spacer reaches down over the pin,
    // as on the native maps, and opens the same Contact.
    await pinFor(app, people[1]!.name).click({ force: true })
    await expect(app.getByText(people[1]!.address.line1).first()).toBeVisible()
    await shot('maps-card')
  })

  test('comes back by itself once the browser is online', async ({ app }) => {
    await answerMapKitTokens(app.context(), 200)
    await app.context().setOffline(true)
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    // The map says it's offline, or, before the service worker keeps the
    // screen's code (blocked here), the screen says it can't open yet.
    await expect(
      app
        .getByText(en.map_unavailableOffline)
        .or(app.getByText(en.screenUnavailable))
    ).toBeVisible()
    await app.context().setOffline(false)
    await expect((await mapsFrame(app)).locator('#map')).toBeVisible()
    await expect(pinFor(app, people[0]!.name)).toBeVisible()
  })

  test('drops a new-contact pin on a long press', async ({ app, shot }) => {
    await answerMapKitTokens(app.context(), 200)
    const frame = await openMap(app)
    const map = (await frame.locator('#map').boundingBox())!
    await app.mouse.move(map.x + map.width * 0.4, map.y + map.height * 0.7)
    await app.mouse.down()
    await app.waitForTimeout(900)
    await app.mouse.up()
    // The frame draws the dropped pin; the app offers to make a Contact there.
    await expect(frame.locator('.pin')).toHaveCount(1)
    await expect(
      app.getByRole('button', { name: en.map_createContact })
    ).toBeVisible()
    await shot('maps-dropped-pin')
  })

  test('never sends the frame a name, address, note or Contact id', async ({
    app,
  }) => {
    await answerMapKitTokens(app.context(), 200)
    const frame = await openMap(app)
    await pinFor(app, people[0]!.name).click({ force: true })
    const map = (await frame.locator('#map').boundingBox())!
    await app.mouse.move(map.x + map.width * 0.4, map.y + map.height * 0.7)
    await app.mouse.down()
    await app.waitForTimeout(900)
    await app.mouse.up()
    await expect(frame.locator('.pin')).toHaveCount(1)

    const received = await receivedByFrame(app)
    expect(received.length).toBeGreaterThan(3)
    expectNothingSensitive(received)
    // Only the protocol's own fields cross.
    const keys = new Set<string>()
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk)
      if (value && typeof value === 'object')
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key)
          walk(inner)
        }
    }
    walk(received)
    expect([...keys].sort()).toEqual(
      expect.arrayContaining(['protocol', 'type', 'v'])
    )
    for (const key of keys)
      expect([
        'protocol',
        'v',
        'type',
        'token',
        'language',
        'options',
        'colorScheme',
        'layer',
        'padding',
        'top',
        'right',
        'bottom',
        'left',
        'interactive',
        'showsPointsOfInterest',
        'region',
        'latitude',
        'longitude',
        'latitudeDelta',
        'longitudeDelta',
        'center',
        'duration',
        'coordinates',
        'animated',
        'pins',
        'id',
        'color',
        'draggable',
        'polylines',
        'width',
        'location',
        'points',
        'x',
        'y',
      ]).toContain(key)
  })
})

test.describe('Route Planning with the test double', () => {
  test.beforeEach(async ({ page }) => {
    await serveMapsFrame(page.context(), 'double')
    await answerMapKitTokens(page.context(), 200)
  })

  /** Home's Plan Route, for today's Follow-ups. */
  const openRoute = async (app: Page) => {
    await app
      .getByText(en.routePlan_homeAction, { exact: true })
      .first()
      .click()
    await expect(app).toHaveURL(/\/TodayRoute$/)
    const frame = await mapsFrame(app)
    await expect(frame.locator('#map')).toBeVisible()
    return frame
  }

  test('draws the road legs ww-api answers', async ({ app, shot }) => {
    const directions = await answerDirections(app.context())
    const frame = await openRoute(app)
    // Three stops, asked about in one request, coordinates only.
    await expect.poll(() => directions.length).toBe(1)
    expect(directions[0]).toEqual(
      people.map(({ coordinate }) => ({
        lat: coordinate.latitude,
        lng: coordinate.longitude,
      }))
    )
    // The line and its casing follow the road: three points a leg, not two.
    const lines = frame.locator('polyline')
    await expect(lines).toHaveCount(2)
    await expect
      .poll(
        async () =>
          (await lines.last().getAttribute('points'))?.split(' ').length
      )
      .toBe(7)
    for (const [index, person] of people.entries())
      await expect(
        app
          .getByRole('button', {
            name: new RegExp(`^Stop ${index + 1}, ${person.name},`),
          })
          .first()
      ).toBeVisible()
    expectNothingSensitive(await receivedByFrame(app))
    await shot('maps-route')
  })

  test('picks a stop on the Add Stop map', async ({ app }) => {
    await answerDirections(app.context())
    await openRoute(app)
    await app.getByText(en.routeBuilder_addStop, { exact: true }).click()
    await app.getByText(en.routeBuilder_map, { exact: true }).click()
    // The sheet's own map, over the route's.
    await expect.poll(() => mapsFrames(app).length).toBe(2)
    const picker = mapsFrames(app).at(-1)!
    const map = picker.locator('#map')
    await expect(map).toBeVisible()
    // The route's stops show in gray; a tap drops the pin there.
    await expect(picker.locator('.pin')).toHaveCount(3)
    // Below the location card a browser without location permission shows.
    const box = (await map.boundingBox())!
    await app.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75)
    await expect(picker.locator('.pin')).toHaveCount(4)
    await app.getByText(en.routeBuilder_addToRoute, { exact: true }).click()
    await expect(
      app.getByText(en.routeBuilder_pinnedPlace).first()
    ).toBeVisible()
  })

  test.describe('near the User', () => {
    test.use({
      geolocation: { latitude: 39.1012, longitude: -84.5121 },
      permissions: ['geolocation'],
    })

    test('finds points of interest through ww-api', async ({ app, shot }) => {
      await answerDirections(app.context())
      const queries = await answerPlaceSearch(app.context())
      await openRoute(app)
      await app.getByText(en.routeBuilder_addStop, { exact: true }).click()
      await app
        .getByRole('textbox', { name: en.routeBuilder_searchPlaces })
        .fill('library')
      await app.getByText('Lantern Street Library').click()
      await expect.poll(() => queries.length).toBeGreaterThan(0)
      expect(queries.at(-1)).toMatchObject({ q: 'library', limit: '5' })
      expect(queries.at(-1)!.at).toMatch(/^39\.\d+,-84\.\d+$/)
      await expect(
        app
          .getByRole('button', { name: /^Stop 4, Lantern Street Library,/ })
          .first()
      ).toBeVisible()
      await shot('maps-route-place')
    })
  })
})

test.describe('without a map', () => {
  test.beforeEach(async ({ page }) => {
    await serveMapsFrame(page.context(), 'real')
  })

  test('says so in the map’s place when maps are unconfigured', async ({
    app,
    shot,
  }) => {
    const apple: string[] = []
    app.on('request', (request) => {
      if (request.url().includes('apple')) apple.push(request.url())
    })
    await answerMapKitTokens(app.context(), 503)
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await expect(app.getByText(en.map_unavailableTitle)).toBeVisible()
    await expect(app.getByText(en.map_unavailableNotReady)).toBeVisible()
    // Nothing to try again: the owner hasn't set up maps yet.
    await expect(
      app.getByRole('button', { name: en.common_tryAgain })
    ).toHaveCount(0)
    // The rest of the screen still works.
    await expect(app.getByText(people[0]!.name).first()).toBeVisible()
    await app.getByRole('button', { name: 'List', exact: true }).click()
    await expect(app.getByText(people[2]!.name).first()).toBeVisible()
    await app.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(app.getByText(en.map_unavailableTitle)).toBeVisible()
    // Without a token the frame never got an init, so nothing reached Apple,
    // and the frame is gone.
    expect(apple).toEqual([])
    await expect(app.locator('iframe')).toHaveCount(0)
    await shot('maps-unavailable')
  })
})
