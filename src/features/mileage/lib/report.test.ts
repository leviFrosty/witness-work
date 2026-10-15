import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US', currencyCode: 'USD' }],
  getCalendars: () => [],
}))

import moment from 'moment'
import { buildMileageIndex, periodContaining } from '@/lib/mileage/calc'
import {
  createMileageFormatter,
  resolveMileageUnits,
} from '@/features/mileage/lib/format'
import { buildReportText, buildTripText } from '@/features/mileage/lib/report'
import type { Trip, Vehicle } from '@/types/mileage'

const format = createMileageFormatter({
  ...resolveMileageUnits({ distanceUnit: 'mi', fuelEconomyUnit: 'mpgUS' }),
  currency: 'USD',
})
const index = buildMileageIndex(
  [
    {
      id: 's',
      vehicleId: 'civic',
      effectiveFrom: '2026-01-01',
      fuelId: 'gas',
      milesPerGallon: 25,
    },
  ],
  [{ id: 'p', fuelId: 'gas', effectiveFrom: '2026-01-01', pricePerGallon: 4 }]
)
const vehicles: Vehicle[] = [
  { id: 'civic', name: 'Civic', createdAt: 1 },
  { id: 'van', name: 'Van', createdAt: 2 },
]
const trip = (
  id: string,
  vehicleId: string,
  date: string,
  distanceMiles: number,
  extra: Partial<Trip> = {}
): Trip => ({ id, vehicleId, date, distanceMiles, createdAt: 1, ...extra })

const period = periodContaining('month', moment('2026-03-15'))

describe('mileage report text', () => {
  it('writes one trip with singular wording', () => {
    const text = buildReportText({
      period,
      trips: [trip('a', 'civic', '2026-03-02', 25)],
      vehicles,
      fuels: [],
      index,
      format,
    })
    expect(text.split('\n')).toEqual([
      'Mileage Report',
      'March 2026',
      '',
      'Distance: 25 mi',
      'Trips: 1',
      'Est. Fuel Cost: $4.00',
      '',
      'Trips:',
      'Mar 2 · 25 mi',
    ])
  })

  it('totals each car with plural wording', () => {
    const text = buildReportText({
      period,
      trips: [
        trip('c', 'van', '2026-03-09', 10),
        trip('b', 'van', '2026-03-05', 5),
        trip('a', 'civic', '2026-03-02', 25),
      ],
      vehicles,
      fuels: [],
      index,
      format,
    })
    const lines = text.split('\n')
    expect(lines.slice(3, 5)).toEqual(['Distance: 40 mi', 'Trips: 3'])
    expect(lines).toContain('By car:')
    expect(lines).toContain('Civic: 25 mi · 1 trip · $4.00')
    expect(lines).toContain('Van: 15 mi · 2 trips')
  })

  it('marks a round trip in the trip text', () => {
    expect(
      buildTripText(
        trip('a', 'civic', '2026-03-02', 50, { roundTrip: true }),
        vehicles,
        index,
        format
      ).split('\n')
    ).toEqual([
      'Mar 2 · Civic',
      'Distance: 50 mi (Round Trip)',
      'Est. Fuel Cost: $8.00',
    ])
    expect(
      buildTripText(trip('b', 'van', '2026-03-02', 1), vehicles, index, format)
    ).toBe('Mar 2 · Van\nDistance: 1 mi')
  })
})
