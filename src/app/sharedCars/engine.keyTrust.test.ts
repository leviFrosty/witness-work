import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import { SpaceError, type SpacePutRecord } from '@/lib/sharedSpaces/client'
import { deriveSpaceMember } from '@/lib/sharedSpaces/crypto'
import { openLink } from '@/lib/sharedSpaces/keyTrust'
import {
  keysRecordData,
  memberRecordId,
  openRecord,
  readKeysData,
  sealRecord,
} from '@/lib/sharedSpaces/records'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import {
  enginePeople,
  type TestPerson,
} from '@/app/sharedCars/testing/enginePeople'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

/**
 * The keys a device trusts (docs/shared-cars-protocol.md, "Trusted keys"): a
 * server that wraps a key of its own to a member, at the car's epoch or past
 * it, rolls the car back to an older one, hands out a member record or link of
 * its choosing, or lists a member of its own and asks for a rekey, gets nothing
 * sealed under its key and no key wrapped to it, and neither does a member who
 * sends the User an invitation with a key of their own. And every way a device
 * of the User's comes to trust the car's real key: through the key chain, an
 * invitation the server took, or their own key check when it trusts none yet.
 */

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

let server: FakeSpacesServer

beforeEach(() => {
  // Retries wait no time.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  server = createFakeSpacesServer({ now: Date.now })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const { person, ownCar, tripOn, invite, sharedCar } = enginePeople(
  () => server,
  random
)

const memberIdOf = (who: TestPerson, spaceId: string) =>
  deriveSpaceMember(who.seed, spaceId).memberId

/** `who`'s member auth on `spaceId`, for calls the engine wouldn't make. */
function authOf(who: TestPerson, spaceId: string) {
  const member = deriveSpaceMember(who.seed, spaceId)
  return { spaceId, memberId: member.memberId, token: member.token }
}

/** Whether `record` opens under `key`, at the epoch it was sealed under. */
function opensUnder(
  spaceId: string,
  record: Pick<SpacePutRecord, 'recordId' | 'epoch' | 'stamp' | 'blob'> & {
    deleted?: boolean
  },
  key: Uint8Array
) {
  try {
    openRecord(
      key,
      {
        spaceId,
        epoch: record.epoch,
        recordId: record.recordId,
        deleted: record.deleted === true,
        stamp: record.stamp,
      },
      record.blob
    )
    return true
  } catch {
    return false
  }
}

/** Every record `who` puts from now on, as sent. */
function putsOf(who: TestPerson) {
  const puts: SpacePutRecord[] = []
  who.hooks.beforePut = (records) => {
    puts.push(...records)
  }
  return puts
}

/** Everything on the server that opens under `key`. */
const storedUnder = (spaceId: string, key: Uint8Array) =>
  [...server.spaces.get(spaceId)!.records].filter(([recordId, record]) =>
    opensUnder(spaceId, { recordId, ...record }, key)
  )

/** A blob of `recordId`'s, sealed under a key nobody holds. */
const unopenable = (
  spaceId: string,
  recordId: string,
  epoch: number,
  stamp: number
) =>
  sealRecord(
    random(32),
    { spaceId, epoch, recordId, deleted: false, stamp },
    { kind: 'keys', data: keysRecordData(random(32)) },
    random(24)
  )

/** `who`'s puts fail from now on, as if offline; their syncs still pull. */
function putsOffline(who: TestPerson) {
  who.hooks.beforePut = () => {
    throw new SpaceError('network')
  }
}

/** `who` edits `trip-1`'s note on the car. */
const editTrip = (who: TestPerson, spaceId: string, note: string) =>
  who.store
    .getState()
    .saveTrip(spaceId, { ...tripOn(who, spaceId, 'trip-1'), note })

const failures = (who: TestPerson, reason: string) =>
  who.outcomes.filter(
    (outcome) => outcome.type === 'sync_failed' && outcome.reason === reason
  ).length

describe('a key the server chose', () => {
  it('keeps the key it trusts when its own wrap holds another, and seals nothing under that one', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const real = anna.keyring.key(spaceId, 1)!
    const planted = random(32)
    server.plantWrap(spaceId, memberIdOf(joe, spaceId), planted)
    const puts = putsOf(joe)

    editTrip(joe, spaceId, 'Joe')
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.keyring.key(spaceId, 1)).toEqual(real)
    expect(failures(joe, 'key_mismatch')).toBe(1)
    expect(joe.errors).toContain('keys')
    // Reported once, not on every sync.
    editTrip(joe, spaceId, 'Joe again')
    await joe.engine.syncCar(spaceId)
    expect(failures(joe, 'key_mismatch')).toBe(1)

    expect(puts.length).toBeGreaterThan(0)
    expect(puts.filter((r) => opensUnder(spaceId, r, planted))).toEqual([])
    expect(storedUnder(spaceId, planted)).toEqual([])
    const cal = person('Cal')
    const invitation = await invite(joe, spaceId, cal)
    expect(fromB64u(invitation.key)).toEqual(real)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Joe again')
  })

  it('waits on a wrap for an epoch nothing vouches for, sealing nothing under it, and goes on once the server is honest again', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const real = anna.keyring.key(spaceId, 1)!
    const planted = random(32)
    server.plantWrap(spaceId, memberIdOf(joe, spaceId), planted, 2)
    const puts = putsOf(joe)

    editTrip(joe, spaceId, 'Joe')
    expect(await joe.engine.syncCar(spaceId)).toBe('waiting')
    expect(joe.keyring.key(spaceId, 2)).toBeNull()
    expect(joe.status.getState().cars[spaceId]).toMatchObject({
      waitingForKey: true,
    })
    expect(failures(joe, 'key_unverified')).toBe(1)
    // The edit stays here, sealed under nothing yet.
    expect(joe.car(spaceId).pendingPuts).toContain('trip-1')
    expect(puts).toEqual([])
    await expect(invite(joe, spaceId, person('Cal'))).rejects.toMatchObject({
      code: 'key_unverified',
    })

    expect(await joe.engine.syncCar(spaceId)).toBe('waiting')
    expect(failures(joe, 'key_unverified')).toBe(1)
    expect(puts).toEqual([])
    expect(storedUnder(spaceId, planted)).toEqual([])

    // The car's epoch is the server's, so it doesn't stay at the planted one.
    server.honest()
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.car(spaceId).epoch).toBe(1)
    expect(joe.status.getState().cars[spaceId]).toMatchObject({
      waitingForKey: false,
    })
    expect(puts.every((r) => opensUnder(spaceId, r, real))).toBe(true)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Joe')
  })

  it('waits rather than seal under an older key the server rolls the car back to', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe, cal, dee)
    const first = anna.keyring.key(spaceId, 1)!
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    await joe.engine.syncCar(spaceId)
    const second = joe.keyring.key(spaceId, 2)!
    expect(second).toEqual(anna.keyring.key(spaceId, 2))
    // The server goes back to epoch 1, whose key Cal still holds.
    server.spaces.get(spaceId)!.epoch = 1
    server.plantWrap(spaceId, memberIdOf(joe, spaceId), first, 1)
    const puts = putsOf(joe)

    editTrip(joe, spaceId, 'Joe')
    expect(await joe.engine.syncCar(spaceId)).toBe('waiting')
    expect(puts).toEqual([])
    expect(joe.car(spaceId).pendingPuts).toContain('trip-1')
    await expect(invite(joe, spaceId, dee)).rejects.toMatchObject({
      code: 'key_unverified',
    })
    const open = [...server.spaces.get(spaceId)!.invites.values()]
    expect(open.filter((i) => !i.joined)).toEqual([])

    server.spaces.get(spaceId)!.epoch = 2
    server.honest()
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(puts.length).toBeGreaterThan(0)
    expect(puts.every((r) => opensUnder(spaceId, r, second))).toBe(true)
  })

  it('seals the first records under the key it made, whatever wrap comes back', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const planted = random(32)
    anna.hooks.after = (op) => {
      if (op !== 'create') return
      const [spaceId] = Object.keys(anna.store.getState().seeding)
      server.plantWrap(spaceId, memberIdOf(anna, spaceId), planted)
    }
    const puts = putsOf(anna)
    const { spaceId } = await anna.engine.shareCar('car-1')
    const made = anna.keyring.key(spaceId, 1)!
    expect(made).not.toEqual(planted)
    expect(failures(anna, 'key_mismatch')).toBe(1)
    expect(puts.length).toBeGreaterThan(0)
    expect(puts.every((r) => opensUnder(spaceId, r, made))).toBe(true)
    expect(storedUnder(spaceId, planted)).toEqual([])
    const joe = person('Joe')
    await joe.engine.joinCar(await invite(anna, spaceId, joe))
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })

  it('shares nothing under a key wrapped at a later epoch while it seeds, and finishes once the server tells the truth', async () => {
    const anna = person('Anna')
    ownCar(anna)
    const planted = random(32)
    anna.hooks.after = (op) => {
      if (op !== 'create') return
      const [spaceId] = Object.keys(anna.store.getState().seeding)
      server.plantWrap(spaceId, memberIdOf(anna, spaceId), planted, 2)
    }
    const puts = putsOf(anna)
    await expect(anna.engine.shareCar('car-1')).rejects.toMatchObject({
      code: 'key_unverified',
    })
    const [spaceId] = Object.keys(anna.store.getState().seeding)
    expect(puts).toEqual([])
    expect(anna.keyring.key(spaceId, 2)).toBeNull()
    // Still the User's own car, and the share waits to resume.
    expect(anna.personal().trips).toHaveLength(2)

    server.honest()
    anna.hooks.after = undefined
    await anna.engine.sync()
    expect(anna.store.getState().seeding).toEqual({})
    expect(anna.car(spaceId).trips).toHaveLength(2)
    expect(storedUnder(spaceId, planted)).toEqual([])
  })

  it('wraps no key to a member the server made up', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const phantom = deriveSpaceMember(random(32), spaceId)
    const phantomId = server.addPhantomMember(spaceId, phantom.dhPub)
    server.forceRekeyNeeded(spaceId)

    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    expect(server.state.rekeys).toEqual([])
    expect(server.spaces.get(spaceId)!.epoch).toBe(1)
    expect(anna.keyring.key(spaceId, 2)).toBeNull()
    expect(failures(anna, 'member_unverified')).toBe(1)
    await anna.engine.syncCar(spaceId)
    expect(failures(anna, 'member_unverified')).toBe(1)
    // People shows them as someone who joined, whom the owner can remove.
    expect(anna.car(spaceId).unnamedMembers.map((m) => m.memberId)).toEqual([
      phantomId,
    ])

    await anna.engine.removeMember(spaceId, phantomId)
    expect(server.state.rekeys).toHaveLength(1)
    expect(server.state.rekeys[0].epoch).toBe(2)
    expect([...server.state.rekeys[0].memberIds].sort()).toEqual(
      [memberIdOf(anna, spaceId), memberIdOf(joe, spaceId)].sort()
    )
    await joe.engine.syncCar(spaceId)
    expect(joe.keyring.key(spaceId, 2)).toEqual(anna.keyring.key(spaceId, 2))
  })
})

describe('the real key, on every device of the User', () => {
  it('opens the car through the User’s key check on another device that trusts no key yet', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    for (const [who, other] of [
      [joe, person('Joe', { seed: joe.seed })],
      [anna, person('Anna', { seed: anna.seed })],
    ] as const) {
      const at = who.store.getState().memberships.cars[spaceId].at
      expect(await other.engine.addCarFromRoster(spaceId, at)).toBe('synced')
      expect(other.keyring.key(spaceId, 1)).toEqual(
        anna.keyring.key(spaceId, 1)
      )
      expect(other.car(spaceId).trips).toHaveLength(2)
      expect(other.car(spaceId).sealedRecords).toEqual([])
    }
  })

  it('opens the car again after a reinstall, with or without its keyring', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const real = anna.keyring.key(spaceId, 1)!
    const at = joe.store.getState().memberships.cars[spaceId].at

    // The keyring outlived the app (iOS keeps it); the store didn't.
    await joe.relaunch({ store: true })
    expect(await joe.engine.addCarFromRoster(spaceId, at)).toBe('synced')
    expect(joe.car(spaceId).trips).toHaveLength(2)

    // A restore brought the store back without the keyring: its own record,
    // kept as sealed, vouches for the key again.
    editTrip(joe, spaceId, 'Joe')
    await joe.relaunch({ keyring: true })
    expect(joe.keyring.epochs(spaceId)).toEqual([])
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.keyring.key(spaceId, 1)).toEqual(real)
    await anna.engine.syncCar(spaceId)
    expect(tripOn(anna, spaceId, 'trip-1').note).toBe('Joe')

    // Neither.
    await joe.relaunch({ keyring: true, store: true })
    expect(await joe.engine.addCarFromRoster(spaceId, at)).toBe('synced')
    expect(joe.keyring.key(spaceId, 1)).toEqual(real)
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('Joe')
  })

  it('catches up across two rekeys through the key chain', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna, joe, cal, dee)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    editTrip(anna, spaceId, 'epoch 2')
    await anna.engine.syncCar(spaceId)
    await anna.engine.removeMember(spaceId, memberIdOf(dee, spaceId))
    editTrip(anna, spaceId, 'epoch 3')
    await anna.engine.syncCar(spaceId)
    expect(server.spaces.get(spaceId)!.epoch).toBe(3)

    // Joe was away for both.
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.keyring.key(spaceId, 3)).toEqual(anna.keyring.key(spaceId, 3))
    expect(joe.keyring.key(spaceId, 2)).toEqual(anna.keyring.key(spaceId, 2))
    expect(tripOn(joe, spaceId, 'trip-1').note).toBe('epoch 3')

    // His iPad, which trusts no key yet, follows the chain back to the epoch
    // his own record was sealed under.
    const joesIpad = person('Joe', { seed: joe.seed })
    const at = joe.store.getState().memberships.cars[spaceId].at
    expect(await joesIpad.engine.addCarFromRoster(spaceId, at)).toBe('synced')
    expect(joesIpad.keyring.epochs(spaceId).sort()).toEqual([1, 2, 3])
    expect(joesIpad.car(spaceId).sealedRecords).toEqual([])
    expect(tripOn(joesIpad, spaceId, 'trip-1').note).toBe('epoch 3')
  })

  it('trusts a rekey whose answer was lost through the link it carried', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    anna.loseNext('rekey')
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    expect(server.spaces.get(spaceId)!.epoch).toBe(2)
    expect(anna.keyring.key(spaceId, 2)).toBeNull()

    server.state.log.length = 0
    expect(await anna.engine.syncCar(spaceId)).toBe('synced')
    const second = anna.keyring.key(spaceId, 2)!
    expect(second).not.toBeNull()
    expect(server.state.log).not.toContain('rekey')
    await joe.engine.syncCar(spaceId)
    expect(joe.keyring.key(spaceId, 2)).toEqual(second)
  })

  it('opens the car on a joiner’s second device once the joiner’s member record lands', async () => {
    const anna = person('Anna')
    const dee = person('Dee')
    const deesIpad = person('Dee', { seed: dee.seed })
    const spaceId = await sharedCar(anna)
    // Dee joins, but her member record doesn't go out.
    dee.hooks.beforePut = () => {
      throw new Error('offline')
    }
    await dee.engine.joinCar(await invite(anna, spaceId, dee))
    dee.hooks.beforePut = undefined
    const at = dee.store.getState().memberships.cars[spaceId].at

    // Her iPad trusts no key, and nothing vouches for one yet.
    expect(await deesIpad.engine.addCarFromRoster(spaceId, at)).toBe('waiting')
    expect(deesIpad.keyring.epochs(spaceId)).toEqual([])
    expect(deesIpad.car(spaceId).trips).toEqual([])

    await dee.engine.syncCar(spaceId)
    expect(await deesIpad.engine.syncCar(spaceId)).toBe('synced')
    expect(deesIpad.keyring.key(spaceId, 1)).toEqual(
      anna.keyring.key(spaceId, 1)
    )
    expect(deesIpad.car(spaceId).trips).toHaveLength(2)
    expect(deesIpad.status.getState().cars[spaceId]).toMatchObject({
      waitingForKey: false,
    })

    // A second device that comes after the record landed opens it at once.
    const deesMac = person('Dee', { seed: dee.seed })
    expect(await deesMac.engine.addCarFromRoster(spaceId, at)).toBe('synced')
    expect(deesMac.car(spaceId).trips).toHaveLength(2)
  })
})

describe('the User’s own member record', () => {
  it('rewrites it when it was altered, with a check only the User can make', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const annaId = memberRecordId(memberIdOf(anna, spaceId))
    const key = joe.keyring.key(spaceId, 1)!
    const own = anna
      .car(spaceId)
      .memberRecords.find((m) => m.memberId === memberIdOf(anna, spaceId))!
    // Anna's record with another name, and the check it had.
    const stamp = (own.updatedAt ?? 0) + 1000
    const sealed = server.spaces.get(spaceId)!.records.get(annaId)!
    const { data } = openRecord(
      key,
      {
        spaceId,
        epoch: 1,
        recordId: annaId,
        deleted: false,
        stamp: sealed.stamp,
      },
      sealed.blob
    )
    const altered: SpacePutRecord = {
      recordId: annaId,
      epoch: 1,
      stamp,
      blob: sealRecord(
        key,
        { spaceId, epoch: 1, recordId: annaId, deleted: false, stamp },
        { kind: 'member', data: { ...data, name: 'Not Anna' } },
        random(24)
      ),
    }
    // The server keeps Joe from putting it, but it could store it itself.
    await expect(
      joe.raw.put(authOf(joe, spaceId), [altered])
    ).rejects.toMatchObject({ code: 'forbidden' })
    server.plantRecord(spaceId, altered)
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).members.map((m) => m.name)).toContain('Not Anna')

    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).ownRecordChecked).toBe(true)
    await joe.engine.syncCar(spaceId)
    expect(joe.car(spaceId).members.map((m) => m.name)).toEqual(['Anna', 'Joe'])
    const back = server.spaces.get(spaceId)!.records.get(annaId)!
    expect(back.stamp).toBeGreaterThan(stamp)
  })

  it('rewrites it past a newest version that doesn’t open, and vouches with the last that matched', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const real = anna.keyring.key(spaceId, 1)!
    const joeId = memberRecordId(memberIdOf(joe, spaceId))
    const matched = server.spaces.get(spaceId)!.records.get(joeId)!
    const stamp = matched.stamp + 1000
    server.plantRecord(spaceId, {
      recordId: joeId,
      epoch: 1,
      stamp,
      blob: unopenable(spaceId, joeId, 1, stamp),
    })
    // His phone pulls it, but can't put for now.
    putsOffline(joe)
    await expect(joe.engine.syncCar(spaceId)).rejects.toMatchObject({
      code: 'network',
    })
    const mine = joe
      .car(spaceId)
      .memberRecords.find((m) => m.memberId === memberIdOf(joe, spaceId))!
    expect(joe.car(spaceId).pendingPuts).toContain(joeId)
    expect(mine.updatedAt).toBeGreaterThan(stamp)
    expect(joe.car(spaceId).sealedOwnRecord?.stamp).toBe(matched.stamp)

    // A restore loses his keyring first: the version that matched vouches
    // for the key again, whatever the space holds.
    await joe.relaunch({ keyring: true })
    joe.hooks.beforePut = undefined
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.keyring.key(spaceId, 1)).toEqual(real)
    const back = server.spaces.get(spaceId)!.records.get(joeId)!
    expect(back.stamp).toBeGreaterThan(stamp)
    expect(opensUnder(spaceId, { recordId: joeId, ...back }, real)).toBe(true)
    // What it replaced isn't kept to read again.
    expect(joe.car(spaceId).unreadRecords).toEqual([])
    await joe.relaunch()
    server.state.log.length = 0
    await joe.engine.syncCar(spaceId)
    expect(server.state.log).not.toContain('put')
  })
})

describe('the key chain', () => {
  it('puts a link that holds the wrong key again, past it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    await joe.engine.syncCar(spaceId)
    const first = anna.keyring.key(spaceId, 1)!
    const second = anna.keyring.key(spaceId, 2)!
    const link = server.spaces.get(spaceId)!.records.get('k.2')!
    // Joe, at epoch 2, seals k.2 holding a key of his own, stamped later. Only
    // the owner may put a link, but the server could store his.
    const stamp = link.stamp + 1000
    const planted: SpacePutRecord = {
      recordId: 'k.2',
      epoch: 2,
      stamp,
      blob: sealRecord(
        second,
        { spaceId, epoch: 2, recordId: 'k.2', deleted: false, stamp },
        { kind: 'keys', data: keysRecordData(random(32)) },
        random(24)
      ),
    }
    await expect(
      joe.raw.put(authOf(joe, spaceId), [planted])
    ).rejects.toMatchObject({ code: 'forbidden' })
    server.plantRecord(spaceId, planted)

    // Joe's phone pulls it and then loses its keyring: the last version of
    // the link that counted still leads back to his own record.
    await joe.engine.syncCar(spaceId)
    await joe.relaunch({ keyring: true })
    expect(await joe.engine.syncCar(spaceId)).toBe('synced')
    expect(joe.keyring.key(spaceId, 1)).toEqual(first)
    expect(joe.keyring.key(spaceId, 2)).toEqual(second)

    await anna.engine.syncCar(spaceId)
    expect(anna.keyring.key(spaceId, 1)).toEqual(first)
    expect(failures(anna, 'key_mismatch')).toBe(1)
    const repaired = server.spaces.get(spaceId)!.records.get('k.2')!
    expect(repaired.stamp).toBeGreaterThan(stamp)
    const opened = openRecord(
      second,
      {
        spaceId,
        epoch: repaired.epoch,
        recordId: 'k.2',
        deleted: false,
        stamp: repaired.stamp,
      },
      repaired.blob
    )
    expect(readKeysData(opened.data ?? {})).toEqual(first)

    // A device of Joe's that trusts no key yet reads what came before.
    const joesIpad = person('Joe', { seed: joe.seed })
    const at = joe.store.getState().memberships.cars[spaceId].at
    expect(await joesIpad.engine.addCarFromRoster(spaceId, at)).toBe('synced')
    expect(joesIpad.keyring.key(spaceId, 1)).toEqual(first)
    expect(joesIpad.car(spaceId).trips).toHaveLength(2)
  })

  it('puts a link again past a newest version that doesn’t open', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)
    await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
    const first = anna.keyring.key(spaceId, 1)!
    const second = anna.keyring.key(spaceId, 2)!
    const stamp = server.spaces.get(spaceId)!.records.get('k.2')!.stamp + 1000
    server.plantRecord(spaceId, {
      recordId: 'k.2',
      epoch: 2,
      stamp,
      blob: unopenable(spaceId, 'k.2', 2, stamp),
    })

    await anna.engine.syncCar(spaceId)
    const repaired = server.spaces.get(spaceId)!.records.get('k.2')!
    expect(repaired.stamp).toBeGreaterThan(stamp)
    expect(
      openLink(spaceId, { recordId: 'k.2', ...repaired }, second)?.key
    ).toEqual(first)
    expect(anna.car(spaceId).unreadRecords).toEqual([])
  })
})

describe('an invitation’s key', () => {
  it('isn’t trusted for a car the User is on already unless their own wrap holds it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    const real = anna.keyring.key(spaceId, 1)!
    const planted = random(32)
    // Cal, on the car, invites Joe again with a key of his own: `conflict`.
    const bogus = {
      ...(await invite(cal, spaceId, joesIpad)),
      key: toB64u(planted),
    }
    const puts = putsOf(joesIpad)
    await joesIpad.engine.joinCar(bogus)
    expect(joesIpad.keyring.key(spaceId, 1)).toEqual(real)
    expect(joesIpad.car(spaceId).trips).toHaveLength(2)
    expect(puts.filter((r) => opensUnder(spaceId, r, planted))).toEqual([])
    expect(storedUnder(spaceId, planted)).toEqual([])
  })

  it('isn’t trusted when a sync finds the User on the car unless their own wrap holds it', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const joesIpad = person('Joe', { seed: joe.seed })
    const spaceId = await sharedCar(anna, joe, cal)
    const real = anna.keyring.key(spaceId, 1)!
    const planted = random(32)
    const bogus = {
      ...(await invite(cal, spaceId, joesIpad)),
      key: toB64u(planted),
    }
    // The join never reaches the server; the next sync finds him on the car.
    joesIpad.hooks.before = (op) => {
      if (op === 'join') throw new SpaceError('network')
    }
    await expect(joesIpad.engine.joinCar(bogus)).rejects.toMatchObject({
      code: 'network',
    })
    joesIpad.hooks.before = undefined
    const puts = putsOf(joesIpad)
    await joesIpad.engine.sync()
    expect(joesIpad.store.getState().joining).toEqual({})
    expect(joesIpad.keyring.key(spaceId, 1)).toEqual(real)
    expect(joesIpad.car(spaceId).trips).toHaveLength(2)
    expect(puts.filter((r) => opensUnder(spaceId, r, planted))).toEqual([])
    expect(storedUnder(spaceId, planted)).toEqual([])
  })

  it('is trusted once a join whose answer was lost is found to hold it, after a relaunch too', async () => {
    const anna = person('Anna')
    const dee = person('Dee')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, dee)
    dee.loseNext('join')
    await expect(dee.engine.joinCar(invitation)).rejects.toMatchObject({
      code: 'network',
    })
    // Nothing is trusted, or sealed, until the join is known to have landed.
    expect(dee.keyring.epochs(spaceId)).toEqual([])

    await dee.relaunch()
    expect(await dee.engine.sync()).toEqual({ [spaceId]: 'synced' })
    expect(dee.keyring.key(spaceId, 1)).toEqual(anna.keyring.key(spaceId, 1))
    expect(dee.car(spaceId).trips).toHaveLength(2)
    await anna.engine.syncCar(spaceId)
    expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
      'Anna',
      'Dee',
    ])
  })

  it('is joined only at its own epoch, so a wrong one leaves nothing behind', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna)
    const invitation = await invite(anna, spaceId, joe)
    await expect(
      joe.engine.joinCar({ ...invitation, epoch: 2 })
    ).rejects.toMatchObject({ code: 'stale_key' })
    expect(joe.car(spaceId)).toBeUndefined()
    expect(joe.store.getState().joining).toEqual({})
    expect(joe.keyring.epochs(spaceId)).toEqual([])

    await joe.engine.joinCar(invitation)
    expect(joe.car(spaceId).epoch).toBe(1)
    expect(joe.car(spaceId).trips).toHaveLength(2)
  })
})
