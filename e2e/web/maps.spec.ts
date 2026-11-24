import type { Page } from '@playwright/test'
import { expect, profile, strings, test } from './fixtures'
import {
  answerDirections,
  answerMapKitTokens,
  answerPlaceSearch,
  mapsFrame,
  mapsFrames,
  realMapKitKey,
  receivedByFrame,
  serveMapsFrame,
  useRealMapKit,
} from './mapsFrame'

const en = strings('en-US')

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

  customFields: { note: 'Prefers visits after lunch on Tuesdays' },
}))

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

  preferences: {
    contactsView: 'map',
    hasCompletedMapOnboarding: true,
    mapLocationPromptSeen: true,
    showBadges: false,
  },
})

const expectNothingSensitive = (received: unknown[]) => {
  const sent = JSON.stringify(received)
  for (const value of sensitive) expect(sent).not.toContain(value)
}

async function openMap(app: Page) {
  await app.getByRole('button', { name: 'Map', exact: true }).click()
  const frame = await mapsFrame(app)
  await expect(frame.locator('#map')).toBeVisible()
  return frame
}

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

    expect(tokens[0]).toEqual({
      body: { origin: profile.mapsOrigin },
      authorization: 'Bearer web-smoke-access-token',
    })
    await shot('maps-pins')

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

    const spread = async () =>
      (await box(app, people[1]!.name)).x - (await box(app, people[0]!.name)).x
    const wide = await spread()
    await app.mouse.move(map.x + map.width / 2, map.y + map.height / 2)
    await app.mouse.wheel(0, 400)
    await expect.poll(spread).toBeLessThan(wide * 0.6)
  })

  test('is its own sidebar item, and Contacts is the list', async ({ app }) => {
    await answerMapKitTokens(app.context(), 200)
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await expect(app.getByTestId('contacts-search')).toBeVisible()
    await expect(app.getByTestId('contacts-view-map')).toHaveCount(0)
    await expect(app.locator('iframe')).toHaveCount(0)

    await openMap(app)
    await expect(
      app.getByRole('heading', { name: 'Map', exact: true })
    ).toBeVisible()
    await expect(app.getByTestId('contacts-view-map')).toHaveCount(0)
  })

  test('stays on the map when the window gets too narrow for the sidebar', async ({
    app,
  }) => {
    await answerMapKitTokens(app.context(), 200)
    await openMap(app)
    await app.setViewportSize({ width: 800, height: 900 })

    await expect(app.getByTestId('contacts-view-map')).toBeVisible()
    await expect(
      app.getByRole('heading', { name: 'Contacts', exact: true })
    ).toBeVisible()
    await expect((await mapsFrame(app)).locator('#map')).toBeVisible()
    await expect(
      app.getByRole('button', { name: 'Map', exact: true })
    ).toHaveCount(1)

    await app.setViewportSize({ width: 1280, height: 900 })
    await expect(app.getByTestId('contacts-view-map')).toHaveCount(0)
  })

  test("opens a Contact's card from their pin", async ({ app, shot }) => {
    await answerMapKitTokens(app.context(), 200)
    await openMap(app)

    await pinFor(app, people[1]!.name).click({ force: true })
    await expect(app.getByText(people[1]!.address.line1).first()).toBeVisible()
    await shot('maps-card')
  })

  test('comes back by itself once the browser is online', async ({ app }) => {
    await answerMapKitTokens(app.context(), 200)
    await app.context().setOffline(true)
    await app.getByRole('button', { name: 'Map', exact: true }).click()

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

    await expect.poll(() => directions.length).toBe(1)
    expect(directions[0]).toEqual(
      people.map(({ coordinate }) => ({
        lat: coordinate.latitude,
        lng: coordinate.longitude,
      }))
    )

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
    await app
      .getByRole('dialog')
      .getByText(en.routeBuilder_map, { exact: true })
      .click()

    await expect.poll(() => mapsFrames(app).length).toBe(2)
    const picker = mapsFrames(app).at(-1)!
    const map = picker.locator('#map')
    await expect(map).toBeVisible()

    await expect(picker.locator('.pin')).toHaveCount(3)

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

test.describe('with real MapKit', () => {
  const key = realMapKitKey()
  test.skip(!key, 'needs WW_MAPKIT_JS_KEY (docs/web-maps.md#testing)')

  test.beforeEach(async ({ page }) => {
    await serveMapsFrame(page.context(), 'real')
    await useRealMapKit(page.context(), key!)
  })

  type MapKitPage = {
    mapkit: {
      maps: {
        padding: { top: number; right: number; left: number }
        convertCoordinateToPointOnPage(coordinate: unknown): {
          x: number
          y: number
        }
      }[]
      Coordinate: new (latitude: number, longitude: number) => unknown
    }
  }

  const mapkitView = async (app: Page) =>
    (await mapsFrame(app)).evaluate(
      (coordinates) => {
        const { mapkit } = window as unknown as MapKitPage
        const map = mapkit.maps[0]!
        return {
          padding: map.padding,
          points: coordinates.map((coordinate) => {
            const point = map.convertCoordinateToPointOnPage(
              new mapkit.Coordinate(coordinate.latitude, coordinate.longitude)
            )
            return { x: point.x, y: point.y }
          }),
        }
      },
      people.map((person) => person.coordinate)
    )

  const expectPinsOnMapKit = async (app: Page) => {
    const frame = (await app.locator('iframe').boundingBox())!
    await expect
      .poll(async () => {
        const { points } = await mapkitView(app)
        let worst = 0
        for (const [index, person] of people.entries()) {
          const pin = pinFor(app, person.name)
          if (!(await pin.isVisible())) continue
          const box = (await pin.boundingBox())!
          worst = Math.max(
            worst,
            Math.abs(box.x + box.width / 2 - frame.x - points[index]!.x),
            Math.abs(box.y + box.height / 2 - frame.y - points[index]!.y)
          )
        }
        return worst
      })
      .toBeLessThan(1.5)
  }

  test('keeps pins on their coordinates as the map zooms and pans', async ({
    app,
    shot,
  }) => {
    await app.getByRole('button', { name: 'Map', exact: true }).click()
    const frame = await mapsFrame(app)
    await expect
      .poll(
        () =>
          frame.evaluate(() => {
            try {
              return !!(window as unknown as MapKitPage).mapkit.maps[0]
            } catch {
              return false
            }
          }),
        { timeout: 30_000 }
      )
      .toBe(true)
    for (const person of people)
      await expect(pinFor(app, person.name)).toBeVisible()
    await expectPinsOnMapKit(app)

    const box = (await app.locator('iframe').boundingBox())!
    const { padding, points } = await mapkitView(app)
    for (const point of points) {
      expect(point.x).toBeGreaterThan(padding.left + 60)
      expect(point.x).toBeLessThan(box.width - padding.right - 60)
      expect(point.y).toBeGreaterThan(padding.top + 36)
    }
    await shot('maps-real-pins')

    const at = { x: box.x + box.width * 0.35, y: box.y + box.height / 2 }
    await app.mouse.move(at.x, at.y)
    await app.mouse.wheel(0, -300)
    await expectPinsOnMapKit(app)

    await app.mouse.down()
    await app.mouse.move(at.x + 80, at.y - 60, { steps: 10 })
    await app.mouse.up()
    await expectPinsOnMapKit(app)

    await app.mouse.wheel(0, 600)
    await expectPinsOnMapKit(app)
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
    await app.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(app.getByText(en.map_unavailableTitle)).toBeVisible()
    await expect(app.getByText(en.map_unavailableNotReady)).toBeVisible()

    await expect(
      app.getByRole('button', { name: en.common_tryAgain })
    ).toHaveCount(0)

    await expect(app.getByText(people[0]!.name).first()).toBeVisible()
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await expect(app.getByText(people[2]!.name).first()).toBeVisible()
    await app.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(app.getByText(en.map_unavailableTitle)).toBeVisible()

    expect(apple).toEqual([])
    await expect(app.locator('iframe')).toHaveCount(0)
    await shot('maps-unavailable')
  })
})

test.describe('location explanation modal and web permission persistence', () => {
  test.use({
    colorScheme: 'dark',
    preferences: {
      contactsView: 'map',
      hasCompletedMapOnboarding: true,
      mapLocationPromptSeen: false,
      placeSearchLocationAsked: false,
      showBadges: false,
    },
  })

  test.beforeEach(async ({ page }) => {
    await serveMapsFrame(page.context(), 'double')
    await answerMapKitTokens(page.context(), 200)
    await page.addInitScript(() => {
      const counts = { watch: 0, current: 0 }
      ;(window as unknown as { __geoCounts: typeof counts }).__geoCounts =
        counts
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: {
          query: async () => ({
            state: 'prompt',
            addEventListener() {},
            removeEventListener() {},
          }),
        },
      })
      const pos = () => ({
        coords: {
          latitude: 39.1012,
          longitude: -84.5121,
          altitude: null,
          accuracy: 15,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      })
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition(success: PositionCallback) {
            counts.watch += 1
            setTimeout(() => success(pos() as GeolocationPosition), 10)
            return counts.watch
          },
          getCurrentPosition(success: PositionCallback) {
            counts.current += 1
            setTimeout(() => success(pos() as GeolocationPosition), 10)
          },
          clearWatch() {},
        },
      })
    })
  })

  test('presents the quick location explanation card modal on first map open and remembers dismissal', async ({
    app,
    shot,
  }) => {
    await openMap(app)
    const dialog = app.getByTestId('map-location-prompt')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(en.mapLocation_title)).toBeVisible()
    await expect(dialog.getByText(en.mapLocation_subtitle)).toBeVisible()
    await shot('map-location-prompt')

    await dialog.getByTestId('map-location-prompt-dismiss').click()
    await expect(dialog).toBeHidden()

    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await openMap(app)
    await expect(app.getByTestId('map-location-prompt')).toHaveCount(0)
  })

  test('persists granted location across map, contact address input, and returning to map even when permissions.query stays prompt', async ({
    app,
  }) => {
    await openMap(app)
    const dialog = app.getByTestId('map-location-prompt')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('map-location-prompt-dismiss').click()
    await expect(dialog).toBeHidden()

    await app
      .getByRole('button', { name: en.map_centerOnMyLocation, exact: true })
      .click()

    await expect
      .poll(() =>
        app.evaluate(
          () =>
            (
              window as unknown as {
                __geoCounts: { watch: number; current: number }
              }
            ).__geoCounts
        )
      )
      .toEqual({ watch: 1, current: 0 })

    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByRole('button', { name: en.edit, exact: true }).click()

    const addressInput = app.getByRole('textbox', {
      name: en.enterAddress,
    })
    await expect(addressInput).toBeVisible()
    await expect(
      app.getByRole('button', { name: `About ${en.searchAddress}` })
    ).toBeVisible()
    await addressInput.click()
    await app.waitForTimeout(200)

    expect(
      await app.evaluate(
        () =>
          (
            window as unknown as {
              __geoCounts: { watch: number; current: number }
            }
          ).__geoCounts
      )
    ).toEqual({ watch: 1, current: 0 })

    await app.getByRole('button', { name: en.save, exact: true }).click()
    await expect(addressInput).toBeHidden()
    await openMap(app)
    await app.waitForTimeout(200)

    expect(
      await app.evaluate(
        () =>
          (
            window as unknown as {
              __geoCounts: { watch: number; current: number }
            }
          ).__geoCounts
      )
    ).toEqual({ watch: 1, current: 0 })
  })
})
