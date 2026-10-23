import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAY_MINUTES,
  builderStops,
  contactStopsToAdd,
  dayRouteStopsFor,
  defaultStartTime,
  moveKey,
  newSavedRoute,
  optimizedOrder,
  reorderableStops,
  startingPlan,
  type AddedStop,
  type PlanStart,
  type SavedRoute,
} from '@/features/route-planning/lib/routeBuilder'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

const at = (latitude: number) => ({ latitude, longitude: -122.42 })

const followUp = (id: string, time: number): RouteStop => ({
  key: `followUp:${id}`,
  kind: 'followUp',
  contactId: `contact-${id}`,
  title: `Contact ${id}`,
  startTimeInMinutes: time,
  coordinate: at(37.75 + time / 100_000),
  destination: `${id} Main St`,
})

const plan = (id: string, time: number, minutes = 60): RouteStop => ({
  key: `plan:${id}`,
  kind: 'plan',
  title: `Plan ${id}`,
  startTimeInMinutes: time,
  minutes,
  coordinate: at(37.76),
  destination: `${id} Plaza`,
})

const route = (change: Partial<SavedRoute> = {}): SavedRoute => ({
  day: '2026-10-16',
  order: [],
  removed: [],
  added: [],
  stay: {},
  updatedAt: 1,
  ...change,
})

describe('builderStops', () => {
  it('keeps the saved order and drops stops that no longer exist', () => {
    const day = [followUp('a', 600), followUp('b', 660), followUp('c', 720)]
    const { stops } = builderStops(
      day,
      route({
        order: ['followUp:c', 'followUp:gone', 'followUp:a', 'followUp:b'],
      })
    )
    expect(stops.map((s) => s.key)).toEqual([
      'followUp:c',
      'followUp:a',
      'followUp:b',
    ])
  })

  it('slots a new day stop in before the first stop set for later', () => {
    const day = [followUp('a', 600), followUp('new', 630), followUp('b', 660)]
    const { stops } = builderStops(
      day,
      route({ order: ['followUp:a', 'followUp:b'] })
    )
    expect(stops.map((s) => s.key)).toEqual([
      'followUp:a',
      'followUp:new',
      'followUp:b',
    ])
  })

  it('lists removed day stops apart and leaves the starting Plan out', () => {
    const day = [plan('meet', 540, 180), followUp('a', 600), followUp('b', 660)]
    const { stops, removed } = builderStops(
      day,
      route({
        order: ['followUp:a'],
        removed: ['followUp:b'],
        origin: {
          kind: 'place',
          title: 'Hall',
          coordinate: at(37.76),
          destination: 'Hall',
          stopKey: 'plan:meet',
        },
      })
    )
    expect(stops.map((s) => s.key)).toEqual(['followUp:a'])
    expect(removed.map((s) => s.key)).toEqual(['followUp:b'])
  })

  it('stays a Plan its minutes, others the default, unless changed', () => {
    const day = [followUp('a', 600), plan('cart', 660, 45)]
    const { stops } = builderStops(
      day,
      route({
        order: ['followUp:a', 'plan:cart', 'place:x'],
        added: [
          {
            key: 'place:x',
            kind: 'place',
            title: 'Library',
            coordinate: at(37.77),
            destination: '37.77,-122.42',
          },
        ],
        stay: { 'followUp:a': 30 },
      })
    )
    expect(stops.map((s) => s.stayMinutes)).toEqual([
      30,
      45,
      DEFAULT_STAY_MINUTES,
    ])
    expect(stops[2]!.setTime).toBeUndefined()
  })

  it('knows the Contact behind Follow-ups and added Contacts', () => {
    const { stops } = builderStops(
      [followUp('a', 600)],
      route({
        order: ['followUp:a', 'contact:c9'],
        added: [
          {
            key: 'contact:c9',
            kind: 'contact',
            title: 'C9',
            coordinate: at(37.7),
            destination: 'x',
          },
        ],
      })
    )
    expect(stops.map((s) => s.contactId)).toEqual(['contact-a', 'c9'])
  })
})

describe('startingPlan', () => {
  const option = (time: number, place = true, anytime = false): PlanStart => ({
    id: `p${time}`,
    stopKey: `plan:p${time}`,
    time,
    anytime,
    ...(place && {
      place: { title: 'Hall', coordinate: at(37.76), destination: 'Hall' },
    }),
  })

  it('starts from the earliest placed Plan before the first Follow-up', () => {
    const plans = [option(600), option(540)]
    expect(startingPlan(plans, [followUp('a', 600)])?.id).toBe('p540')
  })

  it("doesn't start from a Plan after the first Follow-up", () => {
    expect(startingPlan([option(660)], [followUp('a', 600)])).toBeUndefined()
  })

  it('skips Anytime Plans and Plans without a place', () => {
    expect(
      startingPlan([option(540, false), option(500, true, true)], [])
    ).toBeUndefined()
  })
})

describe('newSavedRoute', () => {
  it('starts at the starting Plan, links it, and keeps it off the stops', () => {
    const day = [plan('meet', 540, 180), followUp('a', 600)]
    const saved = newSavedRoute('2026-10-16', day, {
      id: 'meet',
      stopKey: 'plan:meet',
      time: 540,
      anytime: false,
      place: { title: 'Hall', coordinate: at(37.76), destination: 'Hall' },
    })
    expect(saved.order).toEqual(['followUp:a'])
    expect(saved.planId).toBe('meet')
    expect(saved.startTimeInMinutes).toBe(540)
    expect(saved.origin).toMatchObject({ kind: 'place', stopKey: 'plan:meet' })
  })

  it('leaves stops past the limit off', () => {
    const day = Array.from({ length: 12 }, (_, i) => followUp(`${i}`, 600 + i))
    const saved = newSavedRoute('2026-10-16', day)
    expect(saved.order).toHaveLength(10)
    expect(saved.removed).toEqual(['followUp:10', 'followUp:11'])
  })
})

describe('defaultStartTime', () => {
  it('leaves early enough to reach the first stop, on a 5-minute mark', () => {
    const { stops } = builderStops(
      [followUp('a', 600)],
      route({ order: ['followUp:a'] })
    )
    expect(defaultStartTime(stops, 12)).toBe(585)
  })

  it('falls back to 9:00 AM', () => {
    expect(defaultStartTime([], 0)).toBe(540)
  })
})

describe('moveKey', () => {
  it('moves within the list and stops at its ends', () => {
    expect(moveKey(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveKey(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveKey(['a', 'b', 'c'], 'a', 5)).toEqual(['b', 'c', 'a'])
  })
})

describe('Shortest Order', () => {
  const { stops } = builderStops(
    [followUp('a', 600), followUp('b', 660), followUp('c', 720)],
    route({ order: ['followUp:a', 'followUp:b', 'followUp:c'] })
  )

  it('keeps the first stop first when the day starts there', () => {
    const split = reorderableStops(stops, true)
    expect(split.fixed?.key).toBe('followUp:a')
    expect(split.movable.map((s) => s.key)).toEqual([
      'followUp:b',
      'followUp:c',
    ])
    expect(optimizedOrder(split, [1, 0])).toEqual([
      'followUp:a',
      'followUp:c',
      'followUp:b',
    ])
  })

  it('reorders every stop from a separate start', () => {
    const split = reorderableStops(stops, false)
    expect(split.fixed).toBeNull()
    expect(optimizedOrder(split, [2, 0, 1])).toEqual([
      'followUp:c',
      'followUp:a',
      'followUp:b',
    ])
  })
})

describe('restoring a removed stop', () => {
  it('slots it back in by time when it leaves the order', () => {
    const day = [followUp('a', 600), followUp('b', 660), followUp('c', 720)]
    const { stops } = builderStops(
      day,
      // As restore() saves it: off the removed list and out of the order.
      route({ order: ['followUp:a', 'followUp:c'], removed: [] })
    )
    expect(stops.map((s) => s.key)).toEqual([
      'followUp:a',
      'followUp:b',
      'followUp:c',
    ])
  })
})

describe('dayRouteStopsFor', () => {
  const day = '2026-10-21'
  const dayStops = [
    plan('meeting', 540),
    followUp('a', 600),
    followUp('b', 660),
  ]
  const meeting: PlanStart = {
    id: 'meeting',
    stopKey: 'plan:meeting',
    time: 540,
    anytime: false,
    place: {
      title: 'Kingdom Hall',
      coordinate: at(37.7),
      destination: '1 Hall St',
    },
  }

  it("counts a new route's stops without the Plan it starts from", () => {
    expect(dayRouteStopsFor(day, dayStops, undefined, meeting)).toEqual({
      stops: [
        expect.objectContaining({ key: 'followUp:a' }),
        expect.objectContaining({ key: 'followUp:b' }),
      ],
      planned: false,
    })
  })

  it("counts the saved route's stops", () => {
    const saved: SavedRoute = {
      ...newSavedRoute(day, dayStops),
      removed: ['followUp:b'],
    }
    const { stops, planned } = dayRouteStopsFor(day, dayStops, saved)
    expect(planned).toBe(true)
    expect(stops.map((stop) => stop.key)).toEqual([
      'plan:meeting',
      'followUp:a',
    ])
  })

  it('leaves off the stops past the limit', () => {
    const many = Array.from({ length: MAX_ROUTE_STOPS + 3 }, (_, i) =>
      followUp(`${i}`, 600 + i)
    )
    expect(dayRouteStopsFor(day, many, undefined).stops).toHaveLength(
      MAX_ROUTE_STOPS
    )
  })
})

describe('contactStopsToAdd', () => {
  const contact = (id: string): AddedStop => ({
    key: `contact:${id}`,
    kind: 'contact',
    title: `Contact ${id}`,
    coordinate: at(37.8),
    destination: `${id} Oak St`,
  })
  const onRoute = [
    { key: 'followUp:1', contactId: 'visited' },
    { key: 'contact:added', contactId: 'added' },
  ]

  it("adds only Contacts the route doesn't have, once each, in order", () => {
    expect(
      contactStopsToAdd(onRoute, [
        contact('new'),
        contact('visited'),
        contact('added'),
        contact('other'),
        contact('new'),
      ])
    ).toEqual({ added: [contact('new'), contact('other')], leftOff: 0 })
  })

  it('stops at the room left and counts the rest', () => {
    const full = Array.from({ length: MAX_ROUTE_STOPS - 1 }, (_, i) => ({
      key: `followUp:${i}`,
    }))
    expect(
      contactStopsToAdd(full, [contact('a'), contact('b'), contact('c')])
    ).toEqual({ added: [contact('a')], leftOff: 2 })
  })
})
