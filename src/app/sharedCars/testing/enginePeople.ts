import {
  SpaceError,
  type SpacePutRecord,
  type SpacesClient,
} from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import type { SharedCarsEngineDeps } from '@/app/sharedCars/engine'
import {
  createHeadlessMember,
  type HeadlessMember,
} from '@/app/sharedCars/testing/headlessMember'
import type { Trip } from '@/types/mileage'

/**
 * People on the fake Spaces server for the engine's tests, each a headless
 * member whose calls can be held, failed, or have their answer lost.
 */

/** The client calls a test can step into. */
export type SpaceOp =
  | 'create'
  | 'sync'
  | 'put'
  | 'createInvite'
  | 'deleteInvite'
  | 'join'
  | 'leave'
  | 'removeMember'
  | 'rekey'
  | 'deleteSpace'

export type ClientHooks = {
  /** Runs before each put goes out; throw to fail it. */
  beforePut?: (records: SpacePutRecord[]) => Promise<void> | void
  /** Runs before each sync (with its pages) starts. */
  beforeSync?: () => Promise<void> | void
  /** Runs before each call of any op goes out; throw to fail it. */
  before?: (op: SpaceOp) => Promise<void> | void
  /**
   * Runs once the server answered a call, before the engine hears (for a sync,
   * before each page): hold it to delay the answer.
   */
  after?: (op: SpaceOp) => Promise<void> | void
  /** Rewrites an op's answer before the engine sees it. */
  answer?: (op: SpaceOp, answer: unknown) => unknown
}

export type TestPerson = HeadlessMember & {
  hooks: ClientHooks
  /** The next `op` reaches the server, but its answer never comes back. */
  loseNext: (op: SpaceOp) => void
  /** The client, without hooks: for calls the engine wouldn't make. */
  raw: SpacesClient
}

/**
 * `client`, with `hooks` run around its calls, and `loseNext`: the next call of
 * an op reaches the server, but its answer never comes back.
 */
export function hookClient(client: SpacesClient, hooks: ClientHooks) {
  const lost = new Set<SpaceOp>()
  const stepped =
    <A extends unknown[], R>(op: SpaceOp, call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await hooks.before?.(op)
      const result = await call(...args)
      await hooks.after?.(op)
      if (lost.delete(op)) throw new SpaceError('network')
      return (hooks.answer ? hooks.answer(op, result) : result) as R
    }
  const hooked: SpacesClient = {
    ...client,
    create: stepped('create', client.create),
    sync: stepped('sync', client.sync),
    put: stepped('put', async (auth, records, call) => {
      await hooks.beforePut?.(records)
      return client.put(auth, records, call)
    }),
    syncFrom: async (auth, since, onPage, options) => {
      await hooks.beforeSync?.()
      await hooks.before?.('sync')
      const result = await client.syncFrom(
        auth,
        since,
        async (page) => {
          await hooks.after?.('sync')
          await onPage(page)
        },
        options
      )
      if (lost.delete('sync')) throw new SpaceError('network')
      return result
    },
    createInvite: stepped('createInvite', client.createInvite),
    deleteInvite: stepped('deleteInvite', client.deleteInvite),
    join: stepped('join', client.join),
    leave: stepped('leave', client.leave),
    removeMember: stepped('removeMember', client.removeMember),
    rekey: stepped('rekey', client.rekey),
    deleteSpace: stepped('deleteSpace', client.deleteSpace),
  }
  return { client: hooked, loseNext: (op: SpaceOp) => void lost.add(op) }
}

export function enginePeople(
  server: () => FakeSpacesServer,
  random: (length: number) => Uint8Array
) {
  /** A person (or, with `seed`, another device of one) on the fake server. */
  function person(
    name: string,
    {
      seed = random(32),
      hooks = {},
      now,
      syncNow,
      overrides,
    }: {
      seed?: Uint8Array
      hooks?: ClientHooks
      now?: () => number
      syncNow?: () => number
      overrides?: Partial<SharedCarsEngineDeps>
    } = {}
  ): TestPerson {
    const { client } = fakeSpacesClient(server(), {
      randomBytes: random,
      accountKey: seed,
    })
    const { client: hooked, loseNext } = hookClient(client, hooks)
    return Object.assign(
      createHeadlessMember({
        name,
        client: hooked,
        randomBytes: random,
        seed,
        now,
        syncNow,
        overrides,
      }),
      { hooks, loseNext, raw: client }
    )
  }

  /** Puts one of the User's own cars, with a setup, fuel, price and trips. */
  function ownCar(member: HeadlessMember, trips = 2) {
    member.savePersonal('vehicles', {
      id: 'car-1',
      name: 'Mazda',
      createdAt: 1,
    })
    member.savePersonal('fuels', {
      id: 'fuel-1',
      name: 'Gasoline',
      createdAt: 1,
    })
    member.savePersonal('fuelPrices', {
      id: 'price-1',
      fuelId: 'fuel-1',
      effectiveFrom: '2026-01-01',
      pricePerGallon: 3.2,
    })
    member.savePersonal('vehicleSetups', {
      id: 'setup-1',
      vehicleId: 'car-1',
      effectiveFrom: '2026-01-01',
      fuelId: 'fuel-1',
      milesPerGallon: 30,
    })
    const made = Array.from({ length: trips }, (_, index) => ({
      id: `trip-${index + 1}`,
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: index + 1,
      createdAt: 1,
    }))
    // A long history goes in at once; saving each would take a while.
    if (trips > 50)
      member.mergePersonal({
        trips: made.map((trip) => ({ ...trip, updatedAt: Date.now() })),
      })
    else for (const trip of made) member.savePersonal('trips', trip)
  }

  const tripOn = (member: HeadlessMember, spaceId: string, id: string): Trip =>
    member.car(spaceId).trips.find((trip) => trip.id === id)!

  const tagOf = (spaceId: string, member: HeadlessMember) =>
    memberTag(spaceId, member.inboxId)

  /** Invites `other` to `spaceId` from `inviter`'s device. */
  const invite = (
    inviter: HeadlessMember,
    spaceId: string,
    other: HeadlessMember
  ) =>
    inviter.engine.createInvite(spaceId, {
      name: other.name,
      tag: tagOf(spaceId, other),
    })

  /** `owner` shares a car and each of `others` joins it. */
  async function sharedCar(owner: HeadlessMember, ...others: HeadlessMember[]) {
    ownCar(owner)
    const { spaceId } = await owner.engine.shareCar('car-1')
    for (const other of others)
      await other.engine.joinCar(await invite(owner, spaceId, other))
    await owner.engine.syncCar(spaceId)
    return spaceId
  }

  const storedIds = (spaceId: string) => [
    ...(server().spaces.get(spaceId)?.records.keys() ?? []),
  ]

  return { person, ownCar, tripOn, tagOf, invite, sharedCar, storedIds }
}
