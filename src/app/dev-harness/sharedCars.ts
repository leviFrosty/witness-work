import * as Crypto from 'expo-crypto'
import { toDateKey } from '@/lib/mileage/calc'
import { emptySharedCar } from '@/lib/mileage/sharedCar'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import useSharedCars from '@/stores/sharedCars'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import { sharedCarsEngine } from '@/app/sharedCars/sharedCarsService'
import type { Trip } from '@/types/mileage'
import type { CarInvitePayload, SharedCarMember } from '@/types/sharedCars'

let last: unknown = null

/**
 * Runs `work` and returns its promise; its result (or `{ error }`) also lands
 * in `last`, since eval doesn't await.
 */
function tracked<T>(work: () => Promise<T>): Promise<T> {
  last = { pending: true }
  const run = work()
  run.then(
    (value) => {
      last = value ?? { done: true }
    },
    (error: unknown) => {
      const code = (error as { code?: unknown } | null)?.code
      last = { error: typeof code === 'string' ? code : String(error) }
    }
  )
  return run
}

/** A made-up Shared Car's trip: who logged it (`'me'`, or a name in `people`). */
type LocalCarTrip = {
  by: string
  distanceMiles: number
  /** `YYYY-MM-DD`; today when absent. */
  date?: string
  note?: string
}

/**
 * A made-up Shared Car on this device only (`addLocalCar`): the User as `me`,
 * everyone in `people` by name, `owner` as the one who shared it (the User when
 * absent), and `trips`, newest last.
 */
function addLocalCar({
  name,
  me = 'Me',
  people = [],
  owner,
  trips = [],
}: {
  name: string
  me?: string
  people?: string[]
  owner?: string
  trips?: LocalCarTrip[]
}): string {
  const spaceId = `local-${Crypto.randomUUID()}`
  const now = Date.now()
  const idOf = (person: string) => {
    if (person === 'me' || person === me) return 'me'
    const index = people.indexOf(person)
    if (index === -1) throw new Error(`${person} isn't in people`)
    return `person-${index}`
  }
  const members: SharedCarMember[] = [me, ...people].map((person, index) => ({
    memberId: idOf(person),
    name: person,
    tag: memberTag(spaceId, `local-${idOf(person)}`),
    joinedAt: now + index,
  }))
  const vehicleId = Crypto.randomUUID()
  useSharedCars.getState().saveSharedCar(
    emptySharedCar(spaceId, {
      myMemberId: 'me',
      ownerId: owner === undefined ? 'me' : idOf(owner),
      epoch: 1,
      seq: 1,
      lastSyncedAt: now,
      members,
      memberRecords: members,
      // Made up, like the car: its space isn't on the server, so no key is
      // ever wrapped to anyone on it.
      spaceMembers: members.map(({ memberId, joinedAt }) => ({
        memberId,
        dhPub: '',
        joinedAt,
      })),
      hadOthers: people.length > 0,
      vehicles: [{ id: vehicleId, name, createdAt: now, updatedAt: now }],
      trips: trips.map(
        (trip, index): Trip => ({
          id: Crypto.randomUUID(),
          vehicleId,
          date: trip.date ?? toDateKey(now),
          distanceMiles: trip.distanceMiles,
          ...(trip.note ? { note: trip.note } : {}),
          loggedBy: idOf(trip.by),
          createdAt: now + index,
          updatedAt: now + index,
        })
      ),
    })
  )
  return spaceId
}

/**
 * Shared Cars (ADR 0037) for the verify harness, on the app's own engine.
 * `state()` reads this device's cars synchronously, without keys or tokens;
 * every other call returns its promise and puts the result in `last()`.
 *
 * Two devices: `shareCar(vehicleId)` here, `createInvite(spaceId, { name,
 * inboxId })` (the other device's `__WW_DEV__.stores.buddies` has its
 * `registeredInboxId`), then `joinCar(invite)` there.
 */
export const sharedCarsHarness = {
  state: () => {
    const { cars, memberships, seeding, pendingEnds, joining } =
      useSharedCars.getState()
    const session = useSharedCarsSession.getState()
    return {
      running: session.running,
      suspended: session.suspended,
      disabled: session.disabled,
      coolingDownUntil: sharedCarsEngine.coolingDownUntil(),
      memberships,
      pendingEnds,
      joining: Object.values(joining).map((j) => ({
        spaceId: j.spaceId,
        epoch: j.epoch,
        startedAt: j.startedAt,
      })),
      seeding: Object.values(seeding).map((s) => ({
        spaceId: s.spaceId,
        vehicleId: s.vehicleId,
        created: s.created,
        landed: Object.keys(s.landed).length,
        seq: s.seq,
      })),
      cars: Object.values(cars).map((car) => ({
        spaceId: car.spaceId,
        name: car.vehicles[0]?.name ?? null,
        myMemberId: car.myMemberId,
        ownerId: car.ownerId,
        isOwner: car.ownerId === car.myMemberId,
        epoch: car.epoch,
        seq: car.seq,
        rekeyNeeded: car.rekeyNeeded,
        members: car.members.map((m) => ({
          memberId: m.memberId,
          name: m.name,
          joinedAt: m.joinedAt,
        })),
        unnamedMembers: car.unnamedMembers.length,
        invites: car.invites.map((i) => ({
          inviteId: i.inviteId,
          name: i.name,
          invitedBy: i.invitedBy,
          expiresAt: i.expiresAt,
        })),
        setups: car.vehicleSetups.length,
        fuels: car.fuels.length,
        trips: car.trips.length,
        pendingPuts: car.pendingPuts.length,
        sealedRecords: car.sealedRecords.length,
        unreadRecords: car.unreadRecords.length,
        keyChain: car.keyChain.length,
        lastSyncedAt: car.lastSyncedAt ?? null,
        status: session.cars[car.spaceId] ?? null,
      })),
    }
  },
  /** Shares one of the User's own cars (resumes one that stopped part-way). */
  shareCar: (vehicleId: string) =>
    tracked(() => sharedCarsEngine.shareCar(vehicleId)),
  /**
   * Invites a person: `tag` as `memberTag` makes it, or their Buddies `inboxId`
   * to make it here. Resolves the `car.invite` payload `joinCar` takes on their
   * device.
   */
  createInvite: (
    spaceId: string,
    invitee: { name: string; tag?: string; inboxId?: string }
  ) =>
    tracked(() =>
      sharedCarsEngine.createInvite(spaceId, {
        name: invitee.name,
        tag: invitee.tag ?? memberTag(spaceId, invitee.inboxId ?? ''),
      })
    ),
  cancelInvite: (spaceId: string, inviteId: string) =>
    tracked(() => sharedCarsEngine.cancelInvite(spaceId, inviteId)),
  /** The invitee declined: their `tag`, or their Buddies `inboxId` to make it. */
  declineInvite: (
    spaceId: string,
    inviteId: string,
    invitee: { tag?: string; inboxId?: string }
  ) =>
    tracked(() =>
      sharedCarsEngine.declineInvite(
        spaceId,
        inviteId,
        invitee.tag ?? memberTag(spaceId, invitee.inboxId ?? '')
      )
    ),
  joinCar: (invite: CarInvitePayload) =>
    tracked(() => sharedCarsEngine.joinCar(invite)),
  /** Syncs one car, or every car without `spaceId`. */
  sync: (spaceId?: string) =>
    tracked<unknown>(() =>
      spaceId ? sharedCarsEngine.syncCar(spaceId) : sharedCarsEngine.sync()
    ),
  leaveCar: (spaceId: string) =>
    tracked(() => sharedCarsEngine.leaveCar(spaceId)),
  removeMember: (spaceId: string, memberId: string) =>
    tracked(() => sharedCarsEngine.removeMember(spaceId, memberId)),
  stopSharing: (spaceId: string) =>
    tracked(() => sharedCarsEngine.stopSharing(spaceId)),
  /**
   * Puts a made-up Shared Car on this device only, for screens that only read
   * Shared Cars (Mileage's person filter, Logged By, the car form's People).
   * Returns its `spaceId`. Its space isn't on the server, so a sync ends it:
   * use it while Buddies hasn't started here (no `registeredInboxId`), which
   * keeps the Shared Cars runtime off.
   */
  addLocalCar,
  /** Each car's live signal: status, last `hello`/`changed`, recent events. */
  live: () => useSharedCarsSession.getState().live,
  /** The last call's result, or `{ error: code }`. */
  last: () => last,
}
