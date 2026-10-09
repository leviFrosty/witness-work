import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => false,
  isDeviceOffline: () => false,
}))
vi.mock('../../modules/place-search', () => ({
  isAvailable: false,
  autocomplete: vi.fn(async () => []),
  resolve: vi.fn(async () => null),
}))
vi.mock('@/lib/address', () => ({
  addressToString: (address?: Record<string, string>) =>
    Object.values(address ?? {})
      .filter(Boolean)
      .join(' '),
}))

import moment from 'moment'
import {
  buildTodayRouteFixture,
  TODAY_ROUTE_FIXTURE_ID_PREFIX,
} from '@/app/dev-fixtures/todayRoute'
import { dayRouteStops } from '@/features/route-planning/lib/routeStops'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'

// Dismissal is checked against the real clock, so build for today.
const now = moment()
const build = () => buildTodayRouteFixture({ now })
const fixture = build()
const { stops, missingLocationCount } = dayRouteStops({
  day: now.toDate(),
  conversations: fixture.visits,
  contacts: fixture.contacts,
  dayPlans: fixture.dayPlans,
  recurringPlans: fixture.recurringPlans,
})

describe('app/dev-fixtures/todayRoute', () => {
  it('is deterministic for a given now', () => {
    expect(build()).toEqual(build())
  })

  it('gives every record a unique, prefixed id', () => {
    const ids = [
      ...fixture.contacts,
      ...fixture.visits,
      ...fixture.dayPlans,
      ...fixture.recurringPlans,
    ].map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) =>
      expect(id.startsWith(TODAY_ROUTE_FIXTURE_ID_PREFIX)).toBe(true)
    )
  })

  it('dates Visits and Plans by day, so a later day adds new ones', () => {
    const tomorrow = buildTodayRouteFixture({ now: now.clone().add(1, 'day') })
    expect(tomorrow.contacts.map((c) => c.id)).toEqual(
      fixture.contacts.map((c) => c.id)
    )
    const todayIds = new Set(fixture.visits.map((v) => v.id))
    tomorrow.visits.forEach((v) => expect(todayIds.has(v.id)).toBe(false))
  })

  it('puts one more located stop on today than a route can hold', () => {
    expect(stops).toHaveLength(MAX_ROUTE_STOPS + 1)
    expect(stops.filter((s) => s.kind === 'followUp')).toHaveLength(8)
    expect(stops.filter((s) => s.kind === 'plan')).toHaveLength(3)
  })

  it('counts the unpinned Contact and Plan as missing a location', () => {
    expect(missingLocationCount).toBe(2)
  })

  it('leaves out dismissed and already-answered Follow-ups', () => {
    const titles = stops.map((s) => s.title)
    expect(titles.some((t) => t.includes('dismissed'))).toBe(false)
    expect(titles.some((t) => t.includes('already visited'))).toBe(false)
  })

  it('sends coordinates for the hand-placed pin and addresses otherwise', () => {
    const pinned = stops.find((s) => s.title.includes('hand-placed pin'))!
    expect(pinned.destination).toMatch(/^37\.78\d*,-122\.51\d*$/)
    const ferry = stops.find((s) => s.title === 'Ruth Calloway')!
    expect(ferry.destination).toMatch(/^1 Ferry Building San Francisco/)
  })

  it('titles an untitled Plan with its place', () => {
    expect(stops.some((s) => s.title === 'Mission Dolores Park')).toBe(true)
  })
})
