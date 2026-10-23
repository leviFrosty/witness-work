import { describe, expect, it } from 'vitest'
import type { BuilderStop } from '@/features/route-planning/lib/routeBuilder'
import {
  LATE_GRACE_MINUTES,
  buildTimeline,
  estimateLeg,
  straightLineMeters,
} from '@/features/route-planning/lib/routeTimeline'

// About 1.1 km per 0.01° of latitude.
const north = (offset: number) => ({
  latitude: 37.75 + offset,
  longitude: -122.42,
})

const stop = (
  key: string,
  offset: number,
  extra: Partial<BuilderStop> = {}
): BuilderStop => ({
  key,
  kind: 'followUp',
  title: key,
  coordinate: north(offset),
  destination: key,
  stayMinutes: 15,
  ...extra,
})

describe('estimateLeg', () => {
  it('measures great-circle distance', () => {
    expect(straightLineMeters(north(0), north(0.01))).toBeCloseTo(1112, -1)
  })

  it('treats nearby points as the same place', () => {
    expect(estimateLeg(north(0), north(0.0005))).toEqual({
      meters: 0,
      minutes: 0,
    })
  })

  it('adds road winding and parking to the drive', () => {
    const leg = estimateLeg(north(0), north(0.05))
    expect(leg.meters).toBeGreaterThan(
      straightLineMeters(north(0), north(0.05))
    )
    expect(leg.minutes).toBeGreaterThan(5)
    expect(leg.minutes).toBeLessThan(20)
  })
})

describe('estimateLeg by road', () => {
  const road = { meters: 4200, seconds: 9 * 60 + 40, coordinates: [] }

  it('uses directions by road when the leg has them, plus parking', () => {
    expect(estimateLeg(north(0), north(0.05), () => road)).toEqual({
      meters: 4200,
      minutes: 12,
    })
  })

  it('estimates a leg without them, or with no road', () => {
    const estimate = estimateLeg(north(0), north(0.05))
    expect(estimateLeg(north(0), north(0.05), () => undefined)).toEqual(
      estimate
    )
    expect(estimateLeg(north(0), north(0.05), () => null)).toEqual(estimate)
  })

  it('times the day from them', () => {
    const timeline = buildTimeline({
      origin: north(0),
      startTime: 9 * 60,
      stops: [stop('a', 0.05)],
      keepSetTimes: true,
      roadLeg: () => road,
    })
    expect(timeline.entries[0]!.arrive).toBe(9 * 60 + 12)
    expect(timeline.meters).toBe(4200)
  })
})

describe('buildTimeline', () => {
  it('starts at the first stop when there is no starting place', () => {
    const timeline = buildTimeline({
      origin: null,
      startTime: 540,
      stops: [stop('a', 0), stop('b', 0.02)],
      keepSetTimes: true,
    })
    const [a, b] = timeline.entries
    expect(a).toMatchObject({ arrive: 540, depart: 555 })
    expect(a!.leg).toBeUndefined()
    expect(b!.arrive).toBe(555 + b!.leg!.minutes)
    expect(timeline.end).toBe(b!.depart)
    expect(timeline.driveMinutes).toBe(b!.leg!.minutes)
  })

  it('waits for a set time when arriving early', () => {
    const timeline = buildTimeline({
      origin: north(0),
      startTime: 540,
      stops: [stop('a', 0, { setTime: 600 })],
      keepSetTimes: true,
    })
    expect(timeline.entries[0]).toMatchObject({
      arrive: 540,
      waitMinutes: 60,
      begin: 600,
      depart: 615,
    })
  })

  it("doesn't wait when set times aren't kept", () => {
    const timeline = buildTimeline({
      origin: null,
      startTime: 540,
      stops: [stop('a', 0, { setTime: 600 })],
      keepSetTimes: false,
    })
    expect(timeline.entries[0]).toMatchObject({ waitMinutes: 0, depart: 555 })
  })

  it('flags arriving late past the grace minutes', () => {
    const late = buildTimeline({
      origin: null,
      startTime: 600 + LATE_GRACE_MINUTES + 1,
      stops: [stop('a', 0, { setTime: 600 })],
      keepSetTimes: true,
    })
    expect(late.entries[0]!.lateMinutes).toBe(LATE_GRACE_MINUTES + 1)

    const onTime = buildTimeline({
      origin: null,
      startTime: 600 + LATE_GRACE_MINUTES,
      stops: [stop('a', 0, { setTime: 600 })],
      keepSetTimes: true,
    })
    expect(onTime.entries[0]!.lateMinutes).toBe(0)
  })
})

describe('the finish', () => {
  const day = {
    origin: north(0),
    startTime: 540,
    stops: [stop('a', 0.02), stop('b', 0.04)],
    keepSetTimes: true,
  }

  it('ends at the last stop when there is no finish', () => {
    const timeline = buildTimeline(day)
    expect(timeline.finishLeg).toBeUndefined()
    expect(timeline.end).toBe(timeline.entries[1]!.depart)
  })

  it('adds the drive to a finish elsewhere, with no time spent there', () => {
    const atLastStop = buildTimeline(day)
    const timeline = buildTimeline({ ...day, finish: north(0) })
    const leg = timeline.finishLeg!
    expect(leg).toEqual(estimateLeg(north(0.04), north(0)))
    expect(timeline.end).toBe(timeline.entries[1]!.depart + leg.minutes)
    expect(timeline.driveMinutes).toBe(atLastStop.driveMinutes + leg.minutes)
    expect(timeline.meters).toBeCloseTo(atLastStop.meters + leg.meters)
  })

  it('has nothing to drive to without stops', () => {
    const timeline = buildTimeline({ ...day, stops: [], finish: north(0.1) })
    expect(timeline.finishLeg).toBeUndefined()
    expect(timeline.end).toBe(540)
  })
})
