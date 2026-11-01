import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpaceError } from '@/lib/sharedSpaces/client'
import { copyRecordId } from '@/lib/sharedSpaces/crypto'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { type SharedCarEnded, SharedCarsError } from '@/app/sharedCars/engine'
import {
  type ClientHooks,
  enginePeople,
} from '@/app/sharedCars/testing/enginePeople'
import type { HeadlessMember } from '@/app/sharedCars/testing/headlessMember'
import { runSharedCarLifecycle } from '@/app/sharedCars/testing/lifecycleScenario'
import { deleteAllMileage } from '@/features/mileage/lib/deleteAllMileage'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let server: FakeSpacesServer

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  server = createFakeSpacesServer({ now: Date.now })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const { person, ownCar, tripOn, tagOf, sharedCar, storedIds } = enginePeople(
  () => server,
  random
)

describe('sharing a car', () => {
  it('seeds every record, then moves the car out of the User’s own store', async () => {
    const anna = person('Anna')
    ownCar(anna, 3)
    const { spaceId } = await anna.engine.shareCar('car-1')

    const car = anna.car(spaceId)
    expect(car.vehicles.map((v) => v.id)).toEqual(['car-1'])
    expect(car.trips.map((t) => t.loggedBy)).toEqual([
      car.myMemberId,
      car.myMemberId,
      car.myMemberId,
    ])

    const [fuel] = car.fuels
    expect(fuel.id).not.toBe('fuel-1')
    expect(car.vehicleSetups[0].fuelId).toBe(fuel.id)
    expect(car.fuelPrices[0].fuelId).toBe(fuel.id)
    expect(car.pendingPuts).toEqual([])
    expect(car.members.map((m) => m.name)).toEqual(['Anna'])

    const personal = anna.personal()
    expect(personal.vehicles).toEqual([])
    expect(personal.trips).toEqual([])
    expect(personal.vehicleSetups).toEqual([])
    expect(personal.fuels.map((f) => f.id)).toEqual(['fuel-1'])
    expect(personal.deletedMileageRecords.map((t) => t.id)).toEqual(
      expect.arrayContaining(['car-1', 'setup-1', 'trip-1', 'trip-2', 'trip-3'])
    )

    expect(storedIds(spaceId)).toHaveLength(8)
    expect(anna.store.getState().memberships.cars[spaceId]).toBeDefined()
    expect(anna.store.getState().seeding).toEqual({})
    expect(anna.outcomes).toContainEqual({ type: 'shared', resumed: false })
  })

  it('resumes a share that stopped part-way, putting only what hadn’t landed', async () => {
    let puts = 0
    let failing = true
    const sent: string[] = []
    const anna = person('Anna', {
      hooks: {
        beforePut: (records) => {
          puts += 1
          if (failing && puts === 2) throw new SpaceError('network')
          sent.push(...records.map((r) => r.recordId))
        },
      },
    })
    ownCar(anna, 150)
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    const [seeding] = Object.values(anna.store.getState().seeding)
    expect(Object.keys(seeding.landed)).toHaveLength(100)
    expect(anna.store.getState().cars).toEqual({})
    expect(anna.personal().trips).toHaveLength(150)

    failing = false
    sent.length = 0
    await anna.engine.sync()
    const car = anna.car(seeding.spaceId)
    expect(car.trips).toHaveLength(150)
    expect(storedIds(seeding.spaceId)).toHaveLength(155)
    expect(sent).toHaveLength(55)
    expect(anna.personal().trips).toEqual([])
    expect(anna.outcomes).toContainEqual({ type: 'shared', resumed: true })
  })

  it('deletes on the car a record deleted while it was seeding', async () => {
    const anna = person('Anna')
    let first = true
    anna.hooks.beforePut = () => {
      if (!first) return
      first = false

      const { trips, deletedMileageRecords } = anna.personal()
      anna.personal().trips = trips.filter((t) => t.id !== 'trip-1')
      deletedMileageRecords.push({ id: 'trip-1', deletedAt: Date.now() + 5 })
    }
    ownCar(anna, 2)
    const { spaceId } = await anna.engine.shareCar('car-1')
    expect(anna.car(spaceId).trips.map((t) => t.id)).toEqual(['trip-2'])
    expect(server.spaces.get(spaceId)!.records.get('trip-1')!.deleted).toBe(
      true
    )
  })

  it('refuses a car that isn’t the User’s own', async () => {
    const anna = person('Anna')
    await expect(anna.engine.shareCar('nope')).rejects.toBeInstanceOf(
      SharedCarsError
    )
  })
})

describe('inviting and joining', () => {
  it('sends whole milliseconds when the synced clock has fractions, as a device’s does', async () => {
    const syncNow = () => Date.now() + 0.375
    const anna = person('Anna', { syncNow })
    const joe = person('Joe', { syncNow })
    ownCar(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const invite = await anna.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: tagOf(spaceId, joe),
    })
    expect(Number.isSafeInteger(invite.expiresAt)).toBe(true)
    await joe.engine.joinCar(invite)
    expect(joe.car(spaceId).members.map((m) => m.name)).toEqual(['Anna', 'Joe'])
    for (const member of [anna, joe]) {
      const { at } = member.store.getState().memberships.cars[spaceId]
      expect(Number.isSafeInteger(at)).toBe(true)
    }
    await joe.engine.leaveCar(spaceId)
    const left = joe.store.getState().memberships.leftCars[spaceId]
    expect(Number.isSafeInteger(left)).toBe(true)
  })

  it('invites with exactly what joining needs, and closes the invite once they’ve joined', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    ownCar(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const invite = await anna.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: tagOf(spaceId, joe),
    })
    expect(Object.keys(invite).sort()).toEqual([
      'epoch',
      'expiresAt',
      'inviteId',
      'joinSecret',
      'key',
      'name',
      'people',
      'spaceId',
    ])
    expect(invite).toMatchObject({
      spaceId,
      epoch: 1,
      name: 'Mazda',
      people: 1,
    })
    expect(anna.car(spaceId).invites.map((i) => i.name)).toEqual(['Joe'])

    await joe.engine.joinCar(invite)
    const joined = joe.car(spaceId)
    expect(joined.trips).toHaveLength(2)
    expect(joined.members.map((m) => m.name)).toEqual(['Anna', 'Joe'])
    expect(joe.store.getState().memberships.cars[spaceId]).toBeDefined()
    expect(joe.outcomes).toContainEqual({ type: 'joined', people: 2 })

    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna',
      'Joe',
    ])
    expect(anna.car(spaceId).invites).toEqual([])
    expect(anna.car(spaceId).inviteRecords).toEqual([])
    expect(
      server.spaces.get(spaceId)!.records.get(`i.${invite.inviteId}`)!.deleted
    ).toBe(true)
  })

  it('cancels and declines invitations', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const first = await anna.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: 'T'.repeat(22),
    })
    const second = await anna.engine.createInvite(spaceId, {
      name: 'Cal',
      tag: 'U'.repeat(22),
    })
    await anna.engine.cancelInvite(spaceId, first.inviteId)
    await anna.engine.declineInvite(spaceId, second.inviteId, 'U'.repeat(22))
    expect(anna.car(spaceId).invites).toEqual([])
    expect(anna.car(spaceId).sentInvites).toEqual({})
    expect(server.spaces.get(spaceId)!.invites.size).toBe(0)
  })

  it('closes an invitation the server didn’t hear about on a later sync', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const invite = await anna.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: 'T'.repeat(22),
    })
    server.refuseNext('invite/delete', 400, 'bad_request')
    expect(await anna.engine.cancelInvite(spaceId, invite.inviteId)).toEqual({
      pending: true,
    })
    expect(anna.store.getState().closingInvites[spaceId]).toHaveProperty(
      invite.inviteId
    )
    expect(server.spaces.get(spaceId)!.invites.size).toBe(1)

    await anna.engine.sync()
    expect(anna.store.getState().closingInvites).toEqual({})
    expect(anna.car(spaceId).invites).toEqual([])
    expect(server.spaces.get(spaceId)!.invites.size).toBe(0)
  })

  it('keeps an invitation a decline isn’t from', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const invite = await anna.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: 'T'.repeat(22),
    })

    expect(
      await anna.engine.declineInvite(spaceId, invite.inviteId, 'U'.repeat(22))
    ).toEqual({ pending: false })
    expect(anna.car(spaceId).invites.map((i) => i.inviteId)).toEqual([
      invite.inviteId,
    ])
    expect(server.spaces.get(spaceId)!.invites.size).toBe(1)
    expect(anna.store.getState().closingInvites).toEqual({})
  })

  it('doesn’t send again an invitation being canceled when a rekey closes it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    const invite = await anna.engine.createInvite(spaceId, {
      name: 'Dee',
      tag: 'D'.repeat(22),
    })
    server.refuseNext('invite/delete', 400, 'bad_request')
    await anna.engine.cancelInvite(spaceId, invite.inviteId)
    await anna.engine.removeMember(spaceId, cal.car(spaceId).myMemberId)
    expect(anna.car(spaceId).epoch).toBe(2)
    expect(anna.reissued).toEqual([])
    expect(anna.car(spaceId).invites).toEqual([])
    expect(anna.store.getState().closingInvites).toEqual({})
  })

  it('refuses an invitation that isn’t one', async () => {
    const joe = person('Joe')
    await expect(
      joe.engine.joinCar({ spaceId: 'x' } as never)
    ).rejects.toMatchObject({
      code: 'invalid_invite',
    })
  })
})

describe('syncing', () => {
  it('keeps the newest edit on every device', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Joe' })
    await pause(5)
    anna.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(anna, spaceId, 'trip-1'), note: 'Anna' })
    await joe.engine.syncCar(spaceId)
    await anna.engine.syncCar(spaceId)
    await joe.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Anna')
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Anna')
    expect(tripOn(joe, spaceId, 'trip-1').editedBy).toBe(
      anna.car(spaceId).myMemberId
    )
    expect(anna.car(spaceId).pendingPuts).toEqual([])
    expect(joe.car(spaceId).pendingPuts).toEqual([])
  })

  it('settles a put the server already held a newer version of', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Joe' })
    let raced = false
    joe.hooks.beforePut = async () => {
      if (raced) return
      raced = true

      await pause(5)
      anna.store
        .getState()
        .saveTrip(spaceId, { ...tripOn(anna, spaceId, 'trip-1'), note: 'Anna' })
      await anna.engine.syncCar(spaceId)
    }
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    await joe.engine.syncCar(spaceId)
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Anna')
  })

  it('keeps a change made offline pending until a put stores it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    let offline = true
    joe.hooks.beforePut = () => {
      if (offline) throw new SpaceError('network')
    }
    joe.store.getState().deleteTrip(spaceId, 'trip-2')
    await expect(joe.engine.syncCar(spaceId)).rejects.toMatchObject({
      code: 'network',
    })
    expect(joe.car(spaceId).pendingPuts).toEqual(['trip-2'])
    offline = false
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).trips.map((t) => t.id)).toEqual(['trip-1'])
  })

  it('rewrites the User’s member record when their name changes', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    joe.rename('Joseph')
    await joe.engine.syncCar(spaceId)
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna',
      'Joseph',
    ])
  })

  it('shares one sync among callers, and skips one a sync already covered', async () => {
    const anna = person('Anna')
    const spaceId = await sharedCar(anna)
    let release = () => {}
    const started = new Promise<void>((resolve) => {
      anna.hooks.beforeSync = () => {
        anna.hooks.beforeSync = undefined
        resolve()
        return new Promise<void>((done) => {
          release = done
        })
      }
    })
    server.state.log.length = 0
    const running = anna.engine.syncCar(spaceId)
    await started

    const later = [anna.engine.syncCar(spaceId), anna.engine.syncCar(spaceId)]
    expect(later[0]).toBe(later[1])
    release()
    await Promise.all([running, ...later])
    expect(server.state.log.filter((op) => op === 'sync')).toHaveLength(2)
    const seq = anna.car(spaceId).seq
    expect(
      await anna.engine.syncCar(spaceId, { automatic: true, minSeq: seq })
    ).toBe('skipped')
  })
})

describe('rekeying', () => {
  it('rekeys after a removal, and the removed person keeps a copy', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await joe.engine.syncCar(spaceId)
    await cal.engine.syncCar(spaceId)

    await anna.engine.removeMember(spaceId, cal.car(spaceId).myMemberId)
    expect(server.spaces.get(spaceId)!.epoch).toBe(2)
    expect(anna.car(spaceId).epoch).toBe(2)
    expect(storedIds(spaceId)).toContain('k.2')
    expect(anna.outcomes).toContainEqual({ type: 'rekeyed' })

    expect(await cal.engine.syncCar(spaceId)).toBe('ended')
    expect(cal.store.getState().cars).toEqual({})
    expect(cal.store.getState().memberships.leftCars[spaceId]).toBeDefined()
    expect(cal.personal().trips).toHaveLength(2)
    expect(cal.outcomes).toContainEqual({ type: 'ended', reason: 'gone' })
    expect(cal.keyring.epochs(spaceId)).toEqual([])
  })

  it('seals again under the new key after a stale_key', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await joe.engine.syncCar(spaceId)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Joe' })
    let rekeyed = false
    joe.hooks.beforePut = async () => {
      if (rekeyed) return
      rekeyed = true

      await anna.engine.removeMember(spaceId, cal.car(spaceId).myMemberId)
    }
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).epoch).toBe(2)
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    expect(server.spaces.get(spaceId)!.records.get('trip-1')!.epoch).toBe(2)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Joe')
  })

  it('lets someone who joins after a rekey read the history through the key chain', async () => {
    const bea = person('Bea')
    const cal = person('Cal')
    const joe = person('Joe')
    const dee = person('Dee')
    const spaceId = await sharedCar(bea, cal, joe)
    await bea.engine.removeMember(spaceId, joe.car(spaceId).myMemberId)
    expect(bea.car(spaceId).epoch).toBe(2)

    expect(server.spaces.get(spaceId)!.records.get('trip-1')!.epoch).toBe(1)
    const invite = await bea.engine.createInvite(spaceId, {
      name: 'Dee',
      tag: tagOf(spaceId, dee),
    })
    expect(invite.epoch).toBe(2)
    await dee.engine.joinCar(invite)
    expect(dee.car(spaceId).trips).toHaveLength(2)
    expect(dee.keyring.epochs(spaceId)).toEqual([2, 1])
    expect(dee.car(spaceId).sealedRecords).toEqual([])
  })

  it('sends a rekey’s closed invitation again, with the new key', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe)
    const first = await anna.engine.createInvite(spaceId, {
      name: 'Dee',
      tag: tagOf(spaceId, dee),
    })
    await anna.engine.removeMember(spaceId, joe.car(spaceId).myMemberId)

    expect(anna.reissued).toHaveLength(1)
    const [{ previousInviteId, invite }] = anna.reissued
    expect(previousInviteId).toBe(first.inviteId)
    expect(invite.epoch).toBe(2)

    const open = [...server.spaces.get(spaceId)!.invites].filter(
      ([, i]) => !i.joined
    )
    expect(open.map(([id]) => id)).toEqual([invite.inviteId])
    await expect(dee.engine.joinCar(first)).rejects.toMatchObject({
      code: 'not_found',
    })
    await dee.engine.joinCar(invite)
    expect(dee.car(spaceId).trips).toHaveLength(2)
  })
})

describe('endings', () => {
  it('hands the car to whoever joined first, and the last one left gets it back', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await joe.engine.syncCar(spaceId)

    expect(await anna.engine.leaveCar(spaceId)).toEqual({ pending: false })
    expect(anna.personal().trips).toHaveLength(2)
    expect(anna.outcomes).toContainEqual({ type: 'ended', reason: 'left' })
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).ownerId).toBe(joe.car(spaceId).myMemberId)

    await cal.engine.leaveCar(spaceId)
    expect(await joe.engine.syncCar(spaceId)).toBe('ended')
    expect(server.spaces.has(spaceId)).toBe(false)
    expect(joe.personal().vehicles).toHaveLength(1)
    expect(joe.outcomes).toContainEqual({
      type: 'ended',
      reason: 'last_member',
    })
  })

  it('stopping sharing ends the car for everyone, each with a copy', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    await joe.engine.syncCar(spaceId)
    await expect(joe.engine.stopSharing(spaceId)).rejects.toMatchObject({
      code: 'not_owner',
    })
    await anna.engine.stopSharing(spaceId)
    expect(server.spaces.has(spaceId)).toBe(false)
    expect(anna.personal().vehicles).toHaveLength(1)
    expect(await joe.engine.syncCar(spaceId)).toBe('ended')
    expect(joe.personal().trips).toHaveLength(2)
  })

  it('makes the same personal copy on every device of a removed User', async () => {
    const anna = person('Anna')
    const seed = random(32)
    const phone = person('Joe', { seed })
    const tablet = person('Joe', { seed })
    const spaceId = await sharedCar(anna, phone)
    phone.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(phone, spaceId, 'trip-1'), note: 'Joe' })
    await phone.engine.syncCar(spaceId)

    expect(await tablet.engine.addCarFromRoster(spaceId, Date.now())).toBe(
      'synced'
    )
    expect(tablet.car(spaceId).myMemberId).toBe(phone.car(spaceId).myMemberId)
    const joinedAt = phone
      .car(spaceId)
      .spaceMembers.find(
        (m) => m.memberId === phone.car(spaceId).myMemberId
      )!.joinedAt

    await anna.engine.removeMember(spaceId, phone.car(spaceId).myMemberId)
    expect(await phone.engine.syncCar(spaceId)).toBe('ended')
    expect(await tablet.engine.syncCar(spaceId)).toBe('ended')
    const byId = (copy: ReturnType<HeadlessMember['personal']>) =>
      Object.fromEntries(
        Object.entries(copy).map(([key, records]) => [
          key,
          [...(records as { id: string }[])].sort((a, b) =>
            a.id.localeCompare(b.id)
          ),
        ])
      )
    expect(byId(tablet.personal())).toEqual(byId(phone.personal()))
    expect(
      phone
        .personal()
        .trips.map((t) => t.id)
        .sort()
    ).toEqual(
      [
        copyRecordId(spaceId, joinedAt, 'trip-1'),
        copyRecordId(spaceId, joinedAt, 'trip-2'),
      ].sort()
    )
    const [copy] = phone.personal().vehicles
    expect(phone.personal().trips.every((t) => t.vehicleId === copy.id)).toBe(
      true
    )
    expect(phone.personal().trips.some((t) => t.loggedBy || t.editedBy)).toBe(
      false
    )
  })

  it('ends the car here when another of the User’s devices left it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const joinedAt = joe.store.getState().memberships.cars[spaceId].at
    await joe.engine.dropCarFromRoster(spaceId, joinedAt - 1)
    expect(joe.car(spaceId)).toBeDefined()
    await joe.engine.dropCarFromRoster(spaceId, joinedAt + 1)
    expect(joe.car(spaceId)).toBeUndefined()
    expect(joe.personal().trips).toHaveLength(2)
    expect(joe.outcomes).toContainEqual({
      type: 'ended',
      reason: 'left_elsewhere',
    })
  })

  it('retries a leave the server didn’t hear', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    server.refuseNext('leave', 400, 'bad_request')
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    expect(joe.store.getState().pendingEnds).toEqual({ [spaceId]: 'leave' })
    await joe.engine.sync()
    expect(joe.store.getState().pendingEnds).toEqual({})
    expect(server.spaces.get(spaceId)!.members.size).toBe(1)
  })
})

describe('telling the User a car ended', () => {
  it('names the car once, when they were removed', async () => {
    const ended: SharedCarEnded[] = []
    const anna = person('Anna')
    const joe = person('Joe', {
      overrides: { onCarEnded: (end) => ended.push(end) },
    })
    const spaceId = await sharedCar(anna, joe)
    await joe.engine.syncCar(spaceId)

    await anna.engine.removeMember(spaceId, joe.car(spaceId).myMemberId)
    expect(await joe.engine.syncCar(spaceId)).toBe('ended')
    await joe.engine.sync()
    expect(ended).toEqual([{ spaceId, name: 'Mazda', reason: 'gone' }])
  })

  it('says how it ended when the User left', async () => {
    const ended: SharedCarEnded[] = []
    const anna = person('Anna', {
      overrides: { onCarEnded: (end) => ended.push(end) },
    })
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    await anna.engine.leaveCar(spaceId)
    expect(ended).toEqual([{ spaceId, name: 'Mazda', reason: 'left' }])
  })
})

describe('Delete All Mileage Data', () => {
  it('deletes the User’s own cars and leaves each Shared Car, keeping its copy', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    anna.savePersonal('vehicles', { id: 'car-2', name: 'Civic', createdAt: 2 })
    anna.savePersonal('trips', {
      id: 'civic-trip',
      vehicleId: 'car-2',
      date: '2026-02-04',
      distanceMiles: 7,
      createdAt: 2,
    })

    await deleteAllMileage({
      deleteOwn: anna.deleteAllPersonal,
      leaveSharedCars: () => anna.engine.leaveAll(),
      hasSharedCars: true,
    })

    expect(anna.car(spaceId)).toBeUndefined()
    const [copy] = anna.personal().vehicles
    expect(anna.personal().vehicles).toHaveLength(1)
    expect(copy.name).toBe('Mazda')
    expect(anna.personal().trips).toHaveLength(2)
    expect(anna.personal().trips.every((t) => t.vehicleId === copy.id)).toBe(
      true
    )

    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.car(spaceId).trips).toHaveLength(2)
    expect(server.spaces.get(spaceId)!.members.size).toBe(2)
  })
})

describe('the User’s profile on a car', () => {
  it('puts a photo from the device it changed on, without two devices taking turns', async () => {
    const seed = random(32)
    const memberPuts: string[] = []
    const hooks: ClientHooks = {
      beforePut: (records) => {
        memberPuts.push(
          ...records
            .filter((r) => r.recordId.startsWith('m.'))
            .map((r) => r.recordId)
        )
      },
    }
    const avatars = { phone: '🚗', tablet: '🚙' }
    const device = (name: keyof typeof avatars) =>
      person('Anna', {
        seed,
        hooks,
        overrides: {
          profile: () => ({
            name: 'Anna',
            inboxId: 'I'.repeat(22),
            avatar: avatars[name],
          }),
        },
      })
    const phone = device('phone')
    const tablet = device('tablet')
    const spaceId = await sharedCar(phone)
    await tablet.engine.addCarFromRoster(spaceId, Date.now())
    const avatarOn = (member: HeadlessMember) =>
      member.car(spaceId).members[0].avatar

    await phone.engine.syncCar(spaceId)
    expect(avatarOn(phone)).toBe('🚙')
    const settled = memberPuts.length
    for (let n = 0; n < 3; n++) {
      await phone.engine.syncCar(spaceId)
      await tablet.engine.syncCar(spaceId)
    }
    expect(memberPuts).toHaveLength(settled)
    expect(avatarOn(phone)).toBe('🚙')

    avatars.phone = '🛻'
    await phone.engine.syncCar(spaceId)
    await tablet.engine.syncCar(spaceId)
    await phone.engine.syncCar(spaceId)
    expect(memberPuts).toHaveLength(settled + 1)
    expect(avatarOn(tablet)).toBe('🛻')
    expect(avatarOn(phone)).toBe('🛻')
  })
})

describe('letting go on this device', () => {
  it('stops a share still seeding, keeping the car the User’s own', async () => {
    let failing = true
    const anna = person('Anna', {
      hooks: {
        beforePut: () => {
          if (failing) throw new SpaceError('network')
        },
      },
    })
    ownCar(anna)
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    const [{ spaceId }] = Object.values(anna.store.getState().seeding)
    failing = false
    await anna.engine.abandonShares()
    expect(anna.store.getState().seeding).toEqual({})
    expect(server.spaces.has(spaceId)).toBe(false)
    expect(anna.personal().vehicles.map((v) => v.id)).toEqual(['car-1'])
    expect(anna.personal().trips).toHaveLength(2)
  })

  it('forgets every car here, with no copy, and picks them up again from the roster', async () => {
    const anna = person('Anna')
    const seed = random(32)
    const joe = person('Joe', { seed })
    const spaceId = await sharedCar(anna, joe)
    joe.engine.forgetAll()
    expect(joe.store.getState().cars).toEqual({})
    expect(joe.store.getState().memberships).toEqual({ cars: {}, leftCars: {} })
    expect(joe.keyring.epochs(spaceId)).toEqual([])
    expect(joe.personal().trips).toEqual([])

    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna',
      'Joe',
    ])

    expect(await joe.engine.addCarFromRoster(spaceId, Date.now())).toBe(
      'synced'
    )
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })

  it('finishes the ends it owes before letting go', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    server.refuseNext('leave', 400, 'bad_request')
    await joe.engine.leaveCar(spaceId)
    expect(await joe.engine.finishPendingEnds()).toEqual({ pending: 0 })
    expect(server.spaces.get(spaceId)!.members.size).toBe(1)
  })
})

describe('server switches', () => {
  it('keeps changes pending while the account is suspended, and says so', async () => {
    let clock = Date.now()
    const anna = person('Anna')
    const joe = person('Joe', { now: () => clock })
    const spaceId = await sharedCar(anna, joe)
    server.suspend(true)
    joe.store.getState().deleteTrip(spaceId, 'trip-1')
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.status.getState().suspended).toBe(true)
    expect(joe.car(spaceId).pendingPuts).toEqual(['trip-1'])

    server.suspend(false)
    await joe.engine.syncCar(spaceId)

    expect(joe.car(spaceId).pendingPuts).toEqual(['trip-1'])
    clock += 61_000
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    expect(joe.status.getState().suspended).toBe(false)
  })

  it('backs automatic syncs off while the kill switch is on', async () => {
    const anna = person('Anna')
    const spaceId = await sharedCar(anna)
    server.state.enabled = false

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const refused = expect(
      anna.engine.syncCar(spaceId, { automatic: true })
    ).rejects.toMatchObject({ code: 'disabled' })
    await vi.advanceTimersByTimeAsync(31_000)
    await refused
    vi.useRealTimers()
    expect(anna.status.getState().disabled).toBe(true)
    expect(await anna.engine.syncCar(spaceId, { automatic: true })).toBe(
      'skipped'
    )
    expect(anna.engine.coolingDownUntil()).toBeGreaterThan(
      Date.now() + 14 * 60_000
    )
    server.state.enabled = true

    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(anna.status.getState().disabled).toBe(false)
  })
})

describe('a car’s whole life', () => {
  it('runs from sharing to the last one left, as the interop check does', () =>
    runSharedCarLifecycle({
      person: (name) => person(name),
      device: (of) => person(of.name, { seed: of.seed }),
      spaceGone: async (spaceId) => !server.spaces.has(spaceId),
    }))
})
