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
import { generateTestKey, verifyJwt } from '../test/mapkit'
import { resetAccountStatusCache } from '../accounts/auth'
import { createAccountsRoutes } from '../accounts/route'
import { accountsDb, setAccountStatus } from '../accounts/store'
import { RoutePlanningQuota } from '../routePlanning/quotaDO'
import { MAPS_LIMITS } from './config'
import { resetMapKitKeyCache } from './mapkitToken'
import { createMapsRoutes, createPlacesRoutes } from './route'

const T0 = Date.UTC(2026, 9, 30, 12)
const ORIGIN = 'https://maps-beta.witnesswork.app'

let h: Harness
let env: Environment & Record<string, unknown>
let here: ReturnType<typeof vi.fn>
let now: number
let app: Hono<AppEnv>
let publicKey: CryptoKey
const accountsApp = createAccountsRoutes() as never

const configure = async () => {
  const key = await generateTestKey()
  publicKey = key.publicKey
  env.MAPKIT_JS_PRIVATE_KEY = key.pem
  env.MAPKIT_JS_KEY_ID = 'MAPKEY1234'
  env.MAPKIT_JS_ORIGINS = `${ORIGIN},http://localhost:8081`
}

beforeEach(async () => {
  h = await createHarness()
  resetAccountStatusCache()
  resetMapKitKeyCache()
  env = h.env as Environment & Record<string, unknown>
  env.HERE_API_KEY = 'here-key'
  env.APPLE_TEAM_ID = 'TEAM123456'
  const quotas = createNamespace(
    (state) => new RoutePlanningQuota(state as never, env as never)
  )
  env.ROUTE_PLANNING_QUOTA =
    quotas.namespace as Environment['ROUTE_PLANNING_QUOTA']
  here = vi.fn(async () => Response.json({ items: [] }))
  now = T0
  app = new Hono<AppEnv>()
  app.route('/maps/v1', createMapsRoutes({ now: () => now }))
  app.route(
    '/places/v1',
    createPlacesRoutes({ fetch: here as unknown as typeof fetch })
  )
})

afterEach(() => vi.restoreAllMocks())

const session = async () => {
  const opened = await openTestSession(accountsApp, h.env)
  return { ...opened, auth: bearer(opened.accessToken) }
}

const mint = (body?: unknown, headers: Record<string, string> = {}) =>
  requestJson(
    app as never,
    h.env,
    'POST',
    '/maps/v1/mapkit-tokens',
    body,
    headers
  ) as Promise<{
    status: number
    headers: Headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any
  }>

describe('POST /maps/v1/mapkit-tokens', () => {
  it('mints a token for the default frame origin', async () => {
    await configure()
    const { auth } = await session()
    const response = await mint(undefined, auth)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const iat = Math.floor(T0 / 1000)
    expect(response.body).toEqual({
      ok: true,
      token: expect.any(String),
      origin: ORIGIN,
      expiresAt: (iat + MAPS_LIMITS.tokenLifetimeSeconds) * 1000,
    })
    const jwt = await verifyJwt(response.body.token, publicKey)
    expect(jwt.valid).toBe(true)
    expect(jwt.header).toEqual({ alg: 'ES256', kid: 'MAPKEY1234', typ: 'JWT' })
    expect(jwt.claims).toEqual({
      iss: 'TEAM123456',
      iat,
      exp: iat + 1800,
      origin: ORIGIN,
      scope: 'mapkit_js',
    })
  })

  it('names another allowed origin on request, and no other', async () => {
    await configure()
    const { auth } = await session()
    const local = await mint({ origin: 'http://localhost:8081' }, auth)
    expect(local.status).toBe(200)
    expect(
      (await verifyJwt(local.body.token, publicKey)).claims.origin
    ).toBe('http://localhost:8081')

    for (const origin of [
      'https://evil.example',
      `${ORIGIN}/`,
      'https://maps-beta.witnesswork.app.evil.example',
      '*',
      '',
    ]) {
      const refused = await mint({ origin }, auth)
      expect(refused.status).toBe(400)
      expect(refused.body.code).toBe('origin_not_allowed')
    }
  })

  it('never names a local frame on a deployed worker', async () => {
    await configure()
    const { auth } = await session()
    const deployed = (body?: unknown) =>
      requestJson(
        app as never,
        h.env,
        'POST',
        'https://api.example/maps/v1/mapkit-tokens',
        body,
        auth
      )
    expect((await deployed()).status).toBe(200)
    const local = await deployed({ origin: 'http://localhost:8081' })
    expect(local.status).toBe(400)
    expect((local.body as { code: string }).code).toBe('origin_not_allowed')

    env.MAPKIT_JS_ORIGINS = 'http://localhost:8081'
    const onlyLocal = await deployed()
    expect(onlyLocal.status).toBe(503)
    expect((onlyLocal.body as { code: string }).code).toBe('maps_unconfigured')
  })

  it('needs a session: none, a forged one, or a suspended account', async () => {
    await configure()
    const none = await mint()
    expect(none.status).toBe(401)
    expect(none.body.code).toBe('unauthorized')
    expect(none.headers.get('www-authenticate')).toContain('invalid_token')
    expect((await mint(undefined, bearer('a.b.c'))).status).toBe(401)
    expect((await mint(undefined, { authorization: 'Basic abc' })).status).toBe(
      401
    )

    const { accountId, auth } = await session()
    await setAccountStatus(
      accountsDb(h.accountsDb!),
      accountId,
      'suspended',
      'report'
    )
    const suspended = await mint(undefined, auth)
    expect(suspended.status).toBe(403)
    expect(suspended.body.code).toBe('suspended')
  })

  it('answers 503 maps_unconfigured until every piece is set', async () => {
    const { auth } = await session()
    const missing = await mint(undefined, auth)
    expect(missing.status).toBe(503)
    expect(missing.body.code).toBe('maps_unconfigured')
    expect(missing.headers.get('retry-after')).toBe('60')

    await configure()
    env.MAPKIT_JS_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const badKey = await mint(undefined, auth)
    expect(badKey.status).toBe(503)
    expect(badKey.body.code).toBe('maps_unconfigured')
  })

  it('refuses bad bodies before minting', async () => {
    await configure()
    const { auth } = await session()
    const long = await mint({ origin: `https://${'a'.repeat(300)}.example` }, auth)
    expect(long.status).toBe(400)
    expect(long.body.code).toBe('origin_not_allowed')
    for (const body of [{ origin: 5 }, { origin: ORIGIN, extra: 1 }, [], 'x']) {
      const response = await mint(body, auth)
      expect(response.status).toBe(400)
      expect(response.body.code).toBe('bad_request')
    }
    const huge = await mint({ origin: 'x'.repeat(2000) }, auth)
    expect(huge.status).toBe(413)
    expect(huge.body.code).toBe('too_large')
  })

  it('limits tokens per account per minute and per day', async () => {
    await configure()
    const first = await session()
    for (let i = 0; i < MAPS_LIMITS.tokenMinuteLimit; i++)
      expect((await mint(undefined, first.auth)).status).toBe(200)
    const limited = await mint(undefined, first.auth)
    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('rate_limited')
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

    // Another account has its own budget.
    const other = await session()
    expect((await mint(undefined, other.auth)).status).toBe(200)

    // A day's worth, a minute apart in batches, then the daily limit.
    let minted = MAPS_LIMITS.tokenMinuteLimit
    while (minted < MAPS_LIMITS.tokenDailyLimit) {
      now += 61_000
      for (
        let i = 0;
        i < MAPS_LIMITS.tokenMinuteLimit &&
        minted < MAPS_LIMITS.tokenDailyLimit;
        i++, minted++
      )
        expect((await mint(undefined, first.auth)).status).toBe(200)
    }
    now += 61_000
    const daily = await mint(undefined, first.auth)
    expect(daily.status).toBe(429)
    expect(daily.body.code).toBe('daily_limit')
  })
})

const search = (query: string) =>
  requestJson(
    app as never,
    h.env,
    'GET',
    `/places/v1/search?${query}`
  ) as Promise<{
    status: number
    headers: Headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any
  }>

const discoverItem = {
  title: 'Skyline Chili',
  id: 'here:pds:place:840dph0z-1',
  resultType: 'place',
  address: {
    label: 'Skyline Chili, 643 Vine St, Cincinnati, OH 45202, United States',
    countryCode: 'USA',
    countryName: 'United States',
    stateCode: 'OH',
    state: 'Ohio',
    city: 'Cincinnati',
    street: 'Vine St',
    postalCode: '45202',
    houseNumber: '643',
  },
  position: { lat: 39.10229, lng: -84.51264 },
  access: [{ lat: 39.1023, lng: -84.5124 }],
  distance: 212.4,
  categories: [
    { id: '100-1000-0000', name: 'Restaurant', primary: true },
    { id: '100-1000-0001', name: 'Casual Dining' },
  ],
  contacts: [{ phone: [{ value: '+15130000000' }] }],
  openingHours: [{ text: ['Mon-Sun: 10:30 - 22:00'] }],
}

describe('GET /places/v1/search', () => {
  it('asks HERE Discover with only its own parameters', async () => {
    here.mockResolvedValueOnce(
      Response.json({
        items: [
          discoverItem,
          {
            title: 'Jehovahs Witnesses of West College Hill (Kingdom Hall)',
            id: 'here:pds:place:8403fv6k-1',
            resultType: 'place',
            address: {
              label:
                'Jehovahs Witnesses of West College Hill, 1202 W North Bend Rd, Cincinnati, OH 45224, United States',
              houseNumber: '1202',
              street: 'W North Bend Rd',
              city: 'Cincinnati',
            },
            position: { lat: 39.20273, lng: -84.5369 },
          },
          {
            title: '643 Vine St, Cincinnati, OH 45202, United States',
            id: 'here:af:streetsection:1',
            resultType: 'houseNumber',
            address: { label: '643 Vine St, Cincinnati, OH 45202, United States' },
            position: { lat: 39.1023, lng: -84.5126 },
          },
          { title: 'No position', id: 'x', address: { label: 'x' } },
        ],
      })
    )
    const response = await search(
      'q=skyline&at=39.103112345,-84.512012345&limit=4&lang=en-US&apiKey=mine&in=countryCode:USA'
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      items: [
        {
          id: 'here:pds:place:840dph0z-1',
          name: 'Skyline Chili',
          category: { id: '100-1000-0000', name: 'Restaurant' },
          address: {
            // The name is cut from the front of a POI's label.
            label: '643 Vine St, Cincinnati, OH 45202, United States',
            houseNumber: '643',
            street: 'Vine St',
            city: 'Cincinnati',
            state: 'Ohio',
            stateCode: 'OH',
            postalCode: '45202',
            countryCode: 'USA',
            countryName: 'United States',
          },
          latitude: 39.10229,
          longitude: -84.51264,
          distanceMeters: 212,
        },
        {
          id: 'here:pds:place:8403fv6k-1',
          name: 'Jehovahs Witnesses of West College Hill (Kingdom Hall)',
          address: {
            label: '1202 W North Bend Rd, Cincinnati, OH 45224, United States',
            houseNumber: '1202',
            street: 'W North Bend Rd',
            city: 'Cincinnati',
          },
          latitude: 39.20273,
          longitude: -84.5369,
        },
        {
          id: 'here:af:streetsection:1',
          address: { label: '643 Vine St, Cincinnati, OH 45202, United States' },
          latitude: 39.1023,
          longitude: -84.5126,
        },
      ],
    })
    const url = new URL(here.mock.calls[0]![0] as string)
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://discover.search.hereapi.com/v1/discover'
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'skyline',
      at: '39.1031,-84.512',
      limit: '4',
      lang: 'en-US',
      apiKey: 'here-key',
    })
  })

  it('defaults to five results, and counts characters, not UTF-16 units', async () => {
    const response = await search(`q=${'%F0%9F%98%80'.repeat(200)}&at=0,0`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const url = new URL(here.mock.calls[0]![0] as string)
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('refuses bad parameters without asking HERE', async () => {
    for (const [query, field] of [
      ['at=39,-84', 'q'],
      ['q=%20%20&at=39,-84', 'q'],
      [`q=${'a'.repeat(201)}&at=39,-84`, 'q'],
      ['q=a%00b&at=39,-84', 'q'],
      ['q=coffee%C2%85&at=39,-84', 'q'],
      [`q=${'%F0%9F%98%80'.repeat(201)}&at=39,-84`, 'q'],
      ['q=coffee', 'at'],
      ['q=coffee&at=91,0', 'at'],
      ['q=coffee&at=0,181', 'at'],
      ['q=coffee&at=1e2,0', 'at'],
      ['q=coffee&at=NaN,0', 'at'],
      ['q=coffee&at=39;-84', 'at'],
      ['q=coffee&at=39,-84&limit=0', 'limit'],
      ['q=coffee&at=39,-84&limit=21', 'limit'],
      ['q=coffee&at=39,-84&limit=2.5', 'limit'],
      ['q=coffee&at=39,-84&lang=en_US;x', 'lang'],
      ['q=coffee&at=39,-84&lang=', 'lang'],
    ] as const) {
      const response = await search(query)
      expect(response.status, query).toBe(400)
      expect(response.body).toMatchObject({ code: 'bad_request', field })
    }
    expect(here).not.toHaveBeenCalled()
  })

  it('maps HERE failures onto the shared envelope', async () => {
    here.mockResolvedValueOnce(
      new Response('{"title":"Too Many Requests"}', {
        status: 429,
        headers: { 'Retry-After': '3' },
      })
    )
    const limited = await search('q=coffee&at=39,-84')
    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('rate_limited')
    expect(limited.headers.get('retry-after')).toBe('3')

    here.mockResolvedValueOnce(
      Response.json({ title: 'Unauthorized' }, { status: 401 })
    )
    expect((await search('q=coffee&at=39,-84')).body.code).toBe(
      'upstream_error'
    )

    here.mockResolvedValueOnce(new Response('error code: 522', { status: 522 }))
    const outage = await search('q=coffee&at=39,-84')
    expect(outage.status).toBe(502)
    expect(outage.body.code).toBe('upstream_error')

    here.mockRejectedValueOnce(new Error('timeout'))
    expect((await search('q=coffee&at=39,-84')).status).toBe(502)

    here.mockResolvedValueOnce(
      Response.json({ title: 'Bad q', cause: 'q' }, { status: 400 })
    )
    const refused = await search('q=coffee&at=39,-84')
    expect(refused.status).toBe(400)
    // HERE's own body (which may quote the query) isn't passed on.
    expect(refused.body).toEqual({
      ok: false,
      error: 'bad_request',
      code: 'bad_request',
    })
  })
})

const reverseGeocode = (query: string) =>
  requestJson(
    app as never,
    h.env,
    'GET',
    `/places/v1/reverse-geocode?${query}`
  ) as Promise<{
    status: number
    headers: Headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any
  }>

describe('GET /places/v1/reverse-geocode', () => {
  it('asks HERE Reverse Geocode with only its own parameters and shapes the address', async () => {
    here.mockResolvedValueOnce(
      Response.json({
        items: [
          {
            title: '12 Rue de la Paix, 75002 Paris, France',
            id: 'here:af:streetsection:paris-1',
            resultType: 'houseNumber',
            address: {
              label: '12 Rue de la Paix, 75002 Paris, France',
              countryCode: 'FRA',
              countryName: 'France',
              state: 'Île-de-France',
              city: 'Paris',
              district: '2e Arrondissement',
              street: 'Rue de la Paix',
              postalCode: '75002',
              houseNumber: '12',
            },
            position: { lat: 48.86914, lng: 2.33118 },
          },
        ],
      })
    )
    const response = await reverseGeocode(
      'at=48.869141234,2.331181234&lang=fr-FR&apiKey=mine&limit=10'
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.body).toEqual({
      ok: true,
      address: {
        label: '12 Rue de la Paix, 75002 Paris, France',
        houseNumber: '12',
        street: 'Rue de la Paix',
        district: '2e Arrondissement',
        city: 'Paris',
        state: 'Île-de-France',
        postalCode: '75002',
        countryCode: 'FRA',
        countryName: 'France',
      },
    })
    const url = new URL(here.mock.calls[0]![0] as string)
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://revgeocode.search.hereapi.com/v1/revgeocode'
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      at: '48.86914,2.33118',
      limit: '1',
      lang: 'fr-FR',
      apiKey: 'here-key',
    })
  })

  it('answers address: null when HERE finds nothing', async () => {
    here.mockResolvedValueOnce(Response.json({ items: [] }))
    const response = await reverseGeocode('at=0,0')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, address: null })
  })

  it('refuses invalid coordinates or lang without asking HERE', async () => {
    for (const [query, field] of [
      ['', 'at'],
      ['at=91,0', 'at'],
      ['at=0,181', 'at'],
      ['at=NaN,0', 'at'],
      ['at=48.8;2.3', 'at'],
      ['at=48.8,2.3&lang=en_US;x', 'lang'],
      ['at=48.8,2.3&lang=', 'lang'],
    ] as const) {
      const response = await reverseGeocode(query)
      expect(response.status, query).toBe(400)
      expect(response.body).toMatchObject({ code: 'bad_request', field })
    }
    expect(here).not.toHaveBeenCalled()
  })

  it('maps HERE failures onto the shared envelope', async () => {
    here.mockResolvedValueOnce(
      new Response('{"title":"Too Many Requests"}', {
        status: 429,
        headers: { 'Retry-After': '5' },
      })
    )
    const limited = await reverseGeocode('at=48.8,2.3')
    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('rate_limited')
    expect(limited.headers.get('retry-after')).toBe('5')

    here.mockResolvedValueOnce(new Response('error code: 522', { status: 522 }))
    const outage = await reverseGeocode('at=48.8,2.3')
    expect(outage.status).toBe(502)
    expect(outage.body.code).toBe('upstream_error')

    here.mockRejectedValueOnce(new Error('timeout'))
    expect((await reverseGeocode('at=48.8,2.3')).status).toBe(502)

    here.mockResolvedValueOnce(
      Response.json({ title: 'Bad at' }, { status: 400 })
    )
    const refused = await reverseGeocode('at=48.8,2.3')
    expect(refused.status).toBe(400)
    expect(refused.body).toEqual({
      ok: false,
      error: 'bad_request',
      code: 'bad_request',
    })
  })
})
