import { describe, expect, it, vi } from 'vitest'
import { buildRoutesRequestUrl, fetchRoute, parseRoutes } from './hereRouting'

const points = [
  { lat: 39.1031, lng: -84.512 },
  { lat: 39.0912345678, lng: -84.5198765432 },
  { lat: 39.12, lng: -84.49 },
]

/** The spec's example polyline: four points near Frankfurt. */
const POLYLINE = 'BFoz5xJ67i1B1B7PzIhaxL7Y'

const section = (length: unknown = 1234.4, duration: unknown = 300.6) => ({
  id: 'x',
  type: 'vehicle',
  polyline: POLYLINE,
  summary: { length, duration, baseDuration: 280 },
})

const body = (sections: unknown[]) => ({ routes: [{ id: 'r', sections }] })

describe('buildRoutesRequestUrl', () => {
  it('sends the ends, each stop between as a via, and asks for shapes', () => {
    const url = new URL(buildRoutesRequestUrl(points, 'secret-key'))
    expect(url.origin + url.pathname).toBe(
      'https://router.hereapi.com/v8/routes'
    )
    expect(url.searchParams.get('transportMode')).toBe('car')
    expect(url.searchParams.get('origin')).toBe('39.1031,-84.512')
    expect(url.searchParams.getAll('via')).toEqual(['39.091235,-84.519877'])
    expect(url.searchParams.get('destination')).toBe('39.12,-84.49')
    expect(url.searchParams.get('return')).toBe('polyline,summary')
    expect(url.searchParams.get('apiKey')).toBe('secret-key')
  })

  it('has no via for a single leg', () => {
    const url = new URL(buildRoutesRequestUrl(points.slice(0, 2), 'k'))
    expect(url.searchParams.getAll('via')).toEqual([])
  })
})

describe('parseRoutes', () => {
  it('reads one leg per section, rounded', () => {
    expect(parseRoutes(body([section(), section(10, 20)]), 2)).toEqual({
      kind: 'ok',
      legs: [
        {
          distanceMeters: 1234,
          durationSeconds: 301,
          coordinates: [
            50.10228, 8.69821, 50.10201, 8.69567, 50.10063, 8.6915, 50.09878,
            8.68752,
          ],
        },
        expect.objectContaining({ distanceMeters: 10, durationSeconds: 20 }),
      ],
    })
  })

  it('is none when HERE found no route', () => {
    expect(parseRoutes({ routes: [], notices: [] }, 2)).toEqual({
      kind: 'none',
    })
  })

  it('refuses the wrong number of sections or an unreadable one', () => {
    expect(parseRoutes(body([section()]), 2)).toBeNull()
    expect(parseRoutes(body([section('x')]), 1)).toBeNull()
    expect(parseRoutes(body([section('10', '20')]), 1)).toBeNull()
    expect(
      parseRoutes(body([{ ...section(), polyline: 'not*a*line' }]), 1)
    ).toBeNull()
    expect(parseRoutes('nope', 1)).toBeNull()
  })
})

describe('fetchRoute', () => {
  const run = (response: Response | Error) =>
    fetchRoute(
      points,
      'k',
      vi.fn(async () => {
        if (response instanceof Error) throw response
        return response
      }) as unknown as typeof fetch,
      1000
    )

  it('returns the legs', async () => {
    const result = await run(Response.json(body([section(), section()])))
    expect(result.kind).toBe('ok')
  })

  it('is no_route for an empty answer or a 400 about the points', async () => {
    expect(await run(Response.json({ routes: [] }))).toEqual({
      kind: 'no_route',
      status: 200,
    })
    expect(
      await run(Response.json({ title: 'Malformed' }, { status: 400 }))
    ).toEqual({ kind: 'no_route', status: 400 })
  })

  it('is upstream_error for key, quota, outage, or network trouble', async () => {
    expect((await run(new Response('x', { status: 401 }))).kind).toBe(
      'upstream_error'
    )
    expect((await run(Response.json({}, { status: 429 }))).kind).toBe(
      'upstream_error'
    )
    expect((await run(new Response('<html>', { status: 502 }))).kind).toBe(
      'upstream_error'
    )
    expect((await run(new Error('offline'))).kind).toBe('upstream_error')
    expect((await run(Response.json({}, { status: 404 }))).kind).toBe(
      'upstream_error'
    )
  })
})
