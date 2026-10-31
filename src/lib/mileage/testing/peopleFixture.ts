import type { MileageBuddy } from '@/lib/mileage/people'
import type { SharedCar, SharedCarMember } from '@/types/sharedCars'
import type { Trip, Vehicle } from '@/types/mileage'
import { carMember, sharedCar } from '@/lib/mileage/testing/sharedCars'

/**
 * Two Shared Cars and a car of the User's own, for tests of who's who:
 *
 * - The User's own Civic, with trip `mine`.
 * - The Family Minivan (`van-space`), which the User shared: on it are the User,
 *   Ana (a buddy, by the nickname "Annie") and Ben (not a buddy). Cal was on it
 *   and left; his trip stays.
 * - The Mazda (`mazda-space`), which Ana shared with the User.
 */

const trip = (
  id: string,
  vehicleId: string,
  distanceMiles: number,
  extra: Partial<Trip> = {}
): Trip => ({
  id,
  vehicleId,
  date: '2026-03-02',
  distanceMiles,
  createdAt: 1,
  ...extra,
})

const VAN = 'van-space'
const MAZDA = 'mazda-space'

const vanMembers: SharedCarMember[] = [
  carMember(VAN, `me-${VAN}`, 'Levi', { joinedAt: 1, inbox: 'inbox-me' }),
  carMember(VAN, 'ana-van', 'Ana Pereira', { joinedAt: 2, inbox: 'inbox-ana' }),
  carMember(VAN, 'ben', 'Ben', { joinedAt: 3, avatar: '🚗' }),
]
const cal = carMember(VAN, 'cal', 'Cal', { joinedAt: 4 })
const mazdaMembers: SharedCarMember[] = [
  carMember(MAZDA, 'ana-mazda', 'Ana Pereira', {
    joinedAt: 1,
    inbox: 'inbox-ana',
  }),
  carMember(MAZDA, `me-${MAZDA}`, 'Levi', { joinedAt: 2, inbox: 'inbox-me' }),
]

export const peopleFixture = () => {
  const trips = {
    mine: trip('mine', 'civic', 10),
    vanMine: trip('van-mine', 'van', 20, { loggedBy: `me-${VAN}` }),
    vanAna: trip('van-ana', 'van', 30, {
      loggedBy: 'ana-van',
      editedBy: `me-${VAN}`,
    }),
    vanBen: trip('van-ben', 'van', 40, {
      loggedBy: 'ben',
      editedBy: 'ben',
    }),
    vanCal: trip('van-cal', 'van', 50, { loggedBy: 'cal' }),
    mazdaAna: trip('mazda-ana', 'mazda', 60, { loggedBy: 'ana-mazda' }),
  }
  const vehicles: Vehicle[] = [
    { id: 'civic', name: 'Civic', createdAt: 1 },
    { id: 'van', name: 'Family Minivan', createdAt: 2 },
    { id: 'mazda', name: 'Mazda CX-5', createdAt: 3 },
  ]
  const cars: Record<string, SharedCar> = {
    [VAN]: sharedCar(VAN, {
      seq: 5,
      vehicles: [vehicles[1]],
      trips: [trips.vanMine, trips.vanAna, trips.vanBen, trips.vanCal],
      members: vanMembers,
      memberRecords: [...vanMembers, cal],
    }),
    [MAZDA]: sharedCar(MAZDA, {
      seq: 3,
      ownerId: 'ana-mazda',
      vehicles: [vehicles[2]],
      trips: [trips.mazdaAna],
      members: mazdaMembers,
      memberRecords: mazdaMembers,
    }),
  }
  const buddies: MileageBuddy[] = [
    {
      inboxId: 'inbox-ana',
      name: 'Annie',
      avatar: { type: 'emoji', value: '🌻' },
      color: '#ff8800',
    },
  ]
  return {
    VAN,
    MAZDA,
    trips,
    /** Every trip, as the combined mileage view lists them. */
    allTrips: Object.values(trips),
    vehicles,
    cars,
    buddies,
  }
}
