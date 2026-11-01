import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpaceError } from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  createFakeSpacesServer,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { fromUtf8 } from '@/features/buddies/lib/bytes'
import { open } from '@/features/buddies/lib/crypto'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import type { Roster } from '@/features/buddies/lib/schemas'
import { createBuddiesCarsLink } from '@/features/buddies/lib/sharedCarsLink'
import {
  incomingCarInviteKey,
  type BuddyNotification,
} from '@/features/buddies/lib/state'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import { pair, setup } from '@/features/buddies/lib/testing/engineHarness'
import {
  CarInvitationError,
  type CarInvitations,
  type CarInvitationsEvent,
  createCarInvitations,
} from '@/app/sharedCars/carInvitations'
import { hookClient, type SpaceOp } from '@/app/sharedCars/testing/enginePeople'
import { createHeadlessMember } from '@/app/sharedCars/testing/headlessMember'
import type { CarInvitePayload } from '@/types/sharedCars'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

let server: FakeSpacesServer

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  server = createFakeSpacesServer({ now: Date.now })
})

afterEach(() => {
  vi.restoreAllMocks()
})

type Env = ReturnType<typeof setup>

function person(
  env: Env,
  name: string,
  seed: Uint8Array = random(32),
  { running = true }: { running?: boolean } = {}
) {
  let invitations: CarInvitations | null = null
  const spacesOffline = new Set<SpaceOp>()
  let beforeSpacesOp: ((op: SpaceOp) => Promise<void> | void) | null = null
  const { client, loseNext } = hookClient(
    fakeSpacesClient(server, { randomBytes: random, accountKey: seed }).client,
    {
      before: async (op) => {
        if (spacesOffline.has(op)) throw new SpaceError('network')
        await beforeSpacesOp?.(op)
      },
    }
  )
  const car = createHeadlessMember({
    name,
    client,
    randomBytes: random,
    seed,
    inboxId: deriveIdentity(seed).inboxId,
    overrides: {
      onInviteReissued: (reissue) => invitations?.handleReissue(reissue),
      onJoinConfirmed: (joined) => invitations?.handleJoinConfirmed(joined),
    },
  })
  const link = createBuddiesCarsLink(car.store, {
    now: Date.now,
    forgetKeys: () => car.keyring.forgetAll(),
  })
  const buddies = env.user(name, undefined, seed, { cars: link.deps })
  const events: CarInvitationsEvent[] = []
  const errors: string[] = []
  invitations = createCarInvitations({
    engine: car.engine,
    buddies: buddies.engine,
    buddiesStore: buddies.store,
    store: car.store,
    running: () => running,
    now: Date.now,
    onEvent: (event) => events.push(event),
    onError: (_error, context) => errors.push(context),
  })
  link.setHandler(invitations.buddiesHandler)

  if (running)
    car.store.subscribe((state, previous) => {
      if (
        state.memberships !== previous.memberships &&
        !invitations?.isMergingRoster()
      )
        buddies.engine.noteCarMemberships()
    })

  const roster = (): Roster | null => {
    const stored = env.fake.inboxes.get(buddies.inboxId)?.roster
    if (!stored) return null
    const { rosterKey, inboxId } = deriveIdentity(seed)
    return JSON.parse(
      fromUtf8(open(rosterKey, stored.blob, `ww-buddies/v1/roster|${inboxId}`))
    )
  }

  const saveRoster = async (check: (roster: Roster | null) => void) => {
    buddies.engine.noteCarMemberships()
    for (const { run } of buddies.timers.splice(0)) run()
    await vi.waitFor(() => check(roster()))
  }
  return {
    ...buddies,
    name,
    car,
    invitations,
    events,
    errors,
    saveRoster,
    spacesOffline,

    loseNext,

    beforeSpacesOp: (hook: typeof beforeSpacesOp) => {
      beforeSpacesOp = hook
    },
  }
}

type Person = ReturnType<typeof person>

function ownCar({ car }: Person) {
  car.savePersonal('vehicles', { id: 'car-1', name: 'Mazda', createdAt: 1 })
  car.savePersonal('fuels', { id: 'fuel-1', name: 'Gasoline', createdAt: 1 })
  car.savePersonal('vehicleSetups', {
    id: 'setup-1',
    vehicleId: 'car-1',
    effectiveFrom: '2026-01-01',
    fuelId: 'fuel-1',
    milesPerGallon: 30,
  })
  for (const n of [1, 2])
    car.savePersonal('trips', {
      id: `trip-${n}`,
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: n,
      createdAt: 1,
    })
}

const carEntries = (who: Person): BuddyNotification[] =>
  who.store
    .getState()
    .notifications.filter(
      (n) => n.kind === 'carInvite' || n.kind === 'carJoined'
    )

const memberNames = (who: Person, spaceId: string) =>
  who.car.car(spaceId).members.map((m) => m.name)

const SPACES_OPS: SpaceOp[] = [
  'create',
  'sync',
  'put',
  'createInvite',
  'deleteInvite',
  'join',
  'leave',
  'removeMember',
  'rekey',
  'deleteSpace',
]

const carEventsTo = (env: Env, who: Person, kind: string) =>
  env.fake.inboxes.get(who.inboxId)!.events.filter((e) => e.kind === kind)

const relayRequests = (env: Env, op: string) =>
  env.fake.requests.filter((request) => request.op === op).length

async function annaAndJoe() {
  const env = setup({ start: Date.now() })
  const anna = person(env, 'Anna')
  const joe = person(env, 'Joe')
  await pair(anna, joe)
  ownCar(anna)
  const { spaceId } = await anna.car.engine.shareCar('car-1')
  const key = (inviteId: string) => incomingCarInviteKey(anna.inboxId, inviteId)
  return { env, anna, joe, spaceId, key }
}

async function joeInvited() {
  const context = await annaAndJoe()
  const { anna, joe, spaceId, key } = context
  const { inviteId } = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
  await joe.engine.sync()
  return { ...context, inviteId, invitation: key(inviteId) }
}

describe('sharing a car with a buddy', () => {
  it('invites, alerts by name, joins, and tells the inviter', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    expect(anna.invitations.carBuddies(spaceId)).toEqual([
      { inboxId: joe.inboxId, status: 'available' },
    ])

    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    expect(anna.events).toEqual([{ name: 'shared_car_invite_sent' }])

    expect(anna.car.car(spaceId).invites).toEqual([
      expect.objectContaining({
        inviteId,
        name: 'Joe',
        tag: memberTag(spaceId, joe.inboxId),
      }),
    ])
    expect(anna.invitations.carBuddies(spaceId)).toEqual([
      expect.objectContaining({ status: 'invited', inviteId, mine: true }),
    ])

    const pushed = env.fake.markers.filter(
      (m) => m.inboxId === joe.inboxId && m.marker.kind === 'car.invite'
    )
    expect(pushed).toHaveLength(1)
    await expect(joe.engine.describePush(pushed[0].marker)).resolves.toEqual({
      alert: { type: 'carInvite', name: 'Anna' },
    })

    await joe.engine.sync()
    expect(joe.store.getState().carInvites[key(inviteId)]).toMatchObject({
      name: 'Mazda',
      people: 1,
      status: 'pending',
    })
    expect(carEntries(joe)).toEqual([
      expect.objectContaining({ kind: 'carInvite', name: 'Anna' }),
    ])

    await expect(joe.invitations.join(key(inviteId))).resolves.toEqual({
      spaceId,
    })
    expect(joe.car.car(spaceId).trips).toHaveLength(2)
    expect(joe.store.getState().carInvites[key(inviteId)].status).toBe('joined')
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'joined' },
    ])

    const replies = env.fake.markers.filter(
      (m) => m.inboxId === anna.inboxId && m.marker.kind === 'car.reply'
    )
    await expect(anna.engine.describePush(replies[0].marker)).resolves.toEqual({
      alert: { type: 'carJoined', name: 'Joe' },
    })
    await anna.engine.sync()
    expect(carEntries(anna)).toEqual([
      expect.objectContaining({ kind: 'carJoined', name: 'Joe', spaceId }),
    ])
    await vi.waitFor(() =>
      expect(memberNames(anna, spaceId)).toEqual(['Anna', 'Joe'])
    )
    expect(anna.invitations.carBuddies(spaceId)).toEqual([
      expect.objectContaining({ status: 'onCar' }),
    ])
    expect([...anna.errors, ...joe.errors]).toEqual([])
  })

  it('refuses an invitation that can’t go, before asking anyone', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const cal = person(env, 'Cal')
    const refused = (spaceId: string, inboxId: string) =>
      anna.invitations.inviteBuddy(spaceId, inboxId).catch((error) => error)

    expect(await refused('AAAAAAAAAAAAAAAAAAAAAA', joe.inboxId)).toEqual(
      new CarInvitationError('not_found')
    )
    expect(await refused(spaceId, cal.inboxId)).toEqual(
      new CarInvitationError('not_buddy')
    )
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    expect(await refused(spaceId, joe.inboxId)).toEqual(
      new CarInvitationError('already_invited')
    )
    await joe.engine.sync()
    await joe.invitations.join(key(inviteId))
    await anna.car.engine.syncCar(spaceId)
    expect(await refused(spaceId, joe.inboxId)).toEqual(
      new CarInvitationError('already_on_car')
    )

    expect(
      env.fake.inboxes
        .get(joe.inboxId)!
        .events.filter((e) => e.kind === 'car.invite')
    ).toHaveLength(1)
  })

  it('closes a declined invitation on the car, with nothing listed', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.sync()
    await joe.invitations.decline(key(inviteId))
    expect(joe.store.getState().carInvites[key(inviteId)].status).toBe(
      'declined'
    )
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'declined' },
    ])

    expect(
      env.fake.pushes.filter(
        (p) => p.inboxId === anna.inboxId && p.kind === 'car.reply'
      )
    ).toEqual([])

    await anna.engine.sync()
    await vi.waitFor(() =>
      expect(server.spaces.get(spaceId)!.invites.has(inviteId)).toBe(false)
    )
    await vi.waitFor(() => expect(anna.car.car(spaceId).invites).toEqual([]))
    expect(carEntries(anna)).toEqual([])
    expect(anna.invitations.carBuddies(spaceId)).toEqual([
      { inboxId: joe.inboxId, status: 'available' },
    ])
  })

  it('keeps an invitation to answer when joining fails', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.sync()

    env.offlineOps.add('event/put')
    await expect(
      anna.invitations.cancelInvite(spaceId, inviteId)
    ).resolves.toEqual({ pending: false })
    expect(anna.events).toContainEqual({
      name: 'shared_car_invite_canceled',
      reason: 'user',
    })

    await expect(joe.invitations.join(key(inviteId))).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(joe.car.store.getState().cars).toEqual({})
    expect(joe.store.getState().carInvites[key(inviteId)].status).toBe(
      'pending'
    )
    expect(carEntries(joe)).toHaveLength(1)

    env.offlineOps.clear()
    await anna.engine.sync()
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[key(inviteId)].status).toBe(
      'cancelled'
    )
    expect(carEntries(joe)).toEqual([])
    await expect(joe.invitations.decline(key(inviteId))).rejects.toEqual(
      new CarInvitationError('not_found')
    )
  })

  it('sends a rekey’s new invitation in place of the closed one', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const dee = person(env, 'Dee')
    await pair(anna, dee)
    const toJoe = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    const toDee = await anna.invitations.inviteBuddy(spaceId, dee.inboxId)
    await dee.engine.sync()
    await dee.invitations.join(
      incomingCarInviteKey(anna.inboxId, toDee.inviteId)
    )
    await anna.car.engine.syncCar(spaceId)

    await anna.car.engine.removeMember(spaceId, dee.car.car(spaceId).myMemberId)
    const [reissued] = anna.car.car(spaceId).invites
    expect(reissued.inviteId).not.toBe(toJoe.inviteId)
    const toJoeOf = (kind: string) =>
      env.fake.inboxes.get(joe.inboxId)!.events.filter((e) => e.kind === kind)
    await vi.waitFor(() => expect(toJoeOf('car.invite')).toHaveLength(2))
    expect(toJoeOf('car.cancel')).toHaveLength(1)

    await joe.engine.sync()
    const { carInvites } = joe.store.getState()
    expect(carInvites[key(toJoe.inviteId)].status).toBe('cancelled')
    expect(carInvites[key(reissued.inviteId)].status).toBe('pending')
    expect(carEntries(joe).map((n) => n.shareKey)).toEqual([
      key(reissued.inviteId),
    ])
    await joe.invitations.join(key(reissued.inviteId))
    expect(joe.car.car(spaceId).epoch).toBe(2)
    expect(joe.car.car(spaceId).trips).toHaveLength(2)
  })
})

describe('when a buddy goes', () => {
  it('cancels the User’s open invitations to a buddy they remove', async () => {
    const { anna, joe, spaceId } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await anna.engine.removeBuddy(joe.inboxId)
    await vi.waitFor(() =>
      expect(server.spaces.get(spaceId)!.invites.has(inviteId)).toBe(false)
    )
    expect(anna.events).toContainEqual({
      name: 'shared_car_invite_canceled',
      reason: 'buddy_gone',
    })
    await joe.engine.sync()
    expect(joe.store.getState().carInvites).toEqual({})
    expect(carEntries(joe)).toEqual([])
  })

  it('cancels them when the buddy removes the User', async () => {
    const { anna, joe, spaceId } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.removeBuddy(anna.inboxId)
    await anna.engine.sync()
    await vi.waitFor(() =>
      expect(server.spaces.get(spaceId)!.invites.has(inviteId)).toBe(false)
    )
    expect(anna.store.getState().buddies).toEqual([])
  })
})

describe('the User’s other devices', () => {
  it('pick up a car shared or joined on one of them, with the answer', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await anna.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )

    const annasIpad = person(env, 'Anna', anna.seed)
    await annasIpad.engine.sync()
    await vi.waitFor(() =>
      expect(annasIpad.car.car(spaceId)?.trips).toHaveLength(2)
    )
    expect(annasIpad.car.car(spaceId).myMemberId).toBe(
      anna.car.car(spaceId).myMemberId
    )

    const joesIpad = person(env, 'Joe', joe.seed)
    await joe.engine.sync()
    await joesIpad.engine.sync()
    await joe.invitations.join(key(inviteId))
    await joe.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )
    await joesIpad.engine.sync()
    expect(joesIpad.store.getState().carInvites[key(inviteId)].status).toBe(
      'joined'
    )
    await vi.waitFor(() =>
      expect(joesIpad.car.car(spaceId)?.trips).toHaveLength(2)
    )

    expect(
      env.fake.inboxes
        .get(anna.inboxId)!
        .events.filter((e) => e.kind === 'car.reply')
    ).toHaveLength(1)
  })
})

describe('the end of Buddies', () => {
  it('leaves every car with Delete My Buddies Data, keeping a copy', async () => {
    const { anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.sync()
    await joe.invitations.join(key(inviteId))

    await joe.engine.deleteEverything()
    expect(joe.car.store.getState().cars).toEqual({})
    expect(joe.car.personal().trips).toHaveLength(2)

    expect(await anna.car.engine.syncCar(spaceId)).toBe('ended')
    expect(anna.car.outcomes).toContainEqual({
      type: 'ended',
      reason: 'last_member',
    })
  })

  it('signing out keeps the User on the cars, for their other devices', async () => {
    const { anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.sync()
    await joe.invitations.join(key(inviteId))

    await joe.engine.leaveThisDevice()
    expect(joe.car.store.getState().cars).toEqual({})

    expect(joe.car.personal().trips).toEqual([])
    await anna.car.engine.syncCar(spaceId)
    expect(memberNames(anna, spaceId)).toEqual(['Anna', 'Joe'])
  })
})

describe('inviting', () => {
  it('closes an invitation again when the buddy goes while it opens', async () => {
    const { env, anna, joe, spaceId } = await annaAndJoe()

    anna.beforeSpacesOp(async (op) => {
      if (op !== 'createInvite') return
      anna.beforeSpacesOp(null)
      await anna.engine.removeBuddy(joe.inboxId)
    })
    await expect(
      anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    ).rejects.toEqual(new CarInvitationError('not_buddy'))
    expect(anna.events).toEqual([])

    await vi.waitFor(() =>
      expect(server.spaces.get(spaceId)!.invites.size).toBe(0)
    )
    expect(anna.car.car(spaceId).invites).toEqual([])
    expect(carEventsTo(env, joe, 'car.invite')).toEqual([])
  })

  it('drops an invitation it couldn’t send once another device canceled it', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    await anna.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )
    const annasIpad = person(env, 'Anna', anna.seed)
    await annasIpad.engine.sync()
    await vi.waitFor(() => expect(annasIpad.car.car(spaceId)).toBeDefined())

    env.offlineOps.add('event/put')
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    env.offlineOps.clear()
    expect(Object.values(anna.store.getState().carEvents)).toEqual([
      expect.objectContaining({ kind: 'car.invite', inviteId }),
    ])

    await annasIpad.car.engine.syncCar(spaceId)
    await annasIpad.invitations.cancelInvite(spaceId, inviteId)

    await anna.car.engine.syncCar(spaceId)
    await anna.engine.sync()
    expect(anna.store.getState().carEvents).toEqual({})
    expect(carEventsTo(env, joe, 'car.invite')).toEqual([])
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[key(inviteId)].status).toBe(
      'cancelled'
    )
    expect(carEntries(joe)).toEqual([])
  })
})

describe('answering', () => {
  it('answers once for a second tap', async () => {
    const { env, anna, joe, spaceId, invitation } = await joeInvited()
    const first = joe.invitations.join(invitation)
    expect(joe.invitations.isAnswering(invitation)).toBe(true)
    await expect(joe.invitations.join(invitation)).rejects.toEqual(
      new CarInvitationError('answering')
    )
    await expect(joe.invitations.decline(invitation)).rejects.toEqual(
      new CarInvitationError('answering')
    )
    await expect(first).resolves.toEqual({ spaceId })
    expect(joe.invitations.isAnswering(invitation)).toBe(false)
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'joined' },
    ])
    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)
  })
})

describe('a join whose answer was lost', () => {
  it('counts as joined when the server took it', async () => {
    const { env, anna, joe, spaceId, invitation } = await joeInvited()
    joe.loseNext('join')
    await expect(joe.invitations.join(invitation)).resolves.toEqual({
      spaceId,
    })
    expect(joe.errors).toEqual(['join'])
    expect(joe.store.getState().carInvites[invitation].status).toBe('joined')
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'joined' },
    ])
    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)

    await joe.car.engine.syncCar(spaceId)
    expect(joe.car.car(spaceId).trips).toHaveLength(2)
  })

  it('keeps the invitation while that can’t be told, and Try Again joins, counted once', async () => {
    const { env, anna, joe, spaceId, invitation } = await joeInvited()
    joe.loseNext('join')
    joe.spacesOffline.add('sync')
    await expect(joe.invitations.join(invitation)).rejects.toMatchObject({
      code: 'network',
    })
    expect(joe.store.getState().carInvites[invitation].status).toBe('pending')
    expect(joe.events).toEqual([])
    expect(carEventsTo(env, anna, 'car.reply')).toEqual([])

    joe.spacesOffline.clear()
    await expect(joe.invitations.join(invitation)).resolves.toEqual({
      spaceId,
    })
    expect(joe.store.getState().carInvites[invitation].status).toBe('joined')
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'joined' },
    ])
    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)
    expect(joe.car.car(spaceId).trips).toHaveLength(2)
  })

  it('reads as joined, with no Decline, once a later sync finds it landed, and tells Anna then', async () => {
    const { env, anna, joe, spaceId, invitation } = await joeInvited()
    joe.loseNext('join')
    joe.spacesOffline.add('sync')
    await expect(joe.invitations.join(invitation)).rejects.toMatchObject({
      code: 'network',
    })

    joe.spacesOffline.clear()
    await joe.car.engine.sync()
    expect(joe.car.car(spaceId).trips).toHaveLength(2)
    await vi.waitFor(() =>
      expect(joe.store.getState().carInvites[invitation].status).toBe('joined')
    )

    await expect(joe.invitations.decline(invitation)).rejects.toEqual(
      new CarInvitationError('not_found')
    )
    joe.engine.expire()
    expect(carEntries(joe)).toEqual([
      expect.objectContaining({ kind: 'carInvite', read: true }),
    ])

    await joe.engine.sync()
    expect(joe.store.getState().carEvents).toEqual({})
    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)
    await anna.engine.sync()
    expect(
      carEntries(anna).filter((entry) => entry.kind === 'carJoined')
    ).toHaveLength(1)
    expect(joe.events).toEqual([
      { name: 'shared_car_invite_answered', answer: 'joined' },
    ])

    await joe.car.engine.sync()
    await joe.engine.sync()
    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)
    await anna.car.engine.syncCar(spaceId)
    expect(memberNames(anna, spaceId)).toEqual(['Anna', 'Joe'])
  })
})

describe('the User’s devices together', () => {
  it('drop a decline that never went once another device joined', async () => {
    const { env, anna, joe, spaceId, invitation } = await joeInvited()
    const joesIpad = person(env, 'Joe', joe.seed)
    await joesIpad.engine.sync()

    env.offlineOps.add('event/put')
    await joe.invitations.decline(invitation)
    env.offlineOps.clear()
    expect(Object.values(joe.store.getState().carEvents)).toEqual([
      expect.objectContaining({ kind: 'car.reply' }),
    ])

    env.advance(1000)
    await joesIpad.invitations.join(invitation)
    await joesIpad.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )

    const puts = relayRequests(env, 'event/put')
    await joe.engine.sync()
    expect(relayRequests(env, 'event/put')).toBe(puts)
    expect(joe.store.getState().carEvents).toEqual({})
    expect(joe.store.getState().carInvites[invitation].status).toBe('joined')
    await vi.waitFor(() => expect(joe.car.car(spaceId)?.trips).toHaveLength(2))

    expect(carEventsTo(env, anna, 'car.reply')).toHaveLength(1)
    await anna.car.engine.syncCar(spaceId)
    expect(memberNames(anna, spaceId)).toEqual(['Anna', 'Joe'])
    await vi.waitFor(() => expect(anna.car.car(spaceId).invites).toEqual([]))
  })

  it('keep a car joined again since another device left it, and settle', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()

    const dee = person(env, 'Dee')
    await pair(anna, dee)
    const toDee = await anna.invitations.inviteBuddy(spaceId, dee.inboxId)
    await dee.engine.sync()
    await dee.invitations.join(
      incomingCarInviteKey(anna.inboxId, toDee.inviteId)
    )
    const first = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    await joe.engine.sync()
    await joe.invitations.join(key(first.inviteId))
    await joe.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )
    const joesIpad = person(env, 'Joe', joe.seed)
    await joesIpad.engine.sync()
    await vi.waitFor(() =>
      expect(joesIpad.car.car(spaceId)?.trips).toHaveLength(2)
    )

    await joe.car.engine.leaveCar(spaceId)
    await anna.car.engine.syncCar(spaceId)
    const again = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    await joe.engine.sync()
    await joe.invitations.join(key(again.inviteId))
    await joe.saveRoster((roster) =>
      expect(roster!.cars[spaceId].at).toBeGreaterThan(
        roster!.leftCars[spaceId]
      )
    )

    await joesIpad.engine.sync()
    const { memberships } = joesIpad.car.store.getState()
    expect(memberships.leftCars).toHaveProperty(spaceId)
    expect(memberships.cars[spaceId].at).toBeGreaterThan(
      memberships.leftCars[spaceId]
    )
    expect(joesIpad.car.car(spaceId).trips).toHaveLength(2)
    expect(joesIpad.car.personal().trips).toEqual([])
    expect(joesIpad.car.store.getState().pendingEnds).toEqual({})

    const round = async () => {
      for (const device of [joe, joesIpad]) {
        await device.engine.sync()
        for (const { run } of device.timers.splice(0)) run()
        await vi.waitFor(() => expect(device.timers).toEqual([]))
      }
    }
    await round()
    const writes = relayRequests(env, 'roster/put')
    await round()
    await round()
    expect(relayRequests(env, 'roster/put')).toBe(writes)
    expect(joesIpad.car.store.getState().memberships).toEqual(
      joe.car.store.getState().memberships
    )
  })
})

describe('the end of Buddies, with Shared Cars off', () => {
  it('won’t delete Buddies data while a car only the roster knows isn’t left', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const { inviteId } = await anna.invitations.inviteBuddy(
      spaceId,
      joe.inboxId
    )
    await joe.engine.sync()
    await joe.invitations.join(key(inviteId))
    await joe.saveRoster((roster) =>
      expect(roster?.cars).toHaveProperty(spaceId)
    )

    const joesIpad = person(env, 'Joe', joe.seed, { running: false })
    await joesIpad.engine.sync()
    expect(joesIpad.car.store.getState().cars).toEqual({})
    expect(joesIpad.car.store.getState().memberships.cars).toHaveProperty(
      spaceId
    )

    for (const op of SPACES_OPS) joesIpad.spacesOffline.add(op)
    const refused = await joesIpad.engine
      .deleteEverything()
      .catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(BuddyRemovalPendingError)
    expect(refused).toMatchObject({ scope: 'everything', cars: [''] })
    expect(joesIpad.store.getState().buddies).toEqual([
      expect.objectContaining({ inboxId: anna.inboxId, status: 'active' }),
    ])
    expect(joesIpad.store.getState().registeredInboxId).toBe(joe.inboxId)
    expect(env.fake.inboxes.has(joe.inboxId)).toBe(true)
    await anna.car.engine.syncCar(spaceId)
    expect(memberNames(anna, spaceId)).toEqual(['Anna', 'Joe'])

    joesIpad.spacesOffline.clear()
    await joesIpad.engine.deleteEverything()
    expect(joesIpad.store.getState().buddies).toEqual([])
    expect(await anna.car.engine.syncCar(spaceId)).toBe('ended')
  })
})

describe('signing out, with what the server hasn’t heard', () => {
  it('waits for an invitation’s close, then sends its cancel before going', async () => {
    const { env, anna, joe, spaceId, invitation, inviteId } = await joeInvited()

    anna.spacesOffline.add('deleteInvite')
    env.offlineOps.add('event/put')
    await expect(
      anna.invitations.cancelInvite(spaceId, inviteId)
    ).resolves.toEqual({ pending: true })

    await expect(anna.engine.leaveThisDevice()).rejects.toBeInstanceOf(
      BuddyRemovalPendingError
    )
    expect(anna.store.getState().buddies).toHaveLength(1)
    expect(anna.car.store.getState().closingInvites).toHaveProperty(spaceId)
    expect(server.spaces.get(spaceId)!.invites.has(inviteId)).toBe(true)

    anna.spacesOffline.clear()
    env.offlineOps.clear()
    await anna.engine.leaveThisDevice()
    expect(server.spaces.get(spaceId)!.invites.has(inviteId)).toBe(false)
    expect(carEventsTo(env, joe, 'car.cancel')).toHaveLength(1)
    expect(anna.car.store.getState().cars).toEqual({})
    expect(server.spaces.has(spaceId)).toBe(true)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[invitation].status).toBe('cancelled')
    expect(carEntries(joe)).toEqual([])
  })
})

describe('what stays on the device', () => {
  const saved = (who: Person) =>
    JSON.stringify([
      who.store.getState(),
      who.car.store.getState(),
      who.car.status.getState(),
      who.car.personal(),
    ])

  it('keeps invitations’ secrets and keys out of every store that’s saved, from invite to answer', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    const cal = person(env, 'Cal')
    await pair(anna, cal)
    const created = vi.spyOn(anna.car.engine, 'createInvite')
    const everyone = [anna, joe, cal]
    const expectNoneSaved = async () => {
      const invites: CarInvitePayload[] = await Promise.all(
        created.mock.results.map((result) => result.value)
      )
      const secrets = invites.flatMap((i) => [i.joinSecret, i.key])
      expect(secrets).toHaveLength(4)
      for (const who of everyone)
        for (const secret of secrets) expect(saved(who)).not.toContain(secret)
    }

    env.offlineOps.add('event/put')
    const toJoe = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    const toCal = await anna.invitations.inviteBuddy(spaceId, cal.inboxId)
    expect(Object.values(anna.store.getState().carEvents)).toHaveLength(2)
    await expectNoneSaved()

    env.offlineOps.clear()
    await anna.engine.sync()
    expect(anna.store.getState().carEvents).toEqual({})
    await joe.engine.sync()
    await cal.engine.sync()
    expect(carEntries(joe)).toHaveLength(1)
    expect(carEntries(cal)).toHaveLength(1)
    await expectNoneSaved()

    await joe.invitations.join(key(toJoe.inviteId))
    await cal.invitations.decline(key(toCal.inviteId))
    await anna.engine.sync()
    expect(joe.car.car(spaceId)).toBeDefined()
    await expectNoneSaved()

    for (const who of everyone) {
      await who.inviteSecrets.flushed()
      expect(who.inviteSecretStorage.value()).toBeNull()
    }
    expect([...anna.errors, ...joe.errors, ...cal.errors]).toEqual([])
  })

  it('sends a new invitation in place of one whose secrets the device lost', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    env.offlineOps.add('event/put')
    const lost = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)

    anna.inviteSecrets.clear()
    env.offlineOps.clear()
    await anna.engine.sync()

    await vi.waitFor(() =>
      expect(carEventsTo(env, joe, 'car.invite')).toHaveLength(1)
    )
    expect(carEventsTo(env, joe, 'car.cancel')).toHaveLength(1)
    expect(server.spaces.get(spaceId)!.invites.has(lost.inviteId)).toBe(false)
    const [replacement] = anna.car.car(spaceId).invites
    expect(replacement).toMatchObject({ name: 'Joe' })
    expect(replacement.inviteId).not.toBe(lost.inviteId)

    await joe.engine.sync()
    expect(joe.store.getState().carInvites[key(lost.inviteId)].status).toBe(
      'cancelled'
    )
    expect(carEntries(joe).map((n) => n.shareKey)).toEqual([
      key(replacement.inviteId),
    ])
    await joe.invitations.join(key(replacement.inviteId))
    expect(joe.car.car(spaceId)).toBeDefined()
    expect([...anna.errors, ...joe.errors]).toEqual([])
  })

  it('keeps an invitation whose secrets the device lost owed until a sync sends it again', async () => {
    const { env, anna, joe, spaceId, key } = await annaAndJoe()
    env.offlineOps.add('event/put')
    const lost = await anna.invitations.inviteBuddy(spaceId, joe.inboxId)
    anna.inviteSecrets.clear()
    env.offlineOps.clear()

    for (const op of SPACES_OPS) anna.spacesOffline.add(op)
    await anna.engine.sync()
    await vi.waitFor(() => expect(anna.errors).toContain('car.invite'))
    expect(anna.car.car(spaceId).sentInvites[lost.inviteId]).toMatchObject({
      owed: true,
    })
    expect(anna.car.car(spaceId).invites.map((i) => i.inviteId)).toEqual([
      lost.inviteId,
    ])
    expect(carEventsTo(env, joe, 'car.invite')).toEqual([])

    anna.spacesOffline.clear()
    await anna.car.engine.sync()
    await vi.waitFor(() =>
      expect(carEventsTo(env, joe, 'car.invite')).toHaveLength(1)
    )
    expect(server.spaces.get(spaceId)!.invites.has(lost.inviteId)).toBe(false)
    const [replacement] = anna.car.car(spaceId).invites
    expect(replacement.inviteId).not.toBe(lost.inviteId)
    expect(anna.car.car(spaceId).sentInvites).toEqual({
      [replacement.inviteId]: { epoch: 1 },
    })
    await joe.engine.sync()
    await joe.invitations.join(key(replacement.inviteId))
    expect(joe.car.car(spaceId)).toBeDefined()
  })

  it('can’t join an invitation whose secrets the device lost, and drops it', async () => {
    const { joe, invitation } = await joeInvited()

    joe.inviteSecrets.clear()
    await expect(joe.invitations.join(invitation)).rejects.toEqual(
      new CarInvitationError('not_found')
    )
    expect(joe.store.getState().carInvites[invitation]).toBeUndefined()
    expect(carEntries(joe)).toEqual([])
    expect(joe.car.store.getState().cars).toEqual({})
    expect(joe.car.store.getState().joining).toEqual({})
    expect(joe.invitations.isAnswering(invitation)).toBe(false)
  })
})
