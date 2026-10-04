import moment from 'moment'
import { toDateKey } from '@/lib/mileage/calc'
import type {
  Fuel,
  FuelPrice,
  MileageCollections,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

/**
 * Dev-only fixture: a Mileage Tracking garage plus months of trips that cover
 * the main rendering cases — effective-dated fuel prices and car setups, an
 * archived car, a car with no fuel (no cost), distance vs odometer entries,
 * round trips, notes, and multiple trips on one day.
 *
 * Pure on purpose — no store access, no `Date.now()`; every date derives from
 * `now` — so ids stay stable and re-running the Tools generator upserts the
 * same records instead of piling up duplicates.
 */

export const MILEAGE_FIXTURE_ID_PREFIX = 'dev-mileage-'

const id = (suffix: string) => `${MILEAGE_FIXTURE_ID_PREFIX}${suffix}`

export const MILEAGE_FIXTURE_IDS = {
  gasoline: id('fuel-gasoline'),
  electric: id('fuel-electric'),
  sedan: id('vehicle-sedan'),
  ev: id('vehicle-ev'),
  borrowed: id('vehicle-borrowed'),
  oldVan: id('vehicle-old-van'),
} as const

export type MileageFixtureInput = {
  now: moment.Moment | Date
  /** How many days of trip history to generate, ending today. */
  days?: number
}

export const DEFAULT_MILEAGE_FIXTURE_DAYS = 180

const NOTES = [
  'Territory 12 — rural run',
  'Return visits across town',
  'Drove the group to the territory',
  'Kingdom Hall → cart witnessing spot',
]

export const buildMileageFixture = ({
  now,
  days = DEFAULT_MILEAGE_FIXTURE_DAYS,
}: MileageFixtureInput): MileageCollections => {
  const today = moment(now).startOf('day')
  const dateKey = (daysAgo: number) =>
    toDateKey(today.clone().subtract(daysAgo, 'days'))
  const createdAt = (daysAgo: number) =>
    today.clone().subtract(daysAgo, 'days').hour(12).valueOf()
  const ids = MILEAGE_FIXTURE_IDS
  // Price/setup changes land mid-history so reports cross a rate boundary.
  const midpoint = Math.floor(days / 2)

  const fuels: Fuel[] = [
    { id: ids.gasoline, name: 'Gasoline', createdAt: createdAt(days + 30) },
    { id: ids.electric, name: 'Electric', createdAt: createdAt(days + 30) },
  ]

  const fuelPrices: FuelPrice[] = [
    {
      id: id('price-gasoline-1'),
      fuelId: ids.gasoline,
      effectiveFrom: dateKey(days + 30),
      pricePerGallon: 3.49,
    },
    {
      id: id('price-gasoline-2'),
      fuelId: ids.gasoline,
      effectiveFrom: dateKey(midpoint),
      pricePerGallon: 3.89,
    },
    {
      id: id('price-electric-1'),
      fuelId: ids.electric,
      effectiveFrom: dateKey(days + 30),
      pricePerGallon: 1.25,
    },
  ]

  const vehicles: Vehicle[] = [
    { id: ids.sedan, name: 'Toyota Camry', createdAt: createdAt(days + 30) },
    { id: ids.ev, name: 'Tesla Model 3', createdAt: createdAt(days + 30) },
    // No setup at all → trips have distance but no estimated cost.
    { id: ids.borrowed, name: 'Borrowed car', createdAt: createdAt(days + 30) },
    {
      id: ids.oldVan,
      name: 'Old minivan (archived)',
      archived: true,
      createdAt: createdAt(days + 60),
    },
  ]

  const vehicleSetups: VehicleSetup[] = [
    {
      id: id('setup-sedan-1'),
      vehicleId: ids.sedan,
      effectiveFrom: dateKey(days + 30),
      fuelId: ids.gasoline,
      milesPerGallon: 28,
    },
    {
      id: id('setup-sedan-2'),
      vehicleId: ids.sedan,
      effectiveFrom: dateKey(midpoint),
      fuelId: ids.gasoline,
      milesPerGallon: 32,
    },
    {
      id: id('setup-ev-1'),
      vehicleId: ids.ev,
      effectiveFrom: dateKey(days + 30),
      fuelId: ids.electric,
      milesPerGallon: 120,
    },
    {
      id: id('setup-old-van-1'),
      vehicleId: ids.oldVan,
      effectiveFrom: dateKey(days + 60),
      fuelId: ids.gasoline,
      milesPerGallon: 19,
    },
  ]

  const trips: Trip[] = []
  // The sedan's odometer climbs across every odometer-mode trip.
  let odometer = 48_210
  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo--) {
    // Deterministic ~3 service days a week, always including today.
    const hash = (daysAgo * 2654435761) >>> 0
    if (daysAgo !== 0 && hash % 7 >= 3) continue
    const tripsForDay = hash % 11 === 0 ? 2 : 1
    for (let j = 0; j < tripsForDay; j++) {
      const seed = (daysAgo * 31 + j * 17) >>> 0
      const vehicleId =
        daysAgo > days - 20
          ? ids.oldVan
          : seed % 9 === 0
            ? ids.borrowed
            : seed % 3 === 0
              ? ids.ev
              : ids.sedan
      const oneWay = 3 + ((seed * 7) % 23) + ((seed * 13) % 10) / 10
      // Odometer entries are never round trips, matching the trip form.
      const useOdometer = vehicleId === ids.sedan && seed % 5 === 0
      const roundTrip = !useOdometer && seed % 4 === 0
      const distanceMiles =
        Math.round((roundTrip ? oneWay * 2 : oneWay) * 10) / 10
      const trip: Trip = {
        id: id(`trip-${daysAgo}-${j}`),
        vehicleId,
        date: dateKey(daysAgo),
        distanceMiles,
        createdAt: createdAt(daysAgo),
      }
      if (roundTrip) trip.roundTrip = true
      if (useOdometer) {
        trip.odometerStartMiles = odometer
        trip.odometerEndMiles = odometer + distanceMiles
      }
      if (seed % 6 === 0) trip.note = NOTES[seed % NOTES.length]
      if (vehicleId === ids.sedan)
        odometer = Math.round(odometer + distanceMiles + 40)
      trips.push(trip)
    }
  }

  return { vehicles, fuels, fuelPrices, vehicleSetups, trips }
}
