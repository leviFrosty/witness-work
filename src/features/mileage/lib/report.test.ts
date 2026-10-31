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
import {
  buildReportCsv,
  buildReportText,
  buildTripText,
} from '@/features/mileage/lib/report'
import {
  buildMileagePeople,
  EVERYONE,
  ME,
  tripsByPerson,
} from '@/lib/mileage/people'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'
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

describe('mileage reports on Shared Cars', () => {
  const shared = () => {
    const fixture = peopleFixture()
    const people = buildMileagePeople(fixture.cars, fixture.buddies)
    // Newest first, as the Mileage screen hands them over.
    const trips = [
      fixture.trips.mazdaAna,
      fixture.trips.vanCal,
      fixture.trips.vanAna,
      fixture.trips.vanMine,
      fixture.trips.mine,
    ]
    return { ...fixture, people, trips }
  }
  const csvRows = (csv: string) =>
    csv.split('\r\n').map((row) => row.split(','))

  it('adds a Logged By column after the car once a trip is on a Shared Car', () => {
    const { people, trips, vehicles } = shared()
    const rows = csvRows(
      buildReportCsv({
        period,
        trips,
        vehicles,
        fuels: [],
        index,
        format,
        sharing: { people, ownName: 'Levi W.', filter: EVERYONE },
      })
    )
    expect(rows[0].slice(1, 3)).toEqual(['Car', 'Logged By'])
    expect(rows.slice(1).map((row) => row.slice(1, 3))).toEqual([
      ['Civic', 'Levi W.'],
      ['Family Minivan', 'Levi W.'],
      ['Family Minivan', 'Annie'],
      ['Family Minivan', 'Cal'],
      ['Mazda CX-5', 'Annie'],
    ])
  })

  it('leaves the column out when every trip is on the User’s own cars', () => {
    const { people, trips, vehicles } = shared()
    const header = csvRows(
      buildReportCsv({
        period,
        trips: [trips[4]],
        vehicles,
        fuels: [],
        index,
        format,
        sharing: { people, ownName: 'Levi W.', filter: ME },
      })
    )[0]
    expect(header).not.toContain('Logged By')
    expect(header[2]).toBe('Odometer Start')
  })

  it('names others’ trips when showing everyone’s', () => {
    const { people, trips, vehicles } = shared()
    const text = buildReportText({
      period,
      trips,
      vehicles,
      fuels: [],
      index,
      format,
      sharing: { people, ownName: 'Levi W.', filter: EVERYONE },
    })
    const lines = text.split('\n')
    expect(lines[2]).toBe('')
    expect(lines.slice(lines.indexOf('Trips:') + 1)).toEqual([
      'Mar 2 · 10 mi · Civic',
      'Mar 2 · 20 mi · Family Minivan',
      'Mar 2 · 30 mi · Family Minivan · Annie',
      'Mar 2 · 50 mi · Family Minivan · Cal',
      'Mar 2 · 60 mi · Mazda CX-5 · Annie',
    ])
  })

  it('says whose trips a filtered report holds', () => {
    const { people, trips, vehicles } = shared()
    const anas = tripsByPerson(trips, 'buddy:inbox-ana', people)
    const lines = buildReportText({
      period,
      trips: anas,
      vehicles,
      fuels: [],
      index,
      format,
      sharing: { people, filter: 'buddy:inbox-ana' },
    }).split('\n')
    expect(lines.slice(0, 4)).toEqual([
      'Mileage Report',
      'March 2026',
      'Logged by: Annie',
      '',
    ])
    expect(lines).toContain('Distance: 90 mi')
    expect(lines.slice(lines.indexOf('Trips:') + 1)).toEqual([
      'Mar 2 · 30 mi · Family Minivan',
      'Mar 2 · 60 mi · Mazda CX-5',
    ])
  })

  it('says a report filtered to Me holds the User’s trips, by their own name', () => {
    const { people, trips, vehicles } = shared()
    const mine = (ownName?: string) =>
      buildReportText({
        period,
        trips: tripsByPerson(trips, ME, people),
        vehicles,
        fuels: [],
        index,
        format,
        sharing: { people, ownName, filter: ME },
      }).split('\n')

    expect(mine('Levi W.').slice(0, 4)).toEqual([
      'Mileage Report',
      'March 2026',
      'Logged by: Levi W.',
      '',
    ])
    expect(mine('Levi W.')).toContain('Distance: 30 mi')
    // Without a Buddy Card name, the one they share on their cars.
    expect(mine()[2]).toBe('Logged by: Levi')
  })

  it('names the User the same way on every row of theirs in the CSV', () => {
    const { people, trips, vehicles, cars, VAN, MAZDA } = shared()
    const loggedBy = (
      sharing: Parameters<typeof buildReportCsv>[0]['sharing']
    ) =>
      csvRows(
        buildReportCsv({
          period,
          trips,
          vehicles,
          fuels: [],
          index,
          format,
          sharing,
        })
      )
        .slice(1)
        .map((row) => row[2])

    // With no Buddy Card name, their own car's trip and their trip on a
    // Shared Car both read as the name they share on their cars.
    expect(loggedBy({ people, ownName: '', filter: EVERYONE })).toEqual([
      'Levi',
      'Levi',
      'Annie',
      'Cal',
      'Annie',
    ])
    // Before their own member record has synced anywhere: "Me" throughout.
    const unnamed = Object.fromEntries(
      Object.entries(cars).map(([spaceId, car]) => [
        spaceId,
        {
          ...car,
          members: car.members.filter((m) => m.memberId !== car.myMemberId),
          memberRecords: car.memberRecords.filter(
            (m) => m.memberId !== car.myMemberId
          ),
        },
      ])
    )
    const withoutMe = buildMileagePeople(unnamed, [])
    expect(withoutMe.person(VAN, `me-${VAN}`)).toBeUndefined()
    expect(withoutMe.person(MAZDA, `me-${MAZDA}`)).toBeUndefined()
    expect(
      loggedBy({ people: withoutMe, ownName: '', filter: EVERYONE }).slice(0, 2)
    ).toEqual(['Me', 'Me'])
  })

  it('says who logged a shared trip in its share text', () => {
    const { people, trips, vehicles } = shared()
    const sharing = { people, ownName: 'Levi W.' }
    expect(
      buildTripText(trips[2], vehicles, index, format, sharing).split('\n')
    ).toEqual(['Mar 2 · Family Minivan', 'Distance: 30 mi', 'Logged by: Annie'])
    expect(buildTripText(trips[3], vehicles, index, format, sharing)).toContain(
      'Logged by: Levi W.'
    )
    expect(
      buildTripText(trips[4], vehicles, index, format, sharing)
    ).not.toContain('Logged by')
  })
})
