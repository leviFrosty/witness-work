import { describe, expect, it } from 'vitest'
import {
  defaultMileageVehicle,
  formatMileageDistance,
  formatMileageInput,
  fromMeters,
  localMileageDate,
  mileageDateToLocalDate,
  parseMileageNumber,
  resolveMileageDistanceUnit,
  toMeters,
  validateMileageEntry,
} from '@/lib/mileage'
import { MileageData, MileageEntry, MileageVehicle } from '@/types/mileage'

const vehicle: MileageVehicle = {
  id: 'v',
  name: 'Car',
  avatar: { type: 'emoji', value: '🚗' },
  avatarBackground: '#fff',
  createdAt: 1,
  updatedAt: 1,
}
const data: MileageData = {
  vehicles: [vehicle],
  categories: [],
  entries: [],
  deletedVehicles: [],
  deletedCategories: [],
  deletedEntries: [],
}
const entry: MileageEntry = {
  id: 'e',
  date: '2026-08-31',
  vehicleId: 'v',
  mode: 'distance',
  status: 'completed',
  distanceMeters: 1234.56789,
  createdAt: 1,
  updatedAt: 1,
}

describe('mileage measurements', () => {
  it('resolves device measurement preferences independently of date region', () => {
    expect(resolveMileageDistanceUnit('auto', 'metric')).toBe('km')
    expect(resolveMileageDistanceUnit('auto', 'us')).toBe('mi')
    expect(resolveMileageDistanceUnit('auto', 'uk')).toBe('mi')
    expect(resolveMileageDistanceUnit('auto', null)).toBe('km')
    expect(resolveMileageDistanceUnit('auto')).toBe('km')
    expect(resolveMileageDistanceUnit('km', 'us')).toBe('km')
    expect(resolveMileageDistanceUnit('mi', 'metric')).toBe('mi')
  })
  it('preserves physical readings through repeated cross-unit conversions', () => {
    let meters = toMeters(12345.678901, 'mi')
    const original = meters
    for (let i = 0; i < 100; i++) {
      meters = toMeters(fromMeters(meters, 'km'), 'km')
      meters = toMeters(fromMeters(meters, 'mi'), 'mi')
    }
    expect(meters).toBeCloseTo(original, 7)
    expect(toMeters(1, 'mi')).toBe(1609.344)
    expect(formatMileageDistance(toMeters(2, 'mi'), 'mi', 'en-US')).toBe('2 mi')
    expect(formatMileageDistance(1234.56789, 'km', 'en-US')).toBe('1.23 km')
    expect(formatMileageDistance(1234.56789, 'km', 'de-DE')).toBe('1,23 km')
  })
  it('parses locale decimals and rejects malformed, grouped and non-finite input', () => {
    expect(parseMileageNumber(' 12.75 ', 'en-US')).toBe(12.75)
    expect(parseMileageNumber('12,75', 'de-DE')).toBe(12.75)
    expect(parseMileageNumber('١٢٫٧٥', 'ar-EG')).toBe(12.75)
    expect(parseMileageNumber('0', 'en-US')).toBe(0)
    for (const raw of [
      '',
      '-1',
      'NaN',
      'Infinity',
      '1e3',
      '1,000',
      '1.2.3',
      '1 000',
      '9'.repeat(400),
    ])
      expect(parseMileageNumber(raw, 'en-US')).toBeNull()
    expect(parseMileageNumber('1.234', 'de-DE')).toBeNull()
  })
  it('uses native decimal settings when they differ from preferred language', () => {
    expect(parseMileageNumber('12,75', 'en-US', ',')).toBe(12.75)
    expect(parseMileageNumber('12.75', 'de-DE', '.')).toBe(12.75)
    expect(parseMileageNumber('12.75', 'en-US', ',')).toBeNull()
    expect(formatMileageInput(12750, 'km', 'en-US', ',')).toBe('12,75')
    expect(formatMileageInput(12750, 'km', 'de-DE', '.')).toBe('12.75')
  })
  it('formats persisted readings and parses decimals on Hermes without formatToParts', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Intl.NumberFormat.prototype,
      'formatToParts'
    )!
    Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', {
      ...descriptor,
      value: undefined,
    })
    try {
      expect(formatMileageInput(123750, 'km', 'en-US', '.')).toBe('123.75')
      expect(formatMileageInput(123750, 'km', 'en-US', ',')).toBe('123,75')
      expect(formatMileageInput(123750, 'km', 'de-DE')).toBe('123,75')
      expect(parseMileageNumber('123,75', 'de-DE')).toBe(123.75)
      expect(parseMileageNumber('١٢٣٫٧٥', 'ar-EG')).toBe(123.75)
    } finally {
      Object.defineProperty(
        Intl.NumberFormat.prototype,
        'formatToParts',
        descriptor
      )
    }
  })
})

describe('mileage entry invariants', () => {
  it('uses calendar dates without shifting the incurred day', () => {
    expect(localMileageDate(mileageDateToLocalDate('2026-08-31'))).toBe(
      '2026-08-31'
    )
    expect(validateMileageEntry(entry, data, '2026-09-01').date).toBe(
      '2026-08-31'
    )
    for (const date of ['2026-09-02', '2026-02-30', '2026-08-31T00:00:00Z'])
      expect(() =>
        validateMileageEntry({ ...entry, date }, data, '2026-09-01')
      ).toThrow()
  })
  it('requires positive completed distance and removes irrelevant odometer fields', () => {
    for (const distanceMeters of [0, -1, NaN, Infinity, undefined])
      expect(() =>
        validateMileageEntry({ ...entry, distanceMeters }, data)
      ).toThrow()
    expect(
      validateMileageEntry(
        { ...entry, startOdometerMeters: 20, endOdometerMeters: 25 },
        data
      )
    ).toEqual({
      ...entry,
      startOdometerMeters: undefined,
      endOdometerMeters: undefined,
    })
  })
  it('derives each odometer trip separately without requiring continuity', () => {
    const first = validateMileageEntry(
      {
        ...entry,
        mode: 'odometer',
        startOdometerMeters: 100,
        endOdometerMeters: 110,
        distanceMeters: 999,
      },
      data
    )
    const second = validateMileageEntry(
      {
        ...entry,
        id: 'e2',
        mode: 'odometer',
        startOdometerMeters: 400,
        endOdometerMeters: 425,
      },
      { ...data, entries: [first] }
    )
    expect(first.distanceMeters).toBe(10)
    expect(second.distanceMeters).toBe(25)
    for (const endOdometerMeters of [undefined, 100, 99, Infinity])
      expect(() =>
        validateMileageEntry({ ...first, endOdometerMeters }, data)
      ).toThrow()
  })
  it('allows one unfinished trip per vehicle and finishing across months', () => {
    const pending = validateMileageEntry(
      {
        ...entry,
        mode: 'odometer',
        status: 'inProgress',
        startOdometerMeters: 100,
      },
      data
    )
    expect(pending.distanceMeters).toBeUndefined()
    const withPending = {
      ...data,
      entries: [pending],
      vehicles: [vehicle, { ...vehicle, id: 'v2' }],
    }
    expect(() =>
      validateMileageEntry({ ...pending, id: 'e2' }, withPending)
    ).toThrow('inProgress')
    expect(
      validateMileageEntry(
        { ...pending, id: 'e2', vehicleId: 'v2' },
        withPending
      ).status
    ).toBe('inProgress')
    const complete = validateMileageEntry(
      { ...pending, status: 'completed', endOdometerMeters: 130 },
      withPending,
      '2026-09-10'
    )
    expect(complete.date).toBe('2026-08-31')
    expect(complete.distanceMeters).toBe(30)
  })
  it('permits retaining archived references while rejecting new use', () => {
    const archived = {
      ...data,
      vehicles: [{ ...vehicle, archivedAt: 3 }],
      categories: [
        { id: 'c', name: 'Trips', createdAt: 1, updatedAt: 3, archivedAt: 3 },
      ],
      entries: [{ ...entry, categoryId: 'c' }],
    }
    expect(
      validateMileageEntry(
        { ...entry, categoryId: 'c', note: 'edited' },
        archived
      ).note
    ).toBe('edited')
    expect(() =>
      validateMileageEntry({ ...entry, id: 'new' }, archived)
    ).toThrow('vehicle')
    expect(() =>
      validateMileageEntry(
        { ...entry, id: 'new', categoryId: 'c' },
        { ...archived, vehicles: [vehicle] }
      )
    ).toThrow('category')
    expect(defaultMileageVehicle(archived.vehicles, 'v')).toBeUndefined()
    expect(
      defaultMileageVehicle(
        [
          { ...vehicle, archivedAt: 3 },
          { ...vehicle, id: 'next' },
        ],
        'v'
      )?.id
    ).toBe('next')
  })
})
