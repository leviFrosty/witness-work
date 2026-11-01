import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toB64u, utf8 } from '@/lib/bytes'
import { mergeMileageRecords } from '@/lib/mileage/records'
import { mileageRecordData, withPending } from '@/lib/mileage/sharedCar'
import { SpaceError } from '@/lib/sharedSpaces/client'
import {
  deriveRecordKey,
  deriveSpaceMember,
  sealXChaCha,
} from '@/lib/sharedSpaces/crypto'
import {
  keysRecordData,
  openRecord,
  RECORD_PLAINTEXT_MAX_BYTES,
  recordAad,
  sealRecord,
} from '@/lib/sharedSpaces/records'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import {
  enginePeople,
  type SpaceOp,
  type TestPerson,
} from '@/app/sharedCars/testing/enginePeople'
import type { Trip } from '@/types/mileage'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const DAY = 24 * 60 * 60 * 1000

let server: FakeSpacesServer

let serverAhead = 0

const newServer = (options: { pageRecords?: number } = {}) =>
  createFakeSpacesServer({ now: () => Date.now() + serverAhead, ...options })

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  serverAhead = 0
  server = newServer()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const { person, ownCar, tripOn, invite, sharedCar, storedIds } = enginePeople(
  () => server,
  random
)

function authOf(who: TestPerson, spaceId: string) {
  const member = deriveSpaceMember(who.seed, spaceId)
  return { spaceId, memberId: member.memberId, token: member.token }
}

const memberIdOf = (who: TestPerson, spaceId: string) =>
  deriveSpaceMember(who.seed, spaceId).memberId

function stored(spaceId: string, recordId: string, key: Uint8Array) {
  const record = server.spaces.get(spaceId)!.records.get(recordId)!
  return {
    ...record,
    plaintext: openRecord(
      key,
      {
        spaceId,
        epoch: record.epoch,
        recordId,
        deleted: record.deleted,
        stamp: record.stamp,
      },
      record.blob
    ),
  }
}

function offline(who: TestPerson, ...ops: SpaceOp[]) {
  who.hooks.before = (op) => {
    if (ops.length === 0 || ops.includes(op)) throw new SpaceError('network')
  }
  return () => {
    who.hooks.before = undefined
  }
}

function hold(who: TestPerson, op: SpaceOp) {
  let release = () => {}
  let reach = () => {}
  const reached = new Promise<void>((resolve) => {
    reach = resolve
  })
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = false
  who.hooks.before = async (called) => {
    if (called !== op || held) return
    held = true
    reach()
    await released
  }
  return { reached, release }
}

function holdAnswer(who: TestPerson, op: SpaceOp) {
  let release = () => {}
  let reach = () => {}
  const reached = new Promise<void>((resolve) => {
    reach = resolve
  })
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = false
  who.hooks.after = async (called) => {
    if (called !== op || held) return
    held = true
    reach()
    await released
  }
  return { reached, release }
}

const ownTrip = ({ loggedBy: _l, editedBy: _e, ...trip }: Trip): Trip => trip

describe('lost answers', () => {
  it('finishes a share whose create answer was lost, with the same request', async () => {
    const anna = person('Anna')
    ownCar(anna)
    anna.loseNext('create')
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    const [seeding] = Object.values(anna.store.getState().seeding)
    expect(seeding).toMatchObject({ created: false })
    expect(seeding.createWrap).toEqual(expect.any(String))
    server.state.log.length = 0
    await anna.engine.sync()

    expect(server.state.log.filter((op) => op === 'create')).toHaveLength(1)
    const car = anna.car(seeding.spaceId)
    expect(car.trips).toHaveLength(2)
    expect(car.memberRecords[0].joinedAt).toBe(car.spaceMembers[0].joinedAt)
    expect(anna.outcomes).toContainEqual({ type: 'shared', resumed: true })
  })

  it('keeps a share whose create answer was lost through a refusal for now, and finishes it later', async () => {
    const anna = person('Anna')
    ownCar(anna)
    anna.loseNext('create')
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    const [spaceId] = Object.keys(anna.store.getState().seeding)
    expect(server.spaces.has(spaceId)).toBe(true)

    server.refuseNext('create', 429, 'rate_limited', 1)
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'rate_limited',
    })
    expect(anna.store.getState().seeding[spaceId]).toBeDefined()
    expect(server.spaces.has(spaceId)).toBe(true)

    expect(await anna.engine.shareCar('car-1')).toEqual({ spaceId })
    expect(anna.car(spaceId).trips).toHaveLength(2)
    expect(anna.personal().trips).toEqual([])
  })

  it('sends an invitation once more when its answer was lost, and closes one it never heard back about', async () => {
    const anna = person('Anna')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna)
    const open = () =>
      [...server.spaces.get(spaceId)!.invites]
        .filter(([, invite]) => !invite.joined)
        .map(([inviteId]) => inviteId)
    anna.loseNext('createInvite')
    const invitation = await invite(anna, spaceId, dee)
    expect(open()).toEqual([invitation.inviteId])

    let lost = 0
    anna.hooks.after = (op) => {
      if (op === 'createInvite' && lost++ < 2) throw new SpaceError('network')
    }
    await expect(invite(anna, spaceId, person('Eve'))).rejects.toMatchObject({
      code: 'network',
    })
    expect(open()).toHaveLength(2)
    anna.hooks.after = undefined
    await anna.engine.syncCar(spaceId)
    expect(open()).toEqual([invitation.inviteId])
    expect(anna.store.getState().closingInvites).toEqual({})
    await dee.engine.joinCar(invitation)
    expect(dee.car(spaceId).trips).toHaveLength(2)
  })

  it('sends an invitation the server opened even when its record’s put fails', async () => {
    const anna = person('Anna')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna)
    anna.hooks.beforePut = () => {
      throw new SpaceError('rate_limited', 429)
    }
    const invitation = await invite(anna, spaceId, dee)
    const recordId = `i.${invitation.inviteId}`
    expect(anna.car(spaceId).pendingPuts).toContain(recordId)
    expect(storedIds(spaceId)).not.toContain(recordId)

    anna.hooks.beforePut = undefined
    await anna.engine.syncCar(spaceId)
    expect(storedIds(spaceId)).toContain(recordId)
    await dee.engine.joinCar(invitation)
    expect(dee.car(spaceId).trips).toHaveLength(2)
  })

  it('sends a leave it still owes only once the roster was read, which may say the User joined again', async () => {
    let rosterReadAt = 0
    const anna = person('Anna')
    const cal = person('Cal')
    const joe = person('Joe', {
      overrides: { rosterReadAt: () => rosterReadAt },
    })
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    const online = offline(joe, 'leave')
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    online()

    await anna.engine.syncCar(spaceId)
    await joesIpad.engine.joinCar(await invite(anna, spaceId, joesIpad))
    const { at } = joesIpad.store.getState().memberships.cars[spaceId]

    await joe.relaunch()
    server.state.log.length = 0
    await joe.engine.sync()
    expect(joe.store.getState().pendingEnds[spaceId]).toBe('leave')

    await joe.engine.addCarFromRoster(spaceId, at)
    rosterReadAt = Date.now() + 1
    await joe.engine.sync()
    expect(server.state.log).not.toContain('leave')
    expect(joe.store.getState().pendingEnds).toEqual({})
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(true)
  })

  it('sends a leave it still owes once the roster was read and says nothing newer', async () => {
    let rosterReadAt = 0
    const anna = person('Anna')
    const cal = person('Cal')
    const joe = person('Joe', {
      overrides: { rosterReadAt: () => rosterReadAt },
    })
    const spaceId = await sharedCar(anna, joe, cal)
    const online = offline(joe, 'leave')
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    online()
    await joe.relaunch()
    await joe.engine.sync()
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(true)
    rosterReadAt = Date.now() + 1
    await joe.engine.sync()
    expect(joe.store.getState().pendingEnds).toEqual({})
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(false)
  })

  it('confirms a join whose answer was lost on the next sync', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    joe.loseNext('join')
    await expect(joe.engine.joinCar(invitation)).rejects.toMatchObject({
      code: 'network',
    })
    expect(joe.car(spaceId)).toBeUndefined()
    expect(joe.store.getState().joining[spaceId]).toMatchObject({
      inviteId: invitation.inviteId,
      epoch: 1,
    })

    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).unnamedMembers).toEqual([
      { memberId: memberIdOf(joe, spaceId), joinedAt: expect.any(Number) },
    ])

    await joe.engine.sync()
    expect(joe.store.getState().joining).toEqual({})
    expect(joe.car(spaceId).trips).toHaveLength(2)
    expect(joe.store.getState().memberships.cars[spaceId]).toBeDefined()
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna',
      'Joe',
    ])
    expect(anna.car(spaceId).unnamedMembers).toEqual([])
  })

  it('finds an earlier join landed when a retry comes after the invite expired', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    joe.loseNext('join')
    await expect(joe.engine.joinCar(invitation)).rejects.toMatchObject({
      code: 'network',
    })

    serverAhead = 8 * DAY
    await joe.engine.joinCar(invitation)
    expect(joe.car(spaceId).trips).toHaveLength(2)
    expect(joe.store.getState().joining).toEqual({})
  })

  it('lets the owner remove someone whose join never finished', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, cal)
    joe.loseNext('join')
    await expect(
      joe.engine.joinCar(await invite(anna, spaceId, joe))
    ).rejects.toMatchObject({ code: 'network' })

    await anna.engine.syncCar(spaceId)
    const [unnamed] = anna.car(spaceId).unnamedMembers
    expect(unnamed.memberId).toBe(memberIdOf(joe, spaceId))
    await anna.engine.removeMember(spaceId, unnamed.memberId)

    expect(server.spaces.get(spaceId)!.epoch).toBe(2)
    expect(anna.car(spaceId).spaceMembers).toHaveLength(2)
    await cal.engine.syncCar(spaceId)
    expect(cal.keyring.key(spaceId, 2)).toEqual(anna.keyring.key(spaceId, 2))

    expect(anna.reissued).toEqual([])

    await joe.engine.sync()
    expect(joe.store.getState().joining).toEqual({})
    expect(joe.car(spaceId)).toBeUndefined()
    expect(joe.keyring.epochs(spaceId)).toEqual([])
  })

  it('doesn’t send a leave whose answer was lost once the User joined again', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    joe.loseNext('leave')
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    expect(joe.store.getState().pendingEnds[spaceId]).toBe('leave')

    await anna.engine.syncCar(spaceId)
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(joe.store.getState().pendingEnds).toEqual({})
    server.state.log.length = 0
    expect(await joe.engine.finishPendingEnds()).toEqual({ pending: 0 })
    await joe.engine.sync()
    expect(server.state.log).not.toContain('leave')
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).spaceMembers.map((m) => m.memberId)).toContain(
      memberIdOf(joe, spaceId)
    )
  })

  it('counts a join as done when a leave never landed and the User is still on', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    const online = offline(joe, 'sync', 'put', 'leave')
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    online()

    const again = await invite(anna, spaceId, joe)
    await joe.engine.joinCar(again)
    expect(joe.car(spaceId).trips).toHaveLength(2)
    expect(joe.store.getState().pendingEnds).toEqual({})
    await joe.engine.sync()
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(true)
  })

  it('drops a leave the server never heard when the roster brings the car back', async () => {
    const anna = person('Anna')
    const cal = person('Cal')
    const joe = person('Joe')
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    joe.loseNext('leave')
    await joe.engine.leaveCar(spaceId)

    await anna.engine.syncCar(spaceId)
    await joesIpad.engine.joinCar(await invite(anna, spaceId, joesIpad))
    const { at } = joesIpad.store.getState().memberships.cars[spaceId]
    await joe.engine.addCarFromRoster(spaceId, at)
    expect(joe.store.getState().pendingEnds).toEqual({})
    expect(joe.car(spaceId).trips).toHaveLength(2)
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(true)
  })
})

describe('clocks', () => {
  function fastDevice(name: string, ahead: number) {
    const clock = { skew: 0, calibrations: 0 }
    const made = new Set<number>()
    const corrected = new Map<number, number>()
    const syncNow = () => Date.now() + clock.skew
    const correct = (stamp: number) => corrected.get(stamp) ?? stamp

    const stamp = (previous = 0) => {
      const next = Math.max(Math.floor(syncNow()), correct(previous) + 1)
      if (clock.skew !== 0) made.add(next)
      return next
    }
    const who = person(name, {
      syncNow,
      overrides: {
        stamp,
        refreshClock: async () => {
          clock.calibrations += 1
          for (const made_ of made) corrected.set(made_, made_ - clock.skew)
          made.clear()
          clock.skew = 0
        },
        correctStamp: correct,
      },
    })
    return {
      who,
      clock,
      stamp,

      runAhead: () => {
        clock.skew = ahead
      },
    }
  }

  function editTrip(
    who: TestPerson,
    spaceId: string,
    note: string,
    stamp: number
  ) {
    who.store.getState().updateSharedCar(spaceId, (car) => ({
      ...car,
      trips: car.trips.map((trip) =>
        trip.id === 'trip-1' ? { ...trip, note, updatedAt: stamp } : trip
      ),
      pendingPuts: withPending(car.pendingPuts, ['trip-1']),
    }))
  }

  it('calibrates and stamps again when a put is refused for a stamp too far ahead', async () => {
    const anna = person('Anna')
    const fast = fastDevice('Joe', 3 * DAY)
    const joe = fast.who
    const spaceId = await sharedCar(anna, joe)
    fast.runAhead()
    editTrip(joe, spaceId, 'Fast', fast.stamp())
    expect(tripOn(joe, spaceId, 'trip-1').updatedAt).toBeGreaterThan(
      Date.now() + 2 * DAY
    )

    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(fast.clock.calibrations).toBe(1)
    expect(tripOn(joe, spaceId, 'trip-1').updatedAt).toBeLessThan(
      Date.now() + 1000
    )
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    expect(joe.status.getState().cars[spaceId]).toMatchObject({ held: 0 })
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Fast')
  })

  it('holds back what’s still too far ahead, says so, and sends it once the clock gets there', async () => {
    let ahead = 0
    const anna = person('Anna')
    const joe = person('Joe', { syncNow: () => Date.now() + ahead })
    const spaceId = await sharedCar(anna, joe)

    editTrip(joe, spaceId, 'Ahead', Date.now() + 3 * DAY)
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.status.getState().cars[spaceId]).toMatchObject({ held: 1 })
    expect(joe.car(spaceId).pendingPuts).toEqual(['trip-1'])
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBeUndefined()

    ahead = 3 * DAY
    serverAhead = 3 * DAY
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.status.getState().cars[spaceId]).toMatchObject({ held: 0 })
    expect(joe.car(spaceId).pendingPuts).toEqual([])
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Ahead')
  })

  it('opens invitations by the synced clock, whatever the device’s says', async () => {
    const anna = person('Anna', {
      now: () => Date.now() + 2 * DAY,
      syncNow: Date.now,
    })
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    expect(invitation.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY)
    await joe.engine.joinCar(invitation)
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })

  it('calibrates and opens it again when the synced clock was fast too', async () => {
    const fast = fastDevice('Anna', 2 * DAY)
    const anna = fast.who
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    fast.runAhead()
    const invitation = await invite(anna, spaceId, joe)
    expect(fast.clock.calibrations).toBe(1)
    expect(invitation.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY)
    await joe.engine.joinCar(invitation)
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })

  it('notes joins and leaves on the roster by the synced clock', async () => {
    const behind = 60 * 60 * 1000
    const anna = person('Anna')
    const joe = person('Joe', {
      now: () => Date.now() + DAY,
      syncNow: () => Date.now() - behind,
    })
    const spaceId = await sharedCar(anna, joe)
    const { at } = joe.store.getState().memberships.cars[spaceId]
    expect(at).toBeLessThanOrEqual(Date.now() - behind + 1000)
    await joe.engine.leaveCar(spaceId)
    const left = joe.store.getState().memberships.leftCars[spaceId]
    expect(left).toBeGreaterThanOrEqual(at)
    expect(left).toBeLessThanOrEqual(Date.now() - behind + 1000)
  })
})

describe('keys a member can’t plant or swap', () => {
  async function plantLink(
    who: TestPerson,
    spaceId: string,
    x: number,
    key: Uint8Array,
    stamp: number
  ) {
    const epoch = who.car(spaceId).epoch
    const held = who.keyring.key(spaceId, epoch)!
    const recordId = `k.${x}`
    const link = {
      recordId,
      epoch,
      stamp,
      blob: sealRecord(
        held,
        { spaceId, epoch, recordId, deleted: false, stamp },
        { kind: 'keys', data: keysRecordData(key) },
        random(24)
      ),
    }
    await expect(
      who.raw.put(authOf(who, spaceId), [link])
    ).rejects.toMatchObject({ code: 'forbidden' })
    server.plantRecord(spaceId, link)
  }

  it('learns no key from a link sealed below its own epoch', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const eve = person('Eve')
    const spaceId = await sharedCar(anna, joe, cal, dee)
    const realFirst = anna.keyring.key(spaceId, 1)!
    const planted = random(32)

    const ahead = Date.now() + 12 * 60 * 60 * 1000
    await plantLink(joe, spaceId, 2, planted, ahead)
    await plantLink(joe, spaceId, 3, planted, ahead)
    for (const who of [anna, joe, cal]) {
      await who.engine.syncCar(spaceId)
      expect(who.keyring.key(spaceId, 1)).toEqual(realFirst)
      expect(who.keyring.key(spaceId, 2)).toBeNull()
    }

    await anna.engine.removeMember(spaceId, memberIdOf(dee, spaceId))
    const second = anna.keyring.key(spaceId, 2)!
    expect(second).not.toEqual(planted)
    await cal.engine.syncCar(spaceId)
    expect(cal.keyring.key(spaceId, 2)).toEqual(second)
    expect(stored(spaceId, 'k.2', second).epoch).toBe(2)
    await eve.engine.joinCar(await invite(anna, spaceId, eve))
    expect(eve.keyring.key(spaceId, 1)).toEqual(realFirst)
    expect(eve.car(spaceId).trips).toHaveLength(2)

    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    await joe.engine.syncCar(spaceId)
    expect(joe.keyring.key(spaceId, 2)).toEqual(second)
    expect(stored(spaceId, 'k.3', anna.keyring.key(spaceId, 3)!).epoch).toBe(3)
  })

  it('wraps a new key to no key a member’s id doesn’t commit to', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    const someone = deriveSpaceMember(random(32), spaceId)

    server.forgeMemberKey(memberIdOf(joe, spaceId), someone.dhPub)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    expect(server.spaces.get(spaceId)!.epoch).toBe(1)
    expect(server.state.rekeys).toEqual([])
    expect(anna.keyring.key(spaceId, 2)).toBeNull()
    expect(anna.errors).toContain('rekey')
    expect(anna.outcomes).toContainEqual({
      type: 'sync_failed',
      reason: 'member_unverified',
    })
  })

  it('invites again with the new key when a rekey reached the server first', async () => {
    const anna = person('Anna')
    const annasIpad = person('Anna', { seed: anna.seed })
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe, cal)
    await annasIpad.engine.addCarFromRoster(
      spaceId,
      anna.store.getState().memberships.cars[spaceId].at
    )

    anna.hooks.before = async (op) => {
      if (op !== 'createInvite') return
      anna.hooks.before = undefined
      await annasIpad.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    }
    const invitation = await invite(anna, spaceId, dee)
    expect(invitation.epoch).toBe(2)
    expect(invitation.key).toBe(toB64u(annasIpad.keyring.key(spaceId, 2)!))
    await dee.engine.joinCar(invitation)
    dee.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(dee, spaceId, 'trip-1'), note: 'Dee' })
    await dee.engine.syncCar(spaceId)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Dee')
  })

  it('counts a join retried after a rekey as joined, trusting the new key through the chain', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const deesIpad = person('Dee', { seed: dee.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    const invitation = await invite(anna, spaceId, dee)

    dee.loseNext('join')
    await expect(dee.engine.joinCar(invitation)).rejects.toMatchObject({
      code: 'network',
    })
    await dee.engine.sync()
    expect(dee.car(spaceId)).toBeDefined()

    await anna.engine.syncCar(spaceId)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    expect(server.spaces.get(spaceId)!.epoch).toBe(2)

    await deesIpad.engine.joinCar(invitation)
    expect(deesIpad.store.getState().pendingEnds).toEqual({})
    expect(deesIpad.car(spaceId).epoch).toBe(2)
    expect(deesIpad.keyring.key(spaceId, 2)).toEqual(
      anna.keyring.key(spaceId, 2)
    )
    expect(deesIpad.car(spaceId).trips).toHaveLength(2)
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(dee, spaceId))
    ).toBe(true)
  })
})

describe('records only their member or the owner may put', () => {
  function putIds(who: TestPerson) {
    const ids: string[] = []
    who.hooks.beforePut = (records) => {
      ids.push(...records.map((record) => record.recordId))
    }
    return ids
  }

  function breakLink(spaceId: string) {
    const stamp = server.spaces.get(spaceId)!.records.get('k.2')!.stamp + 1000
    server.plantRecord(spaceId, {
      recordId: 'k.2',
      epoch: 2,
      stamp,
      blob: sealRecord(
        random(32),
        { spaceId, epoch: 2, recordId: 'k.2', deleted: false, stamp },
        { kind: 'keys', data: keysRecordData(random(32)) },
        random(24)
      ),
    })
  }

  it('drops a link a former owner still owed, and puts the rest', async () => {
    let phoneAhead = 0
    const anna = person('Anna', { syncNow: () => Date.now() + phoneAhead })
    const annasIpad = person('Anna', { seed: anna.seed })
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe, cal, dee)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    await joe.engine.syncCar(spaceId)
    await dee.engine.syncCar(spaceId)
    const { at } = anna.store.getState().memberships.cars[spaceId]
    expect(await annasIpad.engine.addCarFromRoster(spaceId, at)).toBe('synced')

    breakLink(spaceId)
    phoneAhead = 12 * 60 * 60 * 1000
    const online = offline(anna, 'put')
    anna.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(anna, spaceId, 'trip-1'), note: 'Anna' })
    await expect(anna.engine.syncCar(spaceId)).rejects.toMatchObject({
      code: 'network',
    })
    expect(anna.car(spaceId).pendingPuts).toEqual(
      expect.arrayContaining(['k.2', 'trip-1'])
    )

    await annasIpad.engine.leaveCar(spaceId)
    await annasIpad.engine.joinCar(await invite(joe, spaceId, annasIpad))
    expect(server.spaces.get(spaceId)!.ownerId).toBe(memberIdOf(joe, spaceId))

    online()
    const ids = putIds(anna)
    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(ids).toContain('trip-1')

    expect(ids).not.toContain('k.2')
    expect(anna.car(spaceId).pendingPuts).toEqual([])
    await joe.engine.syncCar(spaceId)
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Anna')
  })

  it('puts the rest when the server refuses a link this device took for its own', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    await joe.engine.syncCar(spaceId)
    breakLink(spaceId)
    anna.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(anna, spaceId, 'trip-1'), note: 'Anna' })

    server.refuseNext('put', 403, 'forbidden')
    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(anna.car(spaceId).pendingPuts).toEqual([])
    await joe.engine.syncCar(spaceId)
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Anna')

    await anna.engine.syncCar(spaceId)
    expect(
      stored(spaceId, 'k.2', anna.keyring.key(spaceId, 2)!).plaintext.data
    ).toEqual(keysRecordData(anna.keyring.key(spaceId, 1)!))
  })
})

describe('a car waiting for its key', () => {
  it('still closes an invitation canceled on it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const invitation = await invite(joe, spaceId, person('Cal'))
    server.plantWrap(spaceId, memberIdOf(joe, spaceId), random(32), 2)
    expect(await joe.engine.syncCar(spaceId)).toBe('waiting')

    expect(await joe.engine.cancelInvite(spaceId, invitation.inviteId)).toEqual(
      { pending: false }
    )
    expect(server.spaces.get(spaceId)!.invites.get(invitation.inviteId)).toBe(
      undefined
    )
    expect(joe.store.getState().closingInvites).toEqual({})

    expect(joe.car(spaceId).pendingPuts).toContain(`i.${invitation.inviteId}`)
    server.honest()
    await joe.engine.syncCar(spaceId)
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).invites).toEqual([])
  })
})

describe('the last one left', () => {
  it('ends a car its owner is last on without making a new key first', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    await joe.engine.leaveCar(spaceId)
    expect(await anna.engine.syncCar(spaceId)).toBe('ended')
    expect(server.state.rekeys).toEqual([])
    expect(anna.personal().trips).toHaveLength(2)
  })

  it('keeps the car shared while an invitation a rekey closed is still owed', async () => {
    let later = 0
    const anna = person('Anna', { syncNow: () => Date.now() + later })
    const joe = person('Joe')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe)
    await invite(anna, spaceId, dee)

    const online = offline(anna, 'createInvite')
    expect(
      await anna.engine.removeMember(spaceId, memberIdOf(joe, spaceId))
    ).toBe('synced')
    expect(anna.car(spaceId)).toBeDefined()
    expect(server.spaces.has(spaceId)).toBe(true)
    online()
    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(anna.reissued).toHaveLength(1)

    later = 8 * DAY
    serverAhead = 8 * DAY
    expect(await anna.engine.syncCar(spaceId)).toBe('ended')
    expect(anna.outcomes).toContainEqual({
      type: 'ended',
      reason: 'last_member',
    })
  })

  it('keeps the car shared while another of the owner’s devices has an invitation out', async () => {
    const anna = person('Anna')
    const annasIpad = person('Anna', { seed: anna.seed })
    const joe = person('Joe')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe)
    await annasIpad.engine.addCarFromRoster(
      spaceId,
      anna.store.getState().memberships.cars[spaceId].at
    )
    await invite(annasIpad, spaceId, dee)
    await joe.engine.leaveCar(spaceId)

    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(server.spaces.get(spaceId)!.epoch).toBe(2)
    expect(anna.reissued).toEqual([])
    expect(await annasIpad.engine.syncCar(spaceId)).toBe('synced')
    expect(annasIpad.reissued).toHaveLength(1)
    await dee.engine.joinCar(annasIpad.reissued[0].invite)
    expect(dee.car(spaceId).trips).toHaveLength(2)
  })
})

describe('older builds and the User’s other devices', () => {
  it('keeps an edit another device made before the share, once it syncs here', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    ownCar(anna)
    const before = anna.personal().trips.find((t) => t.id === 'trip-1')!

    const edited = {
      ...before,
      distanceMiles: 42,
      updatedAt: before.updatedAt! + 10,
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
    const { spaceId } = await anna.engine.shareCar('car-1')
    expect(
      anna.personal().deletedMileageRecords.find((t) => t.id === 'trip-1')
    ).toMatchObject({ deletedAt: before.updatedAt! + 1 })

    anna.mergePersonal({ trips: [edited] })
    expect(anna.personal().trips.map((t) => t.id)).toEqual(['trip-1'])
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').distanceMiles).toBe(42)
    expect(anna.personal().trips).toEqual([])
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(tripOn(joe, spaceId, 'trip-1').distanceMiles).toBe(42)
  })

  it('moves into the car an edit an older build saved in the User’s own store', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)

    anna.savePersonal('trips', {
      ...ownTrip(tripOn(anna, spaceId, 'trip-1')),
      note: 'Older build',
    })
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1')).toMatchObject({
      note: 'Older build',
      loggedBy: memberIdOf(anna, spaceId),
      editedBy: memberIdOf(anna, spaceId),
    })
    expect(anna.personal().trips).toEqual([])
    await joe.engine.syncCar(spaceId)
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Older build')
  })

  it('keeps an offline edit once, in the copy, when the User leaves before it synced', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    joe.savePersonal('trips', {
      ...ownTrip(tripOn(joe, spaceId, 'trip-2')),
      note: 'Offline',
    })
    offline(joe)
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: true })
    const trips = joe.personal().trips
    expect(trips).toHaveLength(2)
    expect(trips.filter((trip) => trip.note === 'Offline')).toHaveLength(1)

    expect(trips.find((trip) => trip.id === 'trip-2')).toBeUndefined()
  })

  it('makes copies that agree when one device missed a deletion', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe)
    await joesIpad.engine.addCarFromRoster(
      spaceId,
      joe.store.getState().memberships.cars[spaceId].at
    )
    anna.store.getState().deleteTrip(spaceId, 'trip-2')
    await anna.engine.syncCar(spaceId)
    await joe.engine.syncCar(spaceId)

    await anna.engine.removeMember(spaceId, memberIdOf(joe, spaceId))
    expect(await joe.engine.syncCar(spaceId)).toBe('ended')
    expect(await joesIpad.engine.syncCar(spaceId)).toBe('ended')
    expect(joesIpad.personal().trips).toHaveLength(2)

    for (const [into, from] of [
      [joesIpad, joe],
      [joe, joesIpad],
    ]) {
      const merged = {
        ...into.personal(),
        ...mergeMileageRecords(into.personal(), from.personal()),
      }
      expect(merged.trips.map((trip) => trip.distanceMiles)).toEqual([1])
    }
  })
})

describe('long histories', () => {
  it('opens what an older key sealed once the key chain arrives on a later page', async () => {
    server = newServer({ pageRecords: 2 })
    const bea = person('Bea')
    const cal = person('Cal')
    const joe = person('Joe')
    const dee = person('Dee')
    const spaceId = await sharedCar(bea, cal, joe)
    await bea.engine.removeMember(spaceId, memberIdOf(joe, spaceId))
    const invitation = await invite(bea, spaceId, dee)
    server.state.log.length = 0
    await dee.engine.joinCar(invitation)
    expect(
      server.state.log.filter((op) => op === 'sync').length
    ).toBeGreaterThan(3)
    expect(dee.car(spaceId).trips).toHaveLength(2)
    expect(dee.car(spaceId).vehicleSetups).toHaveLength(1)
    expect(dee.car(spaceId).sealedRecords).toEqual([])
    expect(dee.keyring.epochs(spaceId)).toEqual([2, 1])
  })

  it('keeps a record from a newer app, and reads it again on the next launch', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const key = anna.keyring.key(spaceId, 1)!
    const address = {
      spaceId,
      epoch: 1,
      recordId: 'trip-new',
      deleted: false,
      stamp: Date.now(),
    }

    const newer = sealXChaCha(
      deriveRecordKey(key),
      utf8(JSON.stringify({ v: 2, kind: 'trip', data: { future: true } })),
      recordAad(address),
      random(24)
    )
    await anna.raw.put(authOf(anna, spaceId), [
      { recordId: 'trip-new', epoch: 1, stamp: address.stamp, blob: newer },
    ])
    const reads = () =>
      joe.errors.filter((context) => context === 'open').length

    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).unreadRecords).toMatchObject([
      { recordId: 'trip-new', problem: 'newer' },
    ])
    expect(joe.car(spaceId).seq).toBe(server.spaces.get(spaceId)!.seq)
    expect(reads()).toBe(1)
    await joe.engine.syncCar(spaceId)
    expect(reads()).toBe(1)

    await joe.relaunch()
    await joe.engine.syncCar(spaceId)
    expect(reads()).toBe(2)
    expect(joe.car(spaceId).unreadRecords).toHaveLength(1)

    const stamp = address.stamp + 1
    await anna.raw.put(authOf(anna, spaceId), [
      {
        recordId: 'trip-new',
        epoch: 1,
        stamp,
        blob: sealRecord(
          key,
          { ...address, stamp },
          {
            kind: 'trip',
            data: {
              vehicleId: 'car-1',
              date: '2026-02-04',
              distanceMiles: 7,
              createdAt: 1,
            },
          },
          random(24)
        ),
      },
    ])
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).unreadRecords).toEqual([])
    expect(tripOn(joe, spaceId, 'trip-new').distanceMiles).toBe(7)
  })

  it('shares and syncs 5,000 trips in linear time', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    ownCar(anna, 5000)
    const started = performance.now()
    const { spaceId } = await anna.engine.shareCar('car-1')
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(joe.car(spaceId).trips).toHaveLength(5000)

    joe.store.getState().updateSharedCar(spaceId, (car) => ({
      ...car,
      pendingPuts: car.trips.map((trip) => trip.id),
    }))
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).pendingPuts).toEqual([])

    expect(performance.now() - started).toBeLessThan(10_000)
  }, 60_000)
})

describe('calls that race', () => {
  it('runs nothing that was queued before forgetAll', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    const sync = hold(joe, 'sync')
    const syncing = joe.engine.syncCar(spaceId)
    await sync.reached
    const leaving = joe.engine.leaveCar(spaceId)
    joe.engine.forgetAll()
    sync.release()
    await expect(leaving).rejects.toMatchObject({ code: 'cancelled' })
    await syncing.catch(() => undefined)
    const state = joe.store.getState()
    expect(state.cars).toEqual({})
    expect(state.pendingEnds).toEqual({})
    expect(state.memberships).toEqual({ cars: {}, leftCars: {} })
    expect(joe.personal().trips).toEqual([])
    expect(joe.status.getState().cars).toEqual({})

    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(true)
  })

  it('saves nothing from a join whose answer arrives after forgetAll', async () => {
    const anna = person('Anna')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, dee)
    const answer = holdAnswer(dee, 'join')
    const joining = dee.engine.joinCar(invitation)
    await answer.reached
    dee.engine.forgetAll()
    answer.release()
    await expect(joining).rejects.toMatchObject({ code: 'cancelled' })
    const state = dee.store.getState()
    expect(state.cars).toEqual({})
    expect(state.joining).toEqual({})
    expect(state.memberships).toEqual({ cars: {}, leftCars: {} })
    expect(dee.keyring.epochs(spaceId)).toEqual([])
  })

  it('runs a full sync when one is asked for while a sync up to a seq waits', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    anna.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(anna, spaceId, 'trip-1'), note: 'Anna' })
    await anna.engine.syncCar(spaceId)
    const head = server.spaces.get(spaceId)!.seq
    const sync = hold(joe, 'sync')
    const first = joe.engine.syncCar(spaceId)
    await sync.reached

    const live = joe.engine.syncCar(spaceId, { minSeq: head })
    const refresh = joe.engine.syncCar(spaceId)
    sync.release()
    expect(await first).toBe('synced')
    expect(await refresh).toBe('synced')
    expect(await live).toBe('synced')
  })

  it('leaves nothing behind when forgetAll lands while a share seeds', async () => {
    const anna = person('Anna')
    ownCar(anna, 250)
    const put = hold(anna, 'put')
    const sharing = anna.engine.shareCar('car-1')
    await put.reached
    const [spaceId] = Object.keys(anna.store.getState().seeding)
    anna.engine.forgetAll()
    put.release()
    await expect(sharing).rejects.toBeDefined()
    expect(anna.store.getState().seeding).toEqual({})
    expect(anna.store.getState().cars).toEqual({})
    expect(anna.keyring.epochs(spaceId)).toEqual([])

    expect(anna.personal().vehicles.map((v) => v.id)).toEqual(['car-1'])
    expect(anna.personal().trips).toHaveLength(250)
  })

  it('brings no key back when forgetAll lands while a sync runs', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const sync = hold(joe, 'sync')
    const syncing = joe.engine.syncCar(spaceId)
    await sync.reached
    joe.engine.forgetAll()
    sync.release()
    await syncing.catch(() => undefined)
    expect(joe.store.getState().cars).toEqual({})
    expect(joe.keyring.epochs(spaceId)).toEqual([])
  })

  it('finishes on the next sync a share that cancel stopped while it seeded', async () => {
    const anna = person('Anna')
    ownCar(anna, 250)
    const put = hold(anna, 'put')
    const sharing = anna.engine.shareCar('car-1')
    await put.reached
    anna.engine.cancel()
    put.release()
    await expect(sharing).rejects.toBeDefined()
    const [spaceId] = Object.keys(anna.store.getState().seeding)
    expect(spaceId).toBeDefined()

    expect(anna.personal().trips).toHaveLength(250)

    await anna.engine.sync()
    expect(anna.store.getState().seeding).toEqual({})
    expect(anna.car(spaceId).trips).toHaveLength(250)
    expect(anna.personal().trips).toEqual([])
    const joe = person('Joe')
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(joe.car(spaceId).trips).toHaveLength(250)
  })

  it('loses nothing to a sync that cancel stopped, and syncs it next time', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)

    const drive = (who: TestPerson, id: string, miles: number) =>
      who.store.getState().updateSharedCar(spaceId, (car) => ({
        ...car,
        trips: car.trips.map((trip) =>
          trip.id === id
            ? { ...trip, distanceMiles: miles, updatedAt: Date.now() + 1 }
            : trip
        ),
        pendingPuts: withPending(car.pendingPuts, [id]),
      }))
    drive(anna, 'trip-1', 9)
    drive(joe, 'trip-2', 7)
    await anna.engine.syncCar(spaceId)
    const sync = hold(joe, 'sync')
    const syncing = joe.engine.syncCar(spaceId)
    await sync.reached
    joe.engine.cancel()
    sync.release()
    await syncing.catch(() => undefined)
    expect(joe.car(spaceId).pendingPuts).toContain('trip-2')

    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(tripOn(joe, spaceId, 'trip-1').distanceMiles).toBe(9)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-2').distanceMiles).toBe(7)
  })

  it('runs a leave after the sync under way, and the sync after it finds no car', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    const sync = hold(joe, 'sync')
    const first = joe.engine.syncCar(spaceId)
    await sync.reached
    const leaving = joe.engine.leaveCar(spaceId)
    const after = joe.engine.syncCar(spaceId)
    sync.release()
    expect(await first).toBe('synced')
    expect(await leaving).toEqual({ pending: false })
    expect(await after).toBe('missing')
    expect(joe.personal().trips).toHaveLength(2)
  })

  it('runs a sync asked for during a join once the car is here', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    const join = hold(joe, 'join')
    const joining = joe.engine.joinCar(invitation)
    await join.reached
    const syncing = joe.engine.syncCar(spaceId)
    join.release()
    await joining
    expect(await syncing).toBe('synced')
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })
})

describe('what a car keeps', () => {
  it('keeps a note in a newer format through other edits, until the note itself is edited', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const key = anna.keyring.key(spaceId, 1)!
    const trip = tripOn(anna, spaceId, 'trip-1')
    const stamp = trip.updatedAt! + 1000
    const noteDoc = {
      v: 2,
      doc: { type: 'doc', content: [] },
      textHash: 'from-a-newer-app',
    }
    await anna.raw.put(authOf(anna, spaceId), [
      {
        recordId: 'trip-1',
        epoch: 1,
        stamp,
        blob: sealRecord(
          key,
          { spaceId, epoch: 1, recordId: 'trip-1', deleted: false, stamp },
          {
            kind: 'trip',
            data: { ...mileageRecordData(trip), note: 'Formatted', noteDoc },
          },
          random(24)
        ),
      },
    ])
    await joe.engine.syncCar(spaceId)
    expect(tripOn(joe, spaceId, 'trip-1').noteDoc).toBeUndefined()

    joe.store.getState().saveTrip(spaceId, {
      ...tripOn(joe, spaceId, 'trip-1'),
      distanceMiles: 9,
    })
    await joe.engine.syncCar(spaceId)
    expect(stored(spaceId, 'trip-1', key).plaintext.data).toMatchObject({
      distanceMiles: 9,
      note: 'Formatted',
      noteDoc,
    })

    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Plain' })
    await joe.engine.syncCar(spaceId)
    const data = stored(spaceId, 'trip-1', key).plaintext.data
    expect(data).toMatchObject({ distanceMiles: 9, note: 'Plain' })
    expect(data).not.toHaveProperty('noteDoc')
  })

  it('puts the User’s member record again when their name changed while a share was stopped', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    ownCar(anna)

    let puts = 0
    anna.hooks.beforePut = () => {
      puts += 1
      if (puts === 1)
        anna.savePersonal('trips', {
          ...anna.personal().trips.find((t) => t.id === 'trip-1')!,
          distanceMiles: 7,
        })
      else throw new SpaceError('network')
    }
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    const [spaceId] = Object.keys(anna.store.getState().seeding)
    expect(
      Object.keys(anna.store.getState().seeding[spaceId].landed)
    ).toContain(`m.${memberIdOf(anna, spaceId)}`)
    anna.hooks.beforePut = undefined
    anna.rename('Anna B')
    await anna.engine.shareCar('car-1')
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(joe.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna B',
      'Joe',
    ])
  })

  it('sends back the fields a newer version added when this one edits the record', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const key = anna.keyring.key(spaceId, 1)!
    const trip = tripOn(anna, spaceId, 'trip-1')
    const stamp = trip.updatedAt! + 1000
    await anna.raw.put(authOf(anna, spaceId), [
      {
        recordId: 'trip-1',
        epoch: 1,
        stamp,
        blob: sealRecord(
          key,
          { spaceId, epoch: 1, recordId: 'trip-1', deleted: false, stamp },
          {
            kind: 'trip',
            data: { ...mileageRecordData(trip), mood: 'sunny' },
          },
          random(24)
        ),
      },
    ])
    await joe.engine.syncCar(spaceId)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Joe' })
    await joe.engine.syncCar(spaceId)
    expect(stored(spaceId, 'trip-1', key).plaintext.data).toMatchObject({
      note: 'Joe',
      mood: 'sunny',
    })
  })

  it('never cuts a record to fit: one too large stays here, and the car says so', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const note = 'n'.repeat(RECORD_PLAINTEXT_MAX_BYTES)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note })
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.status.getState().cars[spaceId]).toMatchObject({ tooLarge: 1 })
    expect(joe.car(spaceId).pendingPuts).toEqual(['trip-1'])
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe(note)
  })

  it('doesn’t let two devices of one person take turns rewriting their name', async () => {
    const anna = person('Anna')

    const annasIpad = person('Ann', { seed: anna.seed })
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    await annasIpad.engine.addCarFromRoster(
      spaceId,
      anna.store.getState().memberships.cars[spaceId].at
    )
    await anna.engine.syncCar(spaceId)
    server.state.log.length = 0
    for (let round = 0; round < 3; round++) {
      await anna.engine.syncCar(spaceId)
      await annasIpad.engine.syncCar(spaceId)
    }
    expect(server.state.log).not.toContain('put')
    anna.rename('Anna B.')
    await anna.engine.syncCar(spaceId)
    await annasIpad.engine.syncCar(spaceId)
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna B.',
      'Joe',
    ])
  })

  it('pulls before stopping sharing, so the owner’s copy has everyone’s last edits', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    joe.store
      .getState()
      .saveTrip(spaceId, { ...tripOn(joe, spaceId, 'trip-1'), note: 'Joe' })
    await joe.engine.syncCar(spaceId)
    await anna.engine.stopSharing(spaceId)
    expect(anna.personal().trips.map((trip) => trip.note)).toContain('Joe')
  })
})

describe('leaving everything', () => {
  it('leaves a car this device knows only from the roster, keeping a copy', async () => {
    const anna = person('Anna')
    const cal = person('Cal')
    const joe = person('Joe')
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    joesIpad.store
      .getState()
      .noteJoined(spaceId, joe.store.getState().memberships.cars[spaceId].at)
    expect(await joesIpad.engine.leaveAll()).toEqual({
      pending: 0,
      notLeft: [],
    })
    expect(joesIpad.personal().trips).toHaveLength(2)
    expect(
      server.spaces.get(spaceId)!.members.has(memberIdOf(joe, spaceId))
    ).toBe(false)
  })

  it('names the cars it couldn’t leave', async () => {
    const anna = person('Anna')
    const cal = person('Cal')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe, cal)
    offline(joe, 'leave')
    expect(await joe.engine.leaveAll()).toEqual({
      pending: 1,
      notLeft: [{ spaceId, name: 'Mazda' }],
    })
  })
})

describe('sync failures', () => {
  it('counts them by reason, but not being offline', async () => {
    const anna = person('Anna')
    const spaceId = await sharedCar(anna)
    const online = offline(anna, 'sync')
    await expect(anna.engine.syncCar(spaceId)).rejects.toBeDefined()
    expect(anna.outcomes.filter((o) => o.type === 'sync_failed')).toEqual([])
    online()
    server.refuseNext('sync', 403, 'forbidden')
    await expect(anna.engine.syncCar(spaceId)).rejects.toBeDefined()
    expect(anna.outcomes).toContainEqual({
      type: 'sync_failed',
      reason: 'forbidden',
    })
  })
})

describe('a share that can’t finish', () => {
  it('gives up on a record too large to share: the space goes, the car stays the User’s', async () => {
    const anna = person('Anna')
    ownCar(anna)
    anna.savePersonal('trips', {
      id: 'trip-long',
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 1,
      note: 'n'.repeat(RECORD_PLAINTEXT_MAX_BYTES),
      createdAt: 1,
    })
    let spaceId = ''
    anna.hooks.before = () => {
      spaceId ||= Object.keys(anna.store.getState().seeding)[0] ?? ''
    }
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'too_large',
    })
    expect(anna.store.getState().seeding).toEqual({})
    expect(server.isDeleted(spaceId)).toBe(true)
    expect(anna.personal().vehicles.map((v) => v.id)).toEqual(['car-1'])
    expect(anna.personal().trips).toHaveLength(3)

    expect(anna.shareFailures).toEqual([])
  })

  it('gives up in the background on a car past a shared car’s caps, and says so', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const online = offline(anna, 'put')
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'network',
    })
    online()
    const [spaceId] = Object.keys(anna.store.getState().seeding)

    server.refuseNext('put', 429, 'limit')
    server.refuseNext('put', 429, 'limit')
    await anna.engine.sync()
    expect(anna.shareFailures).toEqual([
      { vehicleId: 'car-1', name: 'Mazda', reason: 'limit' },
    ])
    expect(anna.outcomes).toContainEqual({
      type: 'share_failed',
      reason: 'limit',
    })
    expect(server.isDeleted(spaceId)).toBe(true)
    expect(anna.store.getState().seeding).toEqual({})
    expect(anna.personal().vehicles.map((v) => v.id)).toEqual(['car-1'])
  })

  it('calibrates the clock once on a refused stamp, and gives up if that doesn’t cure it', async () => {
    const refreshClock = vi.fn(async () => undefined)
    const anna = person('Anna', { overrides: { refreshClock } })
    ownCar(anna)
    server.refuseNext('put', 400, 'bad_request')
    await anna.engine.shareCar('car-1')
    expect(refreshClock).toHaveBeenCalledTimes(1)
    expect(Object.keys(anna.store.getState().cars)).toHaveLength(1)

    const bea = person('Bea', { overrides: { refreshClock } })
    ownCar(bea)
    server.refuseNext('put', 400, 'bad_request')
    server.refuseNext('put', 400, 'bad_request')
    await expect(bea.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'bad_request',
    })
    expect(refreshClock).toHaveBeenCalledTimes(2)
    expect(bea.store.getState().seeding).toEqual({})
    expect(bea.personal().vehicles.map((v) => v.id)).toEqual(['car-1'])
  })
})

describe('what stays on the device', () => {
  it('keeps keys and invitation secrets out of the stores that are saved', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    joe.loseNext('join')
    await joe.engine.joinCar(invitation).catch(() => undefined)
    const saved = JSON.stringify([joe.store.getState(), anna.store.getState()])
    expect(joe.store.getState().joining[spaceId]).toBeDefined()
    expect(saved).not.toContain(invitation.key)
    expect(saved).not.toContain(invitation.joinSecret)

    await joe.keyring.flushed()
    expect(joe.keyringStored()).toBeNull()

    await joe.engine.sync()
    await joe.keyring.flushed()
    expect(joe.keyringStored()).toContain(invitation.key)
  })
})
