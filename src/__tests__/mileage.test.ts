import { describe, expect, it } from 'vitest'
import moment from 'moment'
import {
  buildMileageIndex,
  defaultVehicleId,
  effectiveEntry,
  estimateTrip,
  latestOdometerMiles,
  periodContaining,
  resolveHistoryWrite,
  shiftPeriod,
  summarizeTrips,
  toDateKey,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import {
  autoDistanceUnit,
  autoFuelEconomyUnit,
  displayToPricePerGallon,
  distanceToMiles,
  economyToMpg,
  milesToDistance,
  mpgToEconomy,
  parseDecimal,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import type { FuelPrice, Trip, Vehicle, VehicleSetup } from '@/types/mileage'

const vehicle = (id: string, archived?: boolean): Vehicle => ({
  id,
  name: id,
  archived,
  createdAt: 1,
})
const trip = (overrides: Partial<Trip> & { id: string }): Trip => ({
  vehicleId: 'car',
  date: '2026-03-10',
  distanceMiles: 10,
  createdAt: 1,
  ...overrides,
})
const setup = (
  id: string,
  effectiveFrom: string,
  milesPerGallon?: number,
  fuelId = 'gas'
): VehicleSetup => ({
  id,
  vehicleId: 'car',
  effectiveFrom,
  fuelId,
  milesPerGallon,
})
const price = (
  id: string,
  effectiveFrom: string,
  pricePerGallon: number
): FuelPrice => ({ id, fuelId: 'gas', effectiveFrom, pricePerGallon })

describe('mileage units', () => {
  it('round-trips distance through canonical miles', () => {
    expect(milesToDistance(10, 'km')).toBeCloseTo(16.0934, 4)
    expect(distanceToMiles(milesToDistance(42, 'km'), 'km')).toBeCloseTo(42)
    expect(milesToDistance(10, 'mi')).toBe(10)
  })

  it('converts fuel economy in every unit both ways', () => {
    expect(mpgToEconomy(30, 'lPer100km')).toBeCloseTo(7.84, 2)
    expect(mpgToEconomy(30, 'kmPerL')).toBeCloseTo(12.75, 2)
    expect(mpgToEconomy(30, 'mpgUK')).toBeCloseTo(36.03, 2)
    for (const unit of ['mpgUS', 'mpgUK', 'lPer100km', 'kmPerL'] as const)
      expect(economyToMpg(mpgToEconomy(27.5, unit), unit)).toBeCloseTo(27.5)
  })

  it('prices per US gallon only alongside US mpg', () => {
    expect(pricePerGallonToDisplay(3.785411784, 'lPer100km')).toBeCloseTo(1)
    expect(pricePerGallonToDisplay(3.5, 'mpgUS')).toBe(3.5)
    expect(displayToPricePerGallon(1.8, 'mpgUK')).toBeCloseTo(6.8137, 4)
  })

  it('defaults units from the device region', () => {
    expect(autoDistanceUnit('US')).toBe('mi')
    expect(autoDistanceUnit('gb')).toBe('mi')
    expect(autoDistanceUnit('DE')).toBe('km')
    expect(autoDistanceUnit(undefined)).toBe('km')
    expect(autoFuelEconomyUnit('US')).toBe('mpgUS')
    expect(autoFuelEconomyUnit('GB')).toBe('mpgUK')
    expect(autoFuelEconomyUnit('JP')).toBe('kmPerL')
    expect(autoFuelEconomyUnit('FR')).toBe('lPer100km')
  })

  it('parses decimals with either separator', () => {
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal(' 7 ')).toBe(7)
    expect(parseDecimal('')).toBeUndefined()
    expect(parseDecimal('.')).toBeUndefined()
    expect(parseDecimal('1.2.3')).toBeUndefined()
    expect(parseDecimal('abc')).toBeUndefined()
  })
})

describe('effective-dated history', () => {
  const history = [
    setup('a', '2026-01-01', 25),
    setup('b', '2026-03-01', 30),
    setup('c', '2026-06-15', 35),
  ]

  it('picks the newest entry on or before the date', () => {
    expect(effectiveEntry(history, '2026-03-01')?.id).toBe('b')
    expect(effectiveEntry(history, '2026-06-14')?.id).toBe('b')
    expect(effectiveEntry(history, '2026-12-31')?.id).toBe('c')
  })

  it('applies the first entry to earlier dates', () => {
    expect(effectiveEntry(history, '2025-05-05')?.id).toBe('a')
    expect(effectiveEntry([], '2025-05-05')).toBeUndefined()
  })

  it('never changes past trips when a new price starts later', () => {
    const before = buildMileageIndex(
      [setup('s', '2026-01-01', 25)],
      [price('p1', '2026-01-01', 3)]
    )
    const after = buildMileageIndex(
      [setup('s', '2026-01-01', 25)],
      [price('p1', '2026-01-01', 3), price('p2', '2026-04-01', 4)]
    )
    const march = trip({ id: 't', date: '2026-03-31', distanceMiles: 50 })
    const april = trip({ id: 'u', date: '2026-04-01', distanceMiles: 50 })
    expect(estimateTrip(march, before).cost).toBeCloseTo(6)
    expect(estimateTrip(march, after).cost).toBeCloseTo(6)
    expect(estimateTrip(april, after).cost).toBeCloseTo(8)
  })

  it('omits cost without both fuel economy and a fuel price', () => {
    const noEconomy = buildMileageIndex(
      [setup('s', '2026-01-01')],
      [price('p', '2026-01-01', 3)]
    )
    const noPrice = buildMileageIndex([setup('s', '2026-01-01', 25)], [])
    expect(estimateTrip(trip({ id: 't' }), noEconomy).cost).toBeUndefined()
    expect(estimateTrip(trip({ id: 't' }), noPrice).cost).toBeUndefined()
  })

  it('reuses the index for the same arrays', () => {
    const setups = [setup('s', '2026-01-01', 25)]
    const prices = [price('p', '2026-01-01', 3)]
    expect(buildMileageIndex(setups, prices)).toBe(
      buildMileageIndex(setups, prices)
    )
  })

  it('resolves where an edit writes', () => {
    expect(
      resolveHistoryWrite(history, 'correct', '2026-09-01', '2026-05-01')
    ).toEqual({ target: history[1], effectiveFrom: '2026-03-01' })
    expect(
      resolveHistoryWrite(history, 'starting', '2026-09-01', '2026-05-01')
    ).toEqual({ target: undefined, effectiveFrom: '2026-09-01' })
    expect(
      resolveHistoryWrite(history, 'starting', '2026-06-15', '2026-05-01')
        .target
    ).toBe(history[2])
  })
})

describe('mileage periods', () => {
  it('builds weeks from the start-of-week preference', () => {
    // Wednesday, March 11 2026.
    const sunday = periodContaining('week', moment('2026-03-11'), 0)
    expect(toDateKey(sunday.start)).toBe('2026-03-08')
    expect(toDateKey(sunday.end)).toBe('2026-03-14')
    const monday = periodContaining('week', moment('2026-03-11'), 1)
    expect(toDateKey(monday.start)).toBe('2026-03-09')
  })

  it('uses the September–August service year', () => {
    const year = periodContaining('year', moment('2026-03-11'))
    expect(toDateKey(year.start)).toBe('2025-09-01')
    expect(toDateKey(year.end)).toBe('2026-08-31')
    const next = periodContaining('year', moment('2026-09-01'))
    expect(toDateKey(next.start)).toBe('2026-09-01')
  })

  it('shifts across month ends', () => {
    const jan = periodContaining('month', moment('2026-01-31'))
    expect(toDateKey(shiftPeriod(jan, 1).start)).toBe('2026-02-01')
    expect(toDateKey(shiftPeriod(jan, -1).start)).toBe('2025-12-01')
  })

  it('filters and orders trips in a period', () => {
    const trips = [
      trip({ id: 'feb', date: '2026-02-28' }),
      trip({ id: 'early', date: '2026-03-01', createdAt: 1 }),
      trip({ id: 'late', date: '2026-03-31', createdAt: 1 }),
      trip({ id: 'same-day-newer', date: '2026-03-01', createdAt: 5 }),
    ]
    const march = periodContaining('month', moment('2026-03-15'))
    expect(tripsInPeriod(trips, march).map((t) => t.id)).toEqual([
      'late',
      'same-day-newer',
      'early',
    ])
  })
})

describe('mileage summaries', () => {
  it('totals distance and the cost of trips that have one', () => {
    const index = buildMileageIndex(
      [setup('s', '2026-01-01', 25)],
      [price('p', '2026-01-01', 4)]
    )
    const summary = summarizeTrips(
      [
        trip({ id: 'a', distanceMiles: 25 }),
        trip({ id: 'b', vehicleId: 'other', distanceMiles: 15 }),
      ],
      index,
      [vehicle('car'), vehicle('other')]
    )
    expect(summary.distanceMiles).toBe(40)
    expect(summary.tripCount).toBe(2)
    expect(summary.cost).toBeCloseTo(4)
    expect(summary.costIncomplete).toBe(true)
    expect(summary.byVehicle.map((v) => v.vehicleId)).toEqual(['car', 'other'])
    expect(summary.byVehicle[1].cost).toBeUndefined()
  })

  it('defaults to the car of the most recently logged trip', () => {
    const vehicles = [vehicle('a'), vehicle('b'), vehicle('old', true)]
    expect(
      defaultVehicleId(
        [
          trip({ id: '1', vehicleId: 'a', createdAt: 1 }),
          trip({ id: '2', vehicleId: 'b', createdAt: 2 }),
          trip({ id: '3', vehicleId: 'old', createdAt: 3 }),
        ],
        vehicles
      )
    ).toBe('b')
    expect(defaultVehicleId([], vehicles)).toBe('a')
  })

  it('prefills the odometer from the latest reading on or before the date', () => {
    const trips = [
      trip({ id: '1', date: '2026-03-01', odometerEndMiles: 100 }),
      trip({ id: '2', date: '2026-03-05', odometerEndMiles: 150 }),
      trip({ id: '3', date: '2026-03-09', odometerEndMiles: 210 }),
      trip({ id: '4', date: '2026-03-06', vehicleId: 'other' }),
    ]
    expect(latestOdometerMiles(trips, 'car', '2026-03-06')).toBe(150)
    expect(latestOdometerMiles(trips, 'car', '2026-03-31')).toBe(210)
    expect(latestOdometerMiles(trips, 'car', '2026-03-31', '3')).toBe(150)
    expect(latestOdometerMiles(trips, 'car', '2026-02-01')).toBeUndefined()
  })
})
