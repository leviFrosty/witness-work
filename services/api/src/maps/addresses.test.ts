import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

import { Hono } from 'hono'
import type { AppEnv, Environment } from '../types'
import { createHarness, type Harness } from '../test/buddies'
import { bearer, openTestSession, requestJson } from '../test/accounts'
import { createNamespace } from '../test/durableObjects'
import { resetAccountStatusCache } from '../accounts/auth'
import { createAccountsRoutes } from '../accounts/route'
import { accountsDb, setAccountStatus } from '../accounts/store'
import { RoutePlanningQuota } from '../routePlanning/quotaDO'
import { DEFAULT_OVERPASS_URL, TERRITORY_ADDRESS_LIMITS } from './config'
import { createMapsRoutes } from './route'
import {
  boundingBoxMeters,
  buildOverpassQuery,
  normalizeOutline,
  parseOverpassElements,
} from './territoryAddresses'

const T0 = Date.UTC(2026, 10, 12, 12)

/** A block around Alamo Square, San Francisco: about 400 m × 300 m. */
const OUTLINE = [
  { latitude: 37.775123456, longitude: -122.435 },
  { latitude: 37.775, longitude: -122.43 },
  { latitude: 37.778, longitude: -122.43 },
  { latitude: 37.778, longitude: -122.435 },
]

const overpassBody = (elements: unknown[], extra: object = {}) =>
  Response.json({ version: 0.6, generator: 'Overpass API', elements, ...extra })

let h: Harness
let env: Environment & Record<string, unknown>
let overpass: ReturnType<typeof vi.fn>
let now: number
let app: Hono<AppEnv>
let cached: Map<string, Response>
const accountsApp = createAccountsRoutes() as never

beforeEach(async () => {
  h = await createHarness()
  resetAccountStatusCache()
  env = h.env as Environment & Record<string, unknown>
  const quotas = createNamespace(
    (state) => new RoutePlanningQuota(state as never, env as never)
  )
  env.ROUTE_PLANNING_QUOTA =
    quotas.namespace as Environment['ROUTE_PLANNING_QUOTA']
  overpass = vi.fn(async () => overpassBody([]))
  now = T0
  cached = new Map()
  vi.stubGlobal('caches', {
    default: {
      match: vi.fn(async (request: Request) =>
        cached.get(request.url)?.clone()
      ),
      put: vi.fn(async (request: Request, response: Response) => {
        cached.set(request.url, response)
      }),
    },
  })
  app = new Hono<AppEnv>()
  app.route(
    '/maps/v1',
    createMapsRoutes({
      now: () => now,
      fetch: overpass as unknown as typeof fetch,
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const session = async () => {
  const opened = await openTestSession(accountsApp, h.env)
  return { ...opened, auth: bearer(opened.accessToken) }
}

const search = (body: unknown, headers: Record<string, string> = {}) =>
  requestJson(
    app as never,
    h.env,
    'POST',
    '/maps/v1/addresses',
    body,
    headers
  ) as Promise<{
    status: number
    headers: Headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any
  }>

/** Lets the route's background cache write land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('parseOverpassElements', () => {
  it('splits multi-value numbers, falls back to addr:place, and uses centers', () => {
    expect(
      parseOverpassElements([
        {
          type: 'node',
          id: 1,
          lat: 37.7765123,
          lon: -122.4325987,
          tags: {
            'addr:housenumber': '629;631; 633',
            'addr:street': 'Hayes Street',
          },
        },
        {
          type: 'node',
          id: 2,
          lat: 37.7766,
          lon: -122.4326,
          tags: {
            'addr:housenumber': '700,702',
            'addr:street': ' Hayes Street ',
          },
        },
        {
          type: 'way',
          id: 3,
          center: { lat: 37.77701, lon: -122.43302 },
          tags: { 'addr:housenumber': '12A', 'addr:place': 'Alamo Court' },
        },
        {
          type: 'relation',
          id: 4,
          center: { lat: 37.7771, lon: -122.4331 },
          tags: { 'addr:housenumber': '1', 'addr:street': 'Steiner Street' },
        },
      ])
    ).toEqual([
      {
        street: 'Hayes Street',
        number: '629',
        latitude: 37.77651,
        longitude: -122.4326,
      },
      {
        street: 'Hayes Street',
        number: '631',
        latitude: 37.77651,
        longitude: -122.4326,
      },
      {
        street: 'Hayes Street',
        number: '633',
        latitude: 37.77651,
        longitude: -122.4326,
      },
      {
        street: 'Hayes Street',
        number: '700',
        latitude: 37.7766,
        longitude: -122.4326,
      },
      {
        street: 'Hayes Street',
        number: '702',
        latitude: 37.7766,
        longitude: -122.4326,
      },
      {
        street: 'Alamo Court',
        number: '12A',
        latitude: 37.77701,
        longitude: -122.43302,
      },
      {
        street: 'Steiner Street',
        number: '1',
        latitude: 37.7771,
        longitude: -122.4331,
      },
    ])
  })

  it('skips what it can’t place or label, and dedupes by street and number', () => {
    expect(
      parseOverpassElements([
        // No street or place.
        { type: 'node', lat: 1, lon: 1, tags: { 'addr:housenumber': '5' } },
        // No position: a way without its center, a node out of range.
        {
          type: 'way',
          tags: { 'addr:housenumber': '6', 'addr:street': 'A St' },
        },
        {
          type: 'node',
          lat: 91,
          lon: 0,
          tags: { 'addr:housenumber': '7', 'addr:street': 'A St' },
        },
        // Labels: blank, too long, or not a string.
        {
          type: 'node',
          lat: 1,
          lon: 1,
          tags: { 'addr:housenumber': ' ;, ', 'addr:street': 'A St' },
        },
        {
          type: 'node',
          lat: 1,
          lon: 1,
          tags: { 'addr:housenumber': '1234567890123', 'addr:street': 'A St' },
        },
        {
          type: 'node',
          lat: 1,
          lon: 1,
          tags: { 'addr:housenumber': 8, 'addr:street': 'A St' },
        },
        {
          type: 'node',
          lat: 1,
          lon: 1,
          tags: { 'addr:housenumber': '9', 'addr:street': '   ' },
        },
        'junk',
        null,
        { type: 'node', lat: 1, lon: 1 },
        // Kept once: the second 10 A St (another point) is a duplicate.
        {
          type: 'node',
          lat: 1,
          lon: 1,
          tags: {
            'addr:housenumber': '10;1234567890123',
            'addr:street': 'A St',
          },
        },
        {
          type: 'node',
          lat: 2,
          lon: 2,
          tags: { 'addr:housenumber': ' 10 ', 'addr:street': 'A St' },
        },
        {
          type: 'node',
          lat: 2,
          lon: 2,
          tags: { 'addr:housenumber': '10', 'addr:street': 'B St' },
        },
      ])
    ).toEqual([
      { street: 'A St', number: '10', latitude: 1, longitude: 1 },
      { street: 'B St', number: '10', latitude: 2, longitude: 2 },
    ])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 2_000 }, (_, i) => ({
      type: 'node',
      lat: 37.77,
      lon: -122.43,
      tags: {
        'addr:housenumber': `${i * 2};${i * 2 + 1}`,
        'addr:street': 'Long Street',
      },
    }))
    const addresses = parseOverpassElements(many)
    expect(addresses).toHaveLength(TERRITORY_ADDRESS_LIMITS.maxAddresses)
    expect(addresses.at(-1)!.number).toBe(
      String(TERRITORY_ADDRESS_LIMITS.maxAddresses - 1)
    )
  })
})

describe('outline helpers', () => {
  it('rounds to 5 decimals, drops a closing point, and builds the query', () => {
    const closed = [...OUTLINE, { ...OUTLINE[0]! }]
    const normalized = normalizeOutline(closed)
    expect(normalized).toEqual([
      { latitude: 37.77512, longitude: -122.435 },
      { latitude: 37.775, longitude: -122.43 },
      { latitude: 37.778, longitude: -122.43 },
      { latitude: 37.778, longitude: -122.435 },
    ])
    expect(normalizeOutline(OUTLINE)).toEqual(normalized)
    expect(buildOverpassQuery(normalized)).toBe(
      '[out:json][timeout:25];nwr["addr:housenumber"](poly:"37.77512 -122.435 37.775 -122.43 37.778 -122.43 37.778 -122.435");out tags center;'
    )
  })

  it('measures the bounding box in metres', () => {
    const box = boundingBoxMeters(OUTLINE)
    expect(box.heightMeters).toBeGreaterThan(300)
    expect(box.heightMeters).toBeLessThan(340)
    expect(box.widthMeters).toBeGreaterThan(430)
    expect(box.widthMeters).toBeLessThan(450)
  })
})

describe('POST /maps/v1/addresses', () => {
  it('asks Overpass with the rounded outline and answers the addresses', async () => {
    overpass.mockResolvedValueOnce(
      overpassBody([
        {
          type: 'node',
          id: 1,
          lat: 37.776512,
          lon: -122.432498,
          tags: { 'addr:housenumber': '710', 'addr:street': 'Steiner Street' },
        },
        {
          type: 'way',
          id: 2,
          center: { lat: 37.7768, lon: -122.4331 },
          tags: { 'addr:housenumber': '1;3', 'addr:street': 'Hayes Street' },
        },
      ])
    )
    const { auth } = await session()
    const response = await search({ outline: OUTLINE }, auth)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.body).toEqual({
      ok: true,
      source: 'openstreetmap',
      attribution: '© OpenStreetMap contributors',
      addresses: [
        {
          street: 'Steiner Street',
          number: '710',
          latitude: 37.77651,
          longitude: -122.4325,
        },
        {
          street: 'Hayes Street',
          number: '1',
          latitude: 37.7768,
          longitude: -122.4331,
        },
        {
          street: 'Hayes Street',
          number: '3',
          latitude: 37.7768,
          longitude: -122.4331,
        },
      ],
    })

    expect(overpass).toHaveBeenCalledOnce()
    const [url, init] = overpass.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(DEFAULT_OVERPASS_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'User-Agent': 'WitnessWork-API/1.0 (+https://witnesswork.app)',
    })
    const form = init.body as URLSearchParams
    expect([...form.keys()]).toEqual(['data'])
    expect(form.get('data')).toBe(buildOverpassQuery(normalizeOutline(OUTLINE)))
  })

  it('uses OVERPASS_URL when set', async () => {
    env.OVERPASS_URL = 'https://overpass.example/api/interpreter'
    const { auth } = await session()
    expect((await search({ outline: OUTLINE }, auth)).status).toBe(200)
    expect(overpass.mock.calls[0]![0]).toBe(
      'https://overpass.example/api/interpreter'
    )
  })

  it('answers a repeat search of the same territory from the cache', async () => {
    overpass.mockResolvedValueOnce(
      overpassBody([
        {
          type: 'node',
          lat: 37.7765,
          lon: -122.4325,
          tags: { 'addr:housenumber': '710', 'addr:street': 'Steiner Street' },
        },
      ])
    )
    const { auth } = await session()
    const first = await search({ outline: OUTLINE }, auth)
    await settle()
    expect(cached.size).toBe(1)
    const [key] = [...cached.keys()]
    // The key is a hash, never the coordinates.
    expect(key).toMatch(/\/maps\/v1\/addresses\/cache\/v1\/[0-9a-f]{64}$/)
    expect(key).not.toContain('37.77')

    // The same outline closed and less rounded is the same territory.
    const again = await search(
      {
        outline: [
          ...OUTLINE.map((p) => ({ ...p, longitude: p.longitude + 0.000001 })),
          { ...OUTLINE[0]! },
        ],
      },
      auth
    )
    expect(again.status).toBe(200)
    expect(again.headers.get('cache-control')).toBe('no-store')
    expect(again.body).toEqual(first.body)
    expect(overpass).toHaveBeenCalledOnce()

    // Another territory asks Overpass.
    await search({ outline: OUTLINE.slice(0, 3) }, auth)
    expect(overpass).toHaveBeenCalledTimes(2)
  })

  it('doesn’t cache failures', async () => {
    overpass.mockResolvedValueOnce(new Response('busy', { status: 429 }))
    const { auth } = await session()
    expect((await search({ outline: OUTLINE }, auth)).status).toBe(503)
    await settle()
    expect(cached.size).toBe(0)
    expect((await search({ outline: OUTLINE }, auth)).status).toBe(200)
    expect(overpass).toHaveBeenCalledTimes(2)
  })

  it('needs a session from an active account', async () => {
    const none = await search({ outline: OUTLINE })
    expect(none.status).toBe(401)
    expect(none.body.code).toBe('unauthorized')

    const { accountId, auth } = await session()
    await setAccountStatus(
      accountsDb(h.accountsDb!),
      accountId,
      'suspended',
      'report'
    )
    const suspended = await search({ outline: OUTLINE }, auth)
    expect(suspended.status).toBe(403)
    expect(suspended.body.code).toBe('suspended')
    expect(overpass).not.toHaveBeenCalled()
  })

  it('refuses bad bodies before Overpass or the quota', async () => {
    const { auth } = await session()
    const point = { latitude: 37.77, longitude: -122.43 }
    for (const [body, field] of [
      ['not json', 'body'],
      [[], 'body'],
      [{}, 'outline'],
      [{ outline: OUTLINE, extra: 1 }, 'body'],
      [{ outline: 'x' }, 'outline'],
      [{ outline: [point, point] }, 'outline'],
      [{ outline: Array.from({ length: 201 }, () => point) }, 'outline'],
      [{ outline: [point, point, { latitude: 91, longitude: 0 }] }, 'outline'],
      [
        { outline: [point, point, { latitude: 0, longitude: -181 }] },
        'outline',
      ],
      [{ outline: [point, point, { latitude: '1', longitude: 0 }] }, 'outline'],
      [
        { outline: [point, point, { latitude: 1, longitude: 0, label: 'x' }] },
        'outline',
      ],
      [{ outline: [point, point, { lat: 1, lng: 0 }] }, 'outline'],
    ] as const) {
      const response =
        body === 'not json'
          ? await (app
              .request(
                '/maps/v1/addresses',
                {
                  method: 'POST',
                  headers: { ...auth, 'content-type': 'application/json' },
                  body: '{"outline": [',
                },
                h.env
              )
              .then(async (r) => ({
                status: r.status,
                body: await r.json(),
              })) as Promise<{
              status: number
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              body: any
            }>)
          : await search(body, auth)
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400)
      expect(response.body).toMatchObject({
        ok: false,
        code: 'bad_request',
        field,
      })
    }

    const huge = await search(
      {
        outline: OUTLINE,
        padding: 'x'.repeat(TERRITORY_ADDRESS_LIMITS.maxBodyBytes),
      },
      auth
    )
    expect(huge.status).toBe(413)
    expect(huge.body.code).toBe('too_large')

    // About 3.3 km north to south.
    const tall = await search(
      {
        outline: [
          { latitude: 37.75, longitude: -122.43 },
          { latitude: 37.78, longitude: -122.43 },
          { latitude: 37.78, longitude: -122.429 },
        ],
      },
      auth
    )
    expect(tall.status).toBe(413)
    expect(tall.body.code).toBe('area_too_large')
    // About 3.5 km east to west.
    const wide = await search(
      {
        outline: [
          { latitude: 37.77, longitude: -122.46 },
          { latitude: 37.77, longitude: -122.42 },
          { latitude: 37.771, longitude: -122.42 },
        ],
      },
      auth
    )
    expect(wide.status).toBe(413)
    expect(wide.body.code).toBe('area_too_large')

    expect(overpass).not.toHaveBeenCalled()
    // None of them spent a search.
    for (let i = 0; i < TERRITORY_ADDRESS_LIMITS.minuteLimit; i++)
      expect((await search({ outline: OUTLINE }, auth)).status).toBe(200)
  })

  it('limits searches per account per minute and per day, cached or not', async () => {
    const first = await session()
    for (let i = 0; i < TERRITORY_ADDRESS_LIMITS.minuteLimit; i++)
      expect((await search({ outline: OUTLINE }, first.auth)).status).toBe(200)
    const limited = await search({ outline: OUTLINE }, first.auth)
    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('rate_limited')
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.body.retryAfter).toBe(
      Number(limited.headers.get('retry-after'))
    )

    // Another account has its own budget.
    const other = await session()
    expect((await search({ outline: OUTLINE }, other.auth)).status).toBe(200)

    let searched = TERRITORY_ADDRESS_LIMITS.minuteLimit
    while (searched < TERRITORY_ADDRESS_LIMITS.dailyLimit) {
      now += 61_000
      for (
        let i = 0;
        i < TERRITORY_ADDRESS_LIMITS.minuteLimit &&
        searched < TERRITORY_ADDRESS_LIMITS.dailyLimit;
        i++, searched++
      )
        expect((await search({ outline: OUTLINE }, first.auth)).status).toBe(
          200
        )
    }
    now += 61_000
    const daily = await search({ outline: OUTLINE }, first.auth)
    expect(daily.status).toBe(429)
    expect(daily.body.code).toBe('daily_limit')
    expect(Number(daily.headers.get('retry-after'))).toBeGreaterThan(60)
  })

  it('maps Overpass failures onto the shared envelope', async () => {
    const { auth } = await session()
    // Each call is a new territory, so nothing comes from the cache.
    let shift = 0
    const call = () => {
      shift += 0.001
      return search(
        {
          outline: OUTLINE.map((p) => ({ ...p, latitude: p.latitude + shift })),
        },
        auth
      )
    }
    now -= 24 * 60 * 60 * 1000

    overpass.mockResolvedValueOnce(
      new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '7' },
      })
    )
    const tooMany = await call()
    expect(tooMany.status).toBe(503)
    expect(tooMany.body).toEqual({
      ok: false,
      error: 'upstream_busy',
      code: 'upstream_busy',
      retryAfter: 7,
    })
    expect(tooMany.headers.get('retry-after')).toBe('7')

    overpass.mockResolvedValueOnce(
      new Response('<html>Gateway Timeout</html>', { status: 504 })
    )
    const gateway = await call()
    expect(gateway.status).toBe(503)
    expect(gateway.body.code).toBe('upstream_busy')
    expect(gateway.headers.get('retry-after')).toBe('60')

    overpass.mockResolvedValueOnce(
      overpassBody([], {
        remark:
          'runtime error: Query timed out in "query" at line 1 after 25 seconds.',
      })
    )
    const timedOut = await call()
    expect(timedOut.status).toBe(503)
    expect(timedOut.body.code).toBe('upstream_busy')

    // Overpass's own "at capacity" page, and our wait running out.
    now += 61_000
    overpass.mockResolvedValueOnce(
      new Response('This Overpass API server is currently at capacity.', {
        status: 502,
      })
    )
    expect((await call()).body.code).toBe('upstream_busy')
    overpass.mockRejectedValueOnce(
      new DOMException('The operation timed out.', 'TimeoutError')
    )
    const slow = await call()
    expect(slow.status).toBe(503)
    expect(slow.body.code).toBe('upstream_busy')

    now += 61_000
    overpass.mockResolvedValueOnce(new Response('bad query', { status: 400 }))
    expect((await call()).body.code).toBe('upstream_error')
    overpass.mockResolvedValueOnce(new Response('<osm/>', { status: 200 }))
    const unreadable = await call()
    expect(unreadable.status).toBe(502)
    expect(unreadable.body).toEqual({
      ok: false,
      error: 'upstream_error',
      code: 'upstream_error',
    })
    overpass.mockResolvedValueOnce(Response.json({ remark: 'no elements' }))
    expect((await call()).status).toBe(502)
    overpass.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await call()).status).toBe(502)

    now += 61_000
    overpass.mockResolvedValueOnce(new Response('error', { status: 500 }))
    expect((await call()).status).toBe(502)
  })
})
