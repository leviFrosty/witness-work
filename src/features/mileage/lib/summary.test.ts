import { describe, expect, it } from 'vitest'
import { formatMileageDistance, toMeters } from '@/lib/mileage'
import type {
  MileageCategory,
  MileageEntry,
  MileageVehicle,
} from '@/types/mileage'
import {
  buildMileageReportText,
  mileageEntryDateForPeriod,
  isInMileagePeriod,
  mileageHistoryYears,
  mileageServiceYear,
  mileageYearMonths,
  summarizeMileage,
} from '@/features/mileage/lib/summary'

const entry = (
  id: string,
  date: string,
  meters: number,
  extra: Partial<MileageEntry> = {}
): MileageEntry => ({
  id,
  date,
  vehicleId: 'car',
  mode: 'distance',
  status: 'completed',
  distanceMeters: meters,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})
const car: MileageVehicle = {
  id: 'car',
  name: 'Renamed Corolla',
  avatar: { type: 'emoji', value: '🚗' },
  avatarBackground: '#000000',
  createdAt: 1,
  updatedAt: 2,
  archivedAt: 3,
}
const category: MileageCategory = {
  id: 'territory',
  name: 'Renamed Territory',
  createdAt: 1,
  updatedAt: 2,
  archivedAt: 3,
}
const september = { kind: 'month' as const, month: 8, year: 2026 }
const labels = {
  title: 'September 2026 — Mileage',
  total: 'Total',
  unknownVehicle: 'Vehicle',
  unknownCategory: 'Mileage Category',
  uncategorized: 'Uncategorized',
}

describe('mileage history summaries', () => {
  it('uses incurred day keys across month and Service Year boundaries', () => {
    expect(mileageServiceYear('2026-08-31')).toBe(2025)
    expect(mileageServiceYear('2026-09-01')).toBe(2026)
    expect(mileageServiceYear('2027-08-31')).toBe(2026)
    expect(isInMileagePeriod('2026-09-01', september)).toBe(true)
    expect(isInMileagePeriod('2026-08-31', september)).toBe(false)
    expect(
      isInMileagePeriod('2027-09-01', { kind: 'year', startYear: 2026 })
    ).toBe(false)
    expect(mileageYearMonths(2026)).toEqual([
      { month: 8, year: 2026 },
      { month: 9, year: 2026 },
      { month: 10, year: 2026 },
      { month: 11, year: 2026 },
      ...Array.from({ length: 8 }, (_, month) => ({ month, year: 2027 })),
    ])
  })

  it('keeps one row per entry and uses stable creation order within each day', () => {
    const entries = [
      entry('a', '2026-09-01', 3),
      entry('c', '2026-09-02', 4, { createdAt: 2 }),
      entry('b', '2026-09-02', 5),
    ]
    expect(
      summarizeMileage(entries, september).entries.map((item) => item.id)
    ).toEqual(['c', 'b', 'a'])
    expect(entries.map((item) => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('preserves pending entries in history but excludes them from every total', () => {
    const pending = entry('pending', '2026-09-01', 9000, {
      status: 'inProgress',
      mode: 'odometer',
      startOdometerMeters: 100000,
    })
    const summary = summarizeMileage(
      [pending, entry('finished', '2026-09-02', 1000)],
      september
    )
    expect(summary.entries).toHaveLength(2)
    expect(summary.completedCount).toBe(1)
    expect(summary.meters).toBe(1000)
    expect(summary.vehicles[0].meters).toBe(1000)
    expect(summary.categories[0].meters).toBe(1000)
  })

  it('applies Vehicle filtering to entries and every breakdown for all period kinds', () => {
    const entries = [
      entry('a', '2026-09-01', 1000, { categoryId: 'territory' }),
      entry('b', '2026-09-02', 3000, { vehicleId: 'van' }),
      entry('c', '2027-08-31', 500),
    ]
    for (const period of [
      september,
      { kind: 'year' as const, startYear: 2026 },
      { kind: 'allTime' as const },
    ]) {
      const summary = summarizeMileage(entries, period, 'car')
      expect(summary.vehicles.map((vehicle) => vehicle.vehicleId)).toEqual([
        'car',
      ])
      expect(summary.entries.every((item) => item.vehicleId === 'car')).toBe(
        true
      )
      expect(summary.meters).toBe(period.kind === 'month' ? 1000 : 1500)
      expect(
        summary.categories.reduce((sum, item) => sum + item.meters, 0)
      ).toBe(summary.meters)
    }
  })

  it('sums unrounded physical measurements and reconciles month/year/all-time drilldowns', () => {
    const entries = [
      entry('a', '2026-08-31', 1.111),
      entry('b', '2026-09-01', 2.222),
      entry('c', '2026-09-01', 3.333),
      entry('d', '2027-08-31', 4.444),
    ]
    const all = summarizeMileage(entries, { kind: 'allTime' })
    const years = mileageHistoryYears(entries)
    expect(years).toEqual([2026, 2025])
    expect(
      years.reduce(
        (sum, startYear) =>
          sum + summarizeMileage(entries, { kind: 'year', startYear }).meters,
        0
      )
    ).toBeCloseTo(all.meters, 10)
    const year = summarizeMileage(entries, { kind: 'year', startYear: 2026 })
    expect(
      mileageYearMonths(2026).reduce(
        (sum, month) =>
          sum + summarizeMileage(entries, { kind: 'month', ...month }).meters,
        0
      )
    ).toBeCloseTo(year.meters, 10)
    expect(all.meters).toBeCloseTo(11.11, 10)
  })

  it('filters All Time year rows by Vehicle and never invents placeholder years', () => {
    const entries = [
      entry('a', '2024-10-01', 1),
      entry('b', '2026-10-01', 1, { vehicleId: 'van' }),
    ]
    expect(mileageHistoryYears(entries, 'car')).toEqual([2024])
    expect(mileageHistoryYears([])).toEqual([])
  })
})

describe('mileage report text', () => {
  it('includes archived references using their current names and per-car categories', () => {
    const entries = [
      entry('a', '2026-09-01', toMeters(1.25, 'mi'), {
        categoryId: 'territory',
      }),
      entry('b', '2026-09-02', toMeters(0.75, 'mi')),
      entry('c', '2026-09-03', toMeters(3, 'mi'), {
        vehicleId: 'van',
        categoryId: 'territory',
      }),
      entry('pending', '2026-09-04', 100000, { status: 'inProgress' }),
      entry('old', '2026-08-31', 90000),
    ]
    const summary = summarizeMileage(entries, september)
    const text = buildMileageReportText({
      summary,
      vehicles: [car, { ...car, id: 'van', name: 'Van' }],
      categories: [category],
      labels,
      formatDistance: (meters) => formatMileageDistance(meters, 'mi', 'en-US'),
    })
    expect(text).toBe(
      'September 2026 — Mileage\nTotal: 5 mi\nVan: 3 mi\n  Renamed Territory: 3 mi\nRenamed Corolla: 2 mi\n  Uncategorized: 0.75 mi\n  Renamed Territory: 1.25 mi'
    )
    expect(
      summary.vehicles.reduce((sum, vehicle) => sum + vehicle.meters, 0)
    ).toBe(summary.meters)
    for (const vehicle of summary.vehicles)
      expect(
        vehicle.categories.reduce((sum, item) => sum + item.meters, 0)
      ).toBeCloseTo(vehicle.meters, 10)
  })

  it('changes output units without changing physical scope or totals', () => {
    const summary = summarizeMileage(
      [entry('a', '2026-09-01', toMeters(1, 'mi'))],
      september
    )
    const build = (unit: 'mi' | 'km') =>
      buildMileageReportText({
        summary,
        vehicles: [car],
        categories: [],
        labels,
        formatDistance: (meters) =>
          formatMileageDistance(meters, unit, 'en-US'),
      })
    expect(build('mi')).toContain('Total: 1 mi')
    expect(build('km')).toContain('Total: 1.61 km')
    expect(summary.meters).toBe(1609.344)
  })

  it('exports an empty month and readable orphan references without dropping distances', () => {
    const empty = buildMileageReportText({
      summary: summarizeMileage([], september),
      vehicles: [],
      categories: [],
      labels,
      formatDistance: (meters) => formatMileageDistance(meters, 'km', 'en-US'),
    })
    expect(empty).toBe('September 2026 — Mileage\nTotal: 0 km')
    const orphan = buildMileageReportText({
      summary: summarizeMileage(
        [entry('a', '2026-09-01', 1000, { categoryId: 'lost' })],
        september
      ),
      vehicles: [],
      categories: [],
      labels,
      formatDistance: (meters) => formatMileageDistance(meters, 'km', 'en-US'),
    })
    expect(orphan).toContain('Vehicle: 1 km\n  Mileage Category: 1 km')
  })
})

describe('mileage entry dates from history', () => {
  it('clamps the day into the selected past month, including leap years', () => {
    expect(
      mileageEntryDateForPeriod(
        { kind: 'month', month: 1, year: 2026 },
        '2026-03-31'
      )
    ).toBe('2026-02-28')
    expect(
      mileageEntryDateForPeriod(
        { kind: 'month', month: 1, year: 2024 },
        '2026-03-31'
      )
    ).toBe('2024-02-29')
    expect(
      mileageEntryDateForPeriod(
        { kind: 'month', month: 7, year: 2026 },
        '2026-09-04'
      )
    ).toBe('2026-08-04')
  })
  it('uses today in the current month or a future browsing period', () => {
    expect(
      mileageEntryDateForPeriod(
        { kind: 'month', month: 8, year: 2026 },
        '2026-09-04'
      )
    ).toBe('2026-09-04')
    expect(
      mileageEntryDateForPeriod(
        { kind: 'month', month: 9, year: 2026 },
        '2026-09-04'
      )
    ).toBe('2026-09-04')
    expect(
      mileageEntryDateForPeriod({ kind: 'year', startYear: 2027 }, '2026-09-04')
    ).toBe('2026-09-04')
  })
  it('uses the latest past day in a finished Service Year and today for current/all-time', () => {
    expect(
      mileageEntryDateForPeriod({ kind: 'year', startYear: 2025 }, '2026-09-04')
    ).toBe('2026-08-31')
    expect(
      mileageEntryDateForPeriod({ kind: 'year', startYear: 2026 }, '2026-09-04')
    ).toBe('2026-09-04')
    expect(mileageEntryDateForPeriod({ kind: 'allTime' }, '2026-09-04')).toBe(
      '2026-09-04'
    )
  })
})
