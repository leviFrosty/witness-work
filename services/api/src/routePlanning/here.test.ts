import { describe, expect, it, vi } from 'vitest'
import {
  buildWaypointsSequenceRequest,
  fetchWaypointsSequence,
  parseWaypointsSequence,
} from './here'

const input = {
  start: { lat: 39.1031, lng: -84.512 },
  stops: [
    { lat: 39.11, lng: -84.5 },
    { lat: 39.12, lng: -84.49 },
    { lat: 39.0912345678, lng: -84.5198765432 },
  ],
}

const hereBody = (ids: string[], distance = '12345', time = '1500') => ({
  results: [
    {
      waypoints: ids.map((id, sequence) => ({ id, lat: 0, lng: 0, sequence })),
      distance,
      time,
      interconnections: [],
    },
  ],
  errors: [],
  responseCode: '200',
})

describe('buildWaypointsSequenceRequest', () => {
  it('posts opaque ids and coordinates in the body, settings in the query', () => {
    const { url, init } = buildWaypointsSequenceRequest(input, 'secret-key')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://wps.hereapi.com/v8/findsequence2'
    )
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      mode: 'fastest;car;traffic:enabled',
      departure: 'now',
      improveFor: 'time',
      apiKey: 'secret-key',
    })
    expect(url).not.toContain('39.1')
    expect(init.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual(
      {
        start: 'start;39.1031,-84.512',
        destination0: 's0;39.11,-84.5',
        destination1: 's1;39.12,-84.49',
        destination2: 's2;39.091235,-84.519877',
      }
    )
  })
})

describe('parseWaypointsSequence', () => {
  it('maps the visiting order back onto stop indices', () => {
    const body = hereBody(['start', 's2', 's0', 's1'])
    // HERE lists waypoints in visiting order, but trust `sequence`, not position.
    body.results[0]!.waypoints.reverse()
    expect(parseWaypointsSequence(body, 3)).toEqual({
      kind: 'ok',
      order: [2, 0, 1],
      distanceMeters: 12345,
      durationSeconds: 1500,
    })
  })

  it('reports a readable body without a sequence as none', () => {
    expect(parseWaypointsSequence({ results: [], errors: ['x'] }, 3)).toEqual({
      kind: 'none',
    })
    expect(parseWaypointsSequence({ results: null }, 3)).toEqual({
      kind: 'none',
    })
  })

  it('rejects sequences that skip, repeat, or invent stops', () => {
    expect(parseWaypointsSequence(hereBody(['start', 's0', 's1']), 3)).toBeNull()
    expect(
      parseWaypointsSequence(hereBody(['start', 's0', 's0', 's1']), 3)
    ).toBeNull()
    expect(
      parseWaypointsSequence(hereBody(['start', 's0', 's1', 's3']), 3)
    ).toBeNull()
    expect(
      parseWaypointsSequence(hereBody(['start', 's0', 's1', 's2'], 'far'), 3)
    ).toBeNull()
    expect(parseWaypointsSequence('nope', 3)).toBeNull()
  })
})

describe('fetchWaypointsSequence', () => {
  const run = (response: Response | Error) =>
    fetchWaypointsSequence(
      input,
      'key',
      vi.fn(async () => {
        if (response instanceof Error) throw response
        return response
      }) as unknown as typeof fetch,
      1000
    )

  it('returns the order on success', async () => {
    await expect(
      run(Response.json(hereBody(['start', 's1', 's2', 's0'])))
    ).resolves.toEqual({
      kind: 'ok',
      order: [1, 2, 0],
      distanceMeters: 12345,
      durationSeconds: 1500,
    })
  })

  it('treats a sequence-less answer or a 4xx about the points as no route', async () => {
    await expect(run(Response.json({ results: [], errors: [] }))).resolves
      .toEqual({ kind: 'no_route', status: 200 })
    await expect(
      run(Response.json({ errors: ['bad point'] }, { status: 400 }))
    ).resolves.toEqual({ kind: 'no_route', status: 400 })
  })

  it('treats outages, auth failures, junk, and network errors as upstream errors', async () => {
    await expect(
      run(new Response('error code: 520', { status: 520 }))
    ).resolves.toEqual({ kind: 'upstream_error', status: 520 })
    await expect(
      run(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    ).resolves.toEqual({ kind: 'upstream_error', status: 401 })
    await expect(
      run(Response.json({ error: 'Too many' }, { status: 429 }))
    ).resolves.toEqual({ kind: 'upstream_error', status: 429 })
    await expect(run(Response.json({ results: 'odd' }))).resolves.toEqual({
      kind: 'upstream_error',
      status: 200,
    })
    await expect(run(new TypeError('network down'))).resolves.toEqual({
      kind: 'upstream_error',
      status: null,
    })
  })
})
