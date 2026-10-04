import moment from 'moment'
import {
  buildMileageFixture,
  MILEAGE_FIXTURE_ID_PREFIX,
  MILEAGE_FIXTURE_IDS,
} from '@/app/dev-fixtures/mileage'
import { toDateKey } from '@/lib/mileage/calc'
import { describe, expect, it } from 'vitest'

const now = moment('2026-09-23T15:00:00')
const fixture = buildMileageFixture({ now })

describe('buildMileageFixture', () => {
  it('is deterministic so re-runs upsert the same records', () => {
    expect(buildMileageFixture({ now })).toEqual(fixture)
  })

  it('prefixes every id so fixture records can be deleted selectively', () => {
    const all = [
      ...fixture.vehicles,
      ...fixture.fuels,
      ...fixture.fuelPrices,
      ...fixture.vehicleSetups,
      ...fixture.trips,
    ]
    expect(all.every((r) => r.id.startsWith(MILEAGE_FIXTURE_ID_PREFIX))).toBe(
      true
    )
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length)
  })

  it('covers the main rendering cases', () => {
    const { trips } = fixture
    expect(trips.some((t) => t.date === toDateKey(now))).toBe(true)
    expect(trips.some((t) => t.roundTrip)).toBe(true)
    expect(trips.some((t) => t.note)).toBe(true)
    expect(trips.some((t) => t.vehicleId === MILEAGE_FIXTURE_IDS.ev)).toBe(true)
    expect(
      trips.some((t) => t.vehicleId === MILEAGE_FIXTURE_IDS.borrowed)
    ).toBe(true)
    expect(trips.some((t) => t.vehicleId === MILEAGE_FIXTURE_IDS.oldVan)).toBe(
      true
    )
    expect(fixture.vehicles.some((v) => v.archived)).toBe(true)
  })

  it('keeps odometer trips consistent and never round trips', () => {
    const odometerTrips = fixture.trips.filter(
      (t) => t.odometerStartMiles !== undefined
    )
    expect(odometerTrips.length).toBeGreaterThan(0)
    for (const t of odometerTrips) {
      expect(t.roundTrip).toBeUndefined()
      expect(t.odometerEndMiles! - t.odometerStartMiles!).toBeCloseTo(
        t.distanceMiles
      )
    }
  })

  it('only dates trips within the requested window', () => {
    const earliest = toDateKey(now.clone().subtract(29, 'days'))
    const { trips } = buildMileageFixture({ now, days: 30 })
    expect(trips.every((t) => t.date >= earliest)).toBe(true)
  })
})
