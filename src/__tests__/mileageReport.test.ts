import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
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
import { buildReportCsv, csvField } from '@/features/mileage/lib/report'

describe('mileage report CSV', () => {
  it('quotes fields with commas, quotes, or line breaks', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
    expect(csvField(undefined)).toBe('')
  })

  it('writes one row per trip, oldest first, in display units', () => {
    const format = createMileageFormatter({
      ...resolveMileageUnits({ distanceUnit: 'km' }),
      currency: 'USD',
    })
    const index = buildMileageIndex(
      [
        {
          id: 's',
          vehicleId: 'car',
          effectiveFrom: '2026-01-01',
          fuelId: 'gas',
          milesPerGallon: 25,
        },
      ],
      [
        {
          id: 'p',
          fuelId: 'gas',
          effectiveFrom: '2026-01-01',
          pricePerGallon: 4,
        },
      ]
    )
    const csv = buildReportCsv({
      period: periodContaining('month', moment('2026-03-15')),
      trips: [
        {
          id: 'b',
          vehicleId: 'car',
          date: '2026-03-20',
          distanceMiles: 25,
          note: 'Territory 4, north',
          createdAt: 2,
        },
        {
          id: 'a',
          vehicleId: 'car',
          date: '2026-03-02',
          distanceMiles: 10,
          roundTrip: true,
          createdAt: 1,
        },
      ],
      vehicles: [{ id: 'car', name: 'Civic', createdAt: 1 }],
      fuels: [{ id: 'gas', name: 'Gasoline', createdAt: 1 }],
      index,
      format,
    })
    const rows = csv.split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[1].startsWith('2026-03-02,Civic,,,16.09,')).toBe(true)
    expect(rows[1].endsWith(',1.6')).toBe(true)
    expect(rows[2]).toContain('"Territory 4, north"')
    expect(rows[2].endsWith(',4')).toBe(true)
  })
})
