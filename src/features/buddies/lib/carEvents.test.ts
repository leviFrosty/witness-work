import { describe, expect, it, vi } from 'vitest'
import { fromB64u, fromUtf8, toB64u } from '@/features/buddies/lib/bytes'
import { open } from '@/features/buddies/lib/crypto'
import {
  type BuddiesCarsDeps,
  BuddyRemovalPendingError,
  type CarEventNotice,
  type LostCarInvite,
} from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { rosterSchema, type Roster } from '@/features/buddies/lib/schemas'
import {
  awaitsAnswer,
  type BuddyNotification,
  cappedQueue,
  incomingCarInviteKey,
  MAX_NOTIFICATIONS,
  MAX_ROSTER_PLAINTEXT_BYTES,
  pendingInviteNotificationId,
  receivedInviteSecretId,
  sentInviteSecretId,
  withoutStoredInviteSecrets,
} from '@/features/buddies/lib/state'
import {
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import {
  MAX_ROSTER_LEFT_CARS,
  mergeSharedCarMemberships,
  type OpenCarInvite,
} from '@/lib/mileage/sharedCar'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { inviteEventId } from '@/lib/sharedSpaces/crypto'
import {
  createInviteSecretStore,
  type InviteSecretStorage,
  memoryInviteSecretStorage,
} from '@/lib/sharedSpaces/deviceInviteSecrets'
import type { CarInvitePayload, SharedCarMemberships } from '@/types/sharedCars'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const DAY = 24 * 60 * 60 * 1000
const id = () => toB64u(random(16))

/** What a Buddies engine is told of Shared Cars, recorded. */
function carsStub() {
  const notices: CarEventNotice[] = []
  const gone: string[] = []
  /** Invitations this device sent that it couldn't send any more. */
  const lost: LostCarInvite[] = []
  const state = {
    memberships: { cars: {}, leftCars: {} } as SharedCarMemberships,
    openInvites: [] as OpenCarInvite[],
    replyApplies: true,
    /** Cars the User is on, by space. */
    onCars: new Set<string>(),
    /** Invitations closed on their car, by id. */
    closedInvites: new Set<string>(),
    pending: 0,
    notLeft: [] as { name: string }[],
    leftAll: 0,
    finished: 0,
    forgot: 0,
  }
  const deps: BuddiesCarsDeps = {
    memberships: () => state.memberships,
    mergeMemberships: (remote) => {
      state.memberships = mergeSharedCarMemberships(state.memberships, remote)
    },
    openInvitesTo: () => state.openInvites,
    replyApplies: () => state.replyApplies,
    isOnCar: (spaceId) => state.onCars.has(spaceId),
    inviteOpen: (_spaceId, inviteId) => !state.closedInvites.has(inviteId),
    onEvent: (notice) => notices.push(notice),
    onBuddyGone: (inboxId) => gone.push(inboxId),
    onInviteLost: (invite) => lost.push(invite),
    leaveAll: async () => {
      state.leftAll += 1
      return { pending: state.pending, notLeft: state.notLeft }
    },
    finishPending: async () => {
      state.finished += 1
      return { pending: state.pending }
    },
    forgetLocal: () => {
      state.forgot += 1
    },
  }
  return { deps, notices, gone, lost, state }
}

async function paired() {
  const env = setup()
  const annaCars = carsStub()
  const joeCars = carsStub()
  /** What each was told didn't go. */
  const notSent = {
    anna: [] as { reason: string; names: string[] }[],
    joe: [] as { reason: string; names: string[] }[],
  }
  const anna = env.user('Anna', undefined, undefined, {
    cars: annaCars.deps,
    onSharesNotSent: (report) => notSent.anna.push(report),
  })
  const joe = env.user('Joe', undefined, undefined, {
    cars: joeCars.deps,
    onSharesNotSent: (report) => notSent.joe.push(report),
  })
  await pair(anna, joe)
  /** The relay's account for a person, to suspend it. */
  const account = (who: { seed: Uint8Array }) =>
    [...env.fake.accounts.values()].find(
      (candidate) =>
        candidate.accountPub === deriveAccountSigningKey(who.seed).publicKey
    )!
  const invitation = (fields: Partial<CarInvitePayload> = {}) => ({
    spaceId: id(),
    inviteId: id(),
    joinSecret: toB64u(random(32)),
    epoch: 1,
    key: toB64u(random(32)),
    name: 'Mazda CX-5',
    people: 1,
    expiresAt: env.now() + 7 * DAY,
    ...fields,
  })
  const keyOf = (invite: CarInvitePayload) =>
    incomingCarInviteKey(anna.inboxId, invite.inviteId)
  /** Events stored in an inbox, by kind. */
  const stored = (inboxId: string, kind: string) =>
    env.fake.inboxes.get(inboxId)!.events.filter((e) => e.kind === kind)
  const pushed = (inboxId: string, kind: string) =>
    env.fake.pushes.filter((p) => p.inboxId === inboxId && p.kind === kind)
  return {
    ...env,
    anna,
    joe,
    annaCars,
    joeCars,
    notSent,
    account,
    invitation,
    keyOf,
    stored,
    pushed,
  }
}

const carEntries = (notifications: BuddyNotification[]) =>
  notifications.filter((n) => n.kind === 'carInvite' || n.kind === 'carJoined')

describe('sending car events', () => {
  it('saves an invitation first and retries it until the relay takes it', async () => {
    const { anna, joe, invitation, offlineOps, stored, pushed } = await paired()
    const invite = invitation()
    offlineOps.add('event/put')
    await expect(anna.engine.sendCarInvite(joe.inboxId, invite)).resolves.toBe(
      true
    )
    expect(Object.values(anna.store.getState().carEvents)).toEqual([
      expect.objectContaining({
        kind: 'car.invite',
        to: joe.inboxId,
        push: true,
        attempted: true,
      }),
    ])
    expect(stored(joe.inboxId, 'car.invite')).toEqual([])

    offlineOps.clear()
    await anna.engine.sync()
    expect(anna.store.getState().carEvents).toEqual({})
    // Stable, so a retry or another device's send is the same event.
    expect(stored(joe.inboxId, 'car.invite')).toEqual([
      expect.objectContaining({
        eventId: inviteEventId(
          'car.invite',
          anna.inboxId,
          joe.inboxId,
          invite.inviteId
        ),
      }),
    ])
    expect(pushed(joe.inboxId, 'car.invite')).toHaveLength(1)
  })

  it('counts against the hourly share budget, and needs no cancel for one never sent', async () => {
    const { anna, joe, invitation, advance, stored } = await paired()
    const invites = Array.from({ length: 31 }, () => invitation())
    for (const invite of invites)
      await anna.engine.sendCarInvite(joe.inboxId, invite)
    expect(stored(joe.inboxId, 'car.invite')).toHaveLength(30)
    const [waiting] = Object.values(anna.store.getState().carEvents)
    expect(waiting).toMatchObject({ inviteId: invites[30].inviteId })
    expect(waiting.attempted).toBeUndefined()

    // Canceled before it went: there's nothing to take back.
    await anna.engine.sendCarCancel(joe.inboxId, invites[30])
    expect(anna.store.getState().carEvents).toEqual({})

    // A cancel waits for room in the next hour, like any share event.
    await anna.engine.sendCarCancel(joe.inboxId, invites[0])
    expect(stored(joe.inboxId, 'car.cancel')).toEqual([])
    advance(60 * 60 * 1000 + 1)
    await anna.engine.sync()
    expect(stored(joe.inboxId, 'car.cancel')).toHaveLength(1)
    expect(anna.store.getState().carEvents).toEqual({})
  })

  it('forgets a buddy who left when a send finds them gone', async () => {
    const { anna, joe, annaCars, invitation } = await paired()
    await joe.engine.removeBuddy(anna.inboxId)
    await anna.engine.sendCarInvite(joe.inboxId, invitation())
    expect(anna.store.getState().buddies).toEqual([])
    expect(anna.store.getState().carEvents).toEqual({})
    expect(annaCars.gone).toContain(joe.inboxId)
  })

  it('sends nothing to someone who isn’t an active buddy, and says so', async () => {
    const { user, anna, invitation, fake } = await paired()
    const cal = user('Cal')
    // The caller closes the invitation it opened: nobody would hear of it.
    await expect(
      anna.engine.sendCarInvite(cal.inboxId, invitation())
    ).resolves.toBe(false)
    expect(anna.store.getState().carEvents).toEqual({})
    expect(fake.inboxes.get(cal.inboxId)).toBeUndefined()
  })

  it('drops an invitation that closed on the car before it went', async () => {
    const { anna, joe, annaCars, invitation, offlineOps, stored } =
      await paired()
    const invite = invitation()
    offlineOps.add('event/put')
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    // Canceled on another of Anna's devices, say, which this one's car shows.
    annaCars.state.closedInvites.add(invite.inviteId)
    offlineOps.clear()
    await anna.engine.sync()
    expect(anna.store.getState().carEvents).toEqual({})
    expect(stored(joe.inboxId, 'car.invite')).toEqual([])
  })

  it('drops an invitation refused while suspended, saying so, and retries a cancel', async () => {
    const { anna, joe, invitation, account, notSent, stored, advance } =
      await paired()
    account(anna).status = 'suspended'
    await anna.engine.sendCarInvite(joe.inboxId, invitation())
    // Not held for after the suspension; the car's invitation lapses.
    expect(anna.store.getState().carEvents).toEqual({})
    expect(notSent.anna).toEqual([{ reason: 'suspended', names: ['Joe'] }])

    // A cancel only takes back what Joe has, so it waits.
    await anna.engine.sendCarCancel(joe.inboxId, invitation())
    expect(Object.values(anna.store.getState().carEvents)).toEqual([
      expect.objectContaining({ kind: 'car.cancel', attempted: true }),
    ])
    account(anna).status = 'active'
    advance(60_000)
    await anna.engine.sync()
    expect(anna.store.getState().carEvents).toEqual({})
    expect(stored(joe.inboxId, 'car.invite')).toEqual([])
    expect(stored(joe.inboxId, 'car.cancel')).toHaveLength(1)
    expect(notSent.anna).toHaveLength(1)
  })

  it('drops any event whose inbox is gone, saying so of an invitation', async () => {
    const { fake, anna, joe, invitation, keyOf, notSent } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()

    // Each one's inbox goes (wiped by the relay, say) before the next send.
    fake.inboxes.delete(joe.inboxId)
    await anna.engine.sendCarInvite(joe.inboxId, invitation())
    await anna.engine.sendCarCancel(joe.inboxId, invite)
    expect(anna.store.getState().carEvents).toEqual({})
    expect(notSent.anna).toEqual([{ reason: 'gone', names: ['Joe'] }])

    fake.inboxes.delete(anna.inboxId)
    await joe.engine.answerCarInvite(keyOf(invite), 'declined')
    expect(joe.store.getState().carEvents).toEqual({})
    expect(notSent.joe).toEqual([])
  })
})

describe('receiving car events', () => {
  it('lists an invitation, alerting, to answer in the bell', async () => {
    const { anna, joe, joeCars, invitation, keyOf } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    const received = joe.store.getState().carInvites[keyOf(invite)]
    expect(received).toMatchObject({
      from: anna.inboxId,
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      name: 'Mazda CX-5',
      people: 1,
      status: 'pending',
      join: { epoch: 1 },
    })
    // What joining takes is kept on the device, apart from the invitation.
    await expect(joe.engine.carInviteSecrets(keyOf(invite))).resolves.toEqual({
      joinSecret: invite.joinSecret,
      key: invite.key,
    })
    expect(carEntries(joe.store.getState().notifications)).toEqual([
      expect.objectContaining({
        kind: 'carInvite',
        from: anna.inboxId,
        name: 'Anna',
        shareKey: keyOf(invite),
        read: false,
      }),
    ])
    expect(joeCars.notices).toEqual([
      {
        kind: 'car.invite',
        from: anna.inboxId,
        spaceId: invite.spaceId,
        inviteId: invite.inviteId,
      },
    ])
  })

  it('handles each event once, even reading the inbox from the start again', async () => {
    const { anna, joe, joeCars, invitation, keyOf } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'declined')
    const before = joe.store.getState()

    joe.store.setState({ syncSeq: 0 })
    await joe.engine.sync()
    expect(joe.store.getState().carInvites).toEqual(before.carInvites)
    expect(carEntries(joe.store.getState().notifications)).toEqual(
      carEntries(before.notifications)
    )
    expect(joeCars.notices).toHaveLength(1)
  })

  it('ignores events from anyone but an active buddy', async () => {
    const { anna, joe, joeCars, invitation } = await paired()
    await anna.engine.sendCarInvite(joe.inboxId, invitation())
    // Anna's confirmation not applied here yet; the relay's roster, which
    // says otherwise, is older than this device's.
    joe.store.setState((state) => ({
      buddies: state.buddies.map((b) => ({
        ...b,
        status: 'awaitingConfirm' as const,
        expiresAt: state.lastSyncAt + 7 * DAY,
      })),
      rosterVersion: state.rosterVersion + 100,
    }))
    await joe.engine.sync()
    expect(joe.store.getState().buddies[0].status).toBe('awaitingConfirm')
    expect(joe.store.getState().carInvites).toEqual({})
    expect(carEntries(joe.store.getState().notifications)).toEqual([])
    expect(joeCars.notices).toEqual([])
  })

  it('lists invitations already read on a device’s first sync', async () => {
    const { user, anna, joe, invitation, keyOf } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const joesIpad = user('Joe', undefined, joe.seed, {
      cars: carsStub().deps,
    })
    await joesIpad.engine.sync()
    expect(joesIpad.store.getState().carInvites[keyOf(invite)].status).toBe(
      'pending'
    )
    expect(carEntries(joesIpad.store.getState().notifications)).toEqual([
      expect.objectContaining({ kind: 'carInvite', read: true }),
    ])
  })

  it('drops a canceled invitation with its alert, but not once joined', async () => {
    const { anna, joe, invitation, keyOf } = await paired()
    const first = invitation()
    const second = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, first)
    await anna.engine.sendCarInvite(joe.inboxId, second)
    await joe.engine.sync()
    const seqs = (invite: CarInvitePayload) =>
      joe.store.getState().carInvites[keyOf(invite)].alertSeqs!
    const firstSeqs = seqs(first)

    await joe.engine.answerCarInvite(keyOf(second), 'joined')
    await anna.engine.sendCarCancel(joe.inboxId, first)
    await anna.engine.sendCarCancel(joe.inboxId, second)
    await joe.engine.sync()
    const { carInvites, notifications } = joe.store.getState()
    expect(carInvites[keyOf(first)].status).toBe('cancelled')
    expect(carInvites[keyOf(first)].join).toBeUndefined()
    expect(joe.dismissed).toContainEqual(firstSeqs)
    // Joined already: the cancel came too late to matter.
    expect(carInvites[keyOf(second)].status).toBe('joined')
    expect(carEntries(notifications).map((n) => n.shareKey)).toEqual([
      keyOf(second),
    ])
  })

  it('takes an invitation sent again (after a rekey) in place of the open one', async () => {
    const { anna, joe, invitation, keyOf } = await paired()
    const first = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, first)
    await joe.engine.sync()
    joe.engine.markNotificationsRead()
    const firstSeqs = joe.store.getState().carInvites[keyOf(first)].alertSeqs

    // The new invitation landed first (its cancel was retried).
    const again = invitation({ spaceId: first.spaceId })
    await anna.engine.sendCarInvite(joe.inboxId, again)
    await anna.engine.sendCarCancel(joe.inboxId, first)
    await joe.engine.sync()
    let state = joe.store.getState()
    expect(state.carInvites[keyOf(first)].status).toBe('cancelled')
    expect(state.carInvites[keyOf(again)].status).toBe('pending')
    expect(joe.dismissed).toContainEqual(firstSeqs)
    // Seen once already: the replacement doesn't call for attention again.
    expect(carEntries(state.notifications)).toEqual([
      expect.objectContaining({ shareKey: keyOf(again), read: true }),
    ])

    // The usual order, cancel first: the alert goes, and the new one alerts.
    const third = invitation({ spaceId: first.spaceId })
    await anna.engine.sendCarCancel(joe.inboxId, again)
    await anna.engine.sendCarInvite(joe.inboxId, third)
    await joe.engine.sync()
    state = joe.store.getState()
    expect(state.carInvites[keyOf(again)].status).toBe('cancelled')
    expect(carEntries(state.notifications)).toEqual([
      expect.objectContaining({ shareKey: keyOf(third), read: false }),
    ])
  })

  it('holds an invitation in the bell until it’s answered or lapses', async () => {
    const { anna, joe, invitation, keyOf, advance } = await paired()
    const invite = invitation({ expiresAt: Date.now() + 2 * DAY })
    await anna.engine.sendCarInvite(joe.inboxId, {
      ...invite,
      expiresAt: joe.store.getState().lastSyncAt + 2 * DAY,
    })
    await joe.engine.sync()
    const state = () => joe.store.getState()
    const [entry] = carEntries(state().notifications)
    const now = state().lastSyncAt
    expect(awaitsAnswer(entry, state(), now)).toBe(true)

    // Not dismissed, and not evicted by a full queue.
    joe.engine.dismissNotification(entry.id)
    expect(carEntries(state().notifications)).toHaveLength(1)
    const older = Array.from(
      { length: MAX_NOTIFICATIONS + 5 },
      (_, n): BuddyNotification => ({
        id: id(),
        kind: 'paired',
        at: now + n + 1,
        read: true,
        name: 'Someone',
      })
    )
    expect(
      cappedQueue([...older, entry], state(), now).map((n) => n.id)
    ).toContain(entry.id)

    // An entry that was lost is listed again while it can be answered.
    joe.store.setState({ notifications: [] })
    joe.engine.expire()
    expect(carEntries(state().notifications)).toEqual([
      expect.objectContaining({
        id: pendingInviteNotificationId(keyOf(invite)),
        kind: 'carInvite',
      }),
    ])

    // It lapses: the invitation and its entry go, with its alert.
    const { alertSeqs } = state().carInvites[keyOf(invite)]
    advance(3 * DAY)
    joe.engine.expire()
    expect(state().carInvites).toEqual({})
    expect(carEntries(state().notifications)).toEqual([])
    expect(joe.dismissed).toEqual([alertSeqs])
  })

  it('doesn’t list an invitation that lapsed before it arrived', async () => {
    const { anna, joe, joeCars, invitation, now, advance } = await paired()
    await anna.engine.sendCarInvite(
      joe.inboxId,
      invitation({ expiresAt: now() + 60_000 })
    )
    advance(2 * 60_000)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites).toEqual({})
    expect(carEntries(joe.store.getState().notifications)).toEqual([])
    expect(joeCars.notices).toEqual([])
  })

  it('keeps an invitation 7 days and 5 minutes at most, whatever it says', async () => {
    const { anna, joe, invitation, keyOf, now, advance } = await paired()
    const invite = invitation({ expiresAt: now() + 365 * DAY })
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    advance(60_000)
    await joe.engine.sync()
    const receivedAt = now()
    expect(joe.store.getState().carInvites[keyOf(invite)]).toMatchObject({
      status: 'pending',
      receivedAt,
      expiresAt: receivedAt + 7 * DAY + 5 * 60_000,
    })
    advance(7 * DAY + 5 * 60_000)
    joe.engine.expire()
    expect(joe.store.getState().carInvites).toEqual({})
    expect(carEntries(joe.store.getState().notifications)).toEqual([])
  })

  it('never lists an invitation whose cancel came first', async () => {
    const { user, anna, joe, invitation, keyOf } = await paired()
    const invite = invitation()
    // Anna's iPad cancels the invitation before her phone's goes out.
    const annasIpad = user('Anna', undefined, anna.seed, {
      cars: carsStub().deps,
    })
    await annasIpad.engine.sync()
    await annasIpad.engine.sendCarCancel(joe.inboxId, invite)
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    const listed = () => ({
      status: joe.store.getState().carInvites[keyOf(invite)].status,
      entries: carEntries(joe.store.getState().notifications),
    })
    expect(listed()).toEqual({ status: 'cancelled', entries: [] })

    // Nor when the inbox is read from the start again.
    joe.store.setState({ syncSeq: 0, seenCarEvents: {} })
    await joe.engine.sync()
    expect(listed()).toEqual({ status: 'cancelled', entries: [] })
  })

  it('reads an invitation to a car the User is on as joined, sending nothing', async () => {
    const { anna, joe, joeCars, invitation, keyOf, stored } = await paired()
    const first = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, first)
    await joe.engine.sync()
    const [entry] = carEntries(joe.store.getState().notifications)

    // The roster brought the car (joined on another of Joe's devices) before
    // that device's answer.
    joeCars.state.onCars.add(first.spaceId)
    joe.engine.expire()
    expect(joe.store.getState().carInvites[keyOf(first)]).toMatchObject({
      status: 'joined',
    })
    expect(joe.store.getState().carInvites[keyOf(first)].join).toBeUndefined()
    expect(carEntries(joe.store.getState().notifications)).toEqual([
      expect.objectContaining({ id: entry.id, read: true }),
    ])
    // Answered, so it no longer holds the bell.
    joe.engine.dismissNotification(entry.id)
    expect(carEntries(joe.store.getState().notifications)).toEqual([])

    // One that arrives for it is listed as joined, already read.
    const again = invitation({ spaceId: first.spaceId })
    await anna.engine.sendCarInvite(joe.inboxId, again)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(again)]).toMatchObject({
      status: 'joined',
    })
    expect(carEntries(joe.store.getState().notifications)).toEqual([
      expect.objectContaining({ shareKey: keyOf(again), read: true }),
    ])
    // The device that joined answers; this one sends nothing.
    expect(joe.store.getState().carEvents).toEqual({})
    expect(stored(anna.inboxId, 'car.reply')).toEqual([])
  })
})

describe('answering a car invitation', () => {
  it('joined: alerts the inviter, whose bell lists it', async () => {
    const { anna, joe, annaCars, invitation, keyOf, pushed } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'joined')
    const answered = joe.store.getState().carInvites[keyOf(invite)]
    expect(answered.status).toBe('joined')
    expect(answered.join).toBeUndefined()
    expect(carEntries(joe.store.getState().notifications)[0].read).toBe(true)
    expect(pushed(anna.inboxId, 'car.reply')).toHaveLength(1)

    await anna.engine.sync()
    expect(annaCars.notices).toContainEqual({
      kind: 'car.reply',
      from: joe.inboxId,
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      status: 'joined',
    })
    expect(carEntries(anna.store.getState().notifications)).toEqual([
      expect.objectContaining({
        kind: 'carJoined',
        from: joe.inboxId,
        name: 'Joe',
        spaceId: invite.spaceId,
        read: false,
      }),
    ])
  })

  it('declined: tells the inviter quietly, with no entry', async () => {
    const { anna, joe, annaCars, invitation, keyOf, pushed, stored } =
      await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'declined')
    expect(stored(anna.inboxId, 'car.reply')).toHaveLength(1)
    expect(pushed(anna.inboxId, 'car.reply')).toEqual([])
    await anna.engine.sync()
    expect(annaCars.notices).toContainEqual(
      expect.objectContaining({ kind: 'car.reply', status: 'declined' })
    )
    expect(carEntries(anna.store.getState().notifications)).toEqual([])
  })

  it('ignores a reply that isn’t about an invitation to that buddy', async () => {
    const { anna, joe, annaCars, invitation, keyOf } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'joined')
    annaCars.state.replyApplies = false
    await anna.engine.sync()
    expect(annaCars.notices).toEqual([])
    expect(carEntries(anna.store.getState().notifications)).toEqual([])
  })

  it('takes another device’s newer answer, dropping the reply waiting here', async () => {
    const { user, anna, joe, invitation, keyOf, offlineOps, advance, stored } =
      await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const joesIpad = user('Joe', undefined, joe.seed, {
      cars: carsStub().deps,
    })
    await joesIpad.engine.sync()
    await joe.engine.sync()

    // Joe's phone declines while it can't send; then his iPad joins.
    offlineOps.add('event/put')
    await joe.engine.answerCarInvite(keyOf(invite), 'declined')
    expect(Object.values(joe.store.getState().carEvents)).toEqual([
      expect.objectContaining({ kind: 'car.reply' }),
    ])
    advance(1000)
    await joesIpad.engine.answerCarInvite(keyOf(invite), 'joined')
    for (const { run } of joesIpad.timers.splice(0)) run()
    offlineOps.clear()

    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)].status).toBe('joined')
    expect(joe.store.getState().carEvents).toEqual({})
    await joesIpad.engine.sync()
    expect(joesIpad.store.getState().carInvites[keyOf(invite)].status).toBe(
      'joined'
    )
    expect(joesIpad.store.getState().carEvents).toEqual({})
    // Anna hears once, that Joe joined.
    await anna.engine.sync()
    expect(stored(anna.inboxId, 'car.reply')).toHaveLength(1)
    expect(carEntries(anna.store.getState().notifications)).toEqual([
      expect.objectContaining({ kind: 'carJoined', from: joe.inboxId }),
    ])
  })

  it('answers, once, an invitation a confirmed join already settled', async () => {
    const { anna, joe, joeCars, invitation, keyOf, pushed } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()

    // The join landed with its answer lost: once the car is here, the
    // invitation reads as joined, with nothing sent.
    joeCars.state.onCars.add(invite.spaceId)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)].status).toBe('joined')
    expect(pushed(anna.inboxId, 'car.reply')).toEqual([])

    // Only the device's own confirmed join answers it, and only once.
    expect(await joe.engine.answerCarInvite(keyOf(invite), 'joined')).toBe(
      false
    )
    expect(
      await joe.engine.answerCarInvite(keyOf(invite), 'declined', {
        confirmedJoin: true,
      })
    ).toBe(false)
    expect(
      await joe.engine.answerCarInvite(keyOf(invite), 'joined', {
        confirmedJoin: true,
      })
    ).toBe(true)
    expect(
      await joe.engine.answerCarInvite(keyOf(invite), 'joined', {
        confirmedJoin: true,
      })
    ).toBe(false)
    expect(pushed(anna.inboxId, 'car.reply')).toHaveLength(1)
  })

  it('doesn’t answer a confirmed join another device already answered', async () => {
    const { user, anna, joe, invitation, keyOf, stored } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const joesIpadCars = carsStub()
    const joesIpad = user('Joe', undefined, joe.seed, {
      cars: joesIpadCars.deps,
    })
    await joesIpad.engine.sync()
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'joined')
    for (const { run } of joe.timers.splice(0)) run()
    await joe.engine.sync()

    // The iPad gets the answer, then its own lost join is confirmed.
    joesIpadCars.state.onCars.add(invite.spaceId)
    await joesIpad.engine.sync()
    expect(
      await joesIpad.engine.answerCarInvite(keyOf(invite), 'joined', {
        confirmedJoin: true,
      })
    ).toBe(false)
    expect(stored(anna.inboxId, 'car.reply')).toHaveLength(1)
  })

  it('shows an answer on the User’s other devices, sent by one', async () => {
    const { user, anna, joe, invitation, keyOf, stored } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const joesIpad = user('Joe', undefined, joe.seed, {
      cars: carsStub().deps,
    })
    await joesIpad.engine.sync()
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'joined')
    // The roster carries the answer.
    for (const { run } of joe.timers.splice(0)) run()
    await joe.engine.sync()
    await joesIpad.engine.sync()
    expect(joesIpad.store.getState().carInvites[keyOf(invite)].status).toBe(
      'joined'
    )
    expect(joesIpad.store.getState().carEvents).toEqual({})
    expect(stored(anna.inboxId, 'car.reply')).toHaveLength(1)
  })
})

describe('Shared Cars and the end of Buddies', () => {
  it('cancels this User’s open invitations to a buddy they remove', async () => {
    const { fake, anna, joe, annaCars, invitation } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    annaCars.state.openInvites = [{ ...invite, tag: 'T'.repeat(22) }]
    const sent = fake.requests.length
    await anna.engine.removeBuddy(joe.inboxId)
    // Told while they could still be: before the pairing ended.
    expect(
      fake.requests
        .slice(sent)
        .map(({ op, body }) =>
          op === 'event/put'
            ? JSON.parse(
                fromUtf8(fromB64u((body as { payload: string }).payload))
              ).kind
            : op
        )
    ).toEqual(['car.cancel', 'slot/remove', 'slot/leave', 'roster/put'])
    expect(annaCars.gone).toEqual([joe.inboxId])
    expect(anna.store.getState().carEvents).toEqual({})
    expect(annaCars.state.leftAll).toBe(0)
  })

  it('leaves every car before Delete My Buddies Data, and waits for them', async () => {
    const { fake, anna, joe, annaCars } = await paired()
    // One the server hasn't heard leave, and one it can't name (never synced
    // here).
    annaCars.state.pending = 2
    annaCars.state.notLeft = [{ name: 'Mazda CX-5' }]
    const refused = await anna.engine.deleteEverything().catch((e) => e)
    expect(refused).toBeInstanceOf(BuddyRemovalPendingError)
    expect(refused).toMatchObject({
      scope: 'everything',
      cars: ['Mazda CX-5', ''],
    })
    expect(annaCars.state.leftAll).toBe(1)
    // It stopped there: no buddy removed, nothing wiped, the seed kept.
    expect(anna.store.getState().buddies).toEqual([
      expect.objectContaining({ inboxId: joe.inboxId, status: 'active' }),
    ])
    expect(anna.store.getState().pendingRemovals).toEqual([])
    expect(fake.inboxes.has(anna.inboxId)).toBe(true)

    annaCars.state.pending = 0
    annaCars.state.notLeft = []
    await anna.engine.deleteEverything()
    expect(annaCars.state.leftAll).toBe(2)
    expect(annaCars.state.forgot).toBe(1)
    expect(anna.store.getState().registeredInboxId).toBeNull()
  })

  it('finishes the leaves it owes before signing out, keeping the cars for other devices', async () => {
    const { anna, annaCars } = await paired()
    annaCars.state.pending = 1
    await expect(anna.engine.leaveThisDevice()).rejects.toBeInstanceOf(
      BuddyRemovalPendingError
    )
    annaCars.state.pending = 0
    await anna.engine.leaveThisDevice()
    expect(annaCars.state).toMatchObject({ finished: 2, leftAll: 0, forgot: 1 })
  })

  it('sends the car events only it holds before signing out', async () => {
    const { anna, joe, invitation, keyOf, offlineOps, stored } = await paired()
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    // Anna takes it back while her cancel can't go.
    offlineOps.add('event/put')
    await anna.engine.sendCarCancel(joe.inboxId, invite)
    offlineOps.clear()

    await anna.engine.leaveThisDevice()
    expect(stored(joe.inboxId, 'car.cancel')).toHaveLength(1)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)].status).toBe(
      'cancelled'
    )
  })

  it('drops a roster write a car change asked for once Buddies data is deleted', async () => {
    const { fake, anna } = await paired()
    const inboxes = fake.inboxes.size
    anna.engine.noteCarMemberships()
    await anna.engine.deleteEverything()
    for (const { run } of anna.timers.splice(0)) run()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(anna.store.getState().registeredInboxId).toBeNull()
    expect(fake.inboxes.size).toBe(inboxes - 1)
  })
})

describe('the roster’s cars', () => {
  function openRoster(seed: Uint8Array, blob: string): Roster {
    const { rosterKey, inboxId } = deriveIdentity(seed)
    return JSON.parse(
      fromUtf8(open(rosterKey, blob, `ww-buddies/v1/roster|${inboxId}`))
    )
  }

  it('carries the cars to the User’s other devices, both ways', async () => {
    const { user, fake, anna, annaCars } = await paired()
    const [s1, s2, s3] = [id(), id(), id()]
    annaCars.state.memberships = {
      cars: { [s1]: { at: 10 }, [s2]: { at: 5 } },
      leftCars: { [s2]: 7 },
    }
    anna.engine.noteCarMemberships()
    for (const { run } of anna.timers.splice(0)) run()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const written = openRoster(
      anna.seed,
      fake.inboxes.get(anna.inboxId)!.roster!.blob
    )
    // A car left since it was joined has done its job in `cars`.
    expect(written.cars).toEqual({ [s1]: { at: 10 } })
    expect(written.leftCars).toEqual({ [s2]: 7 })

    const ipadCars = carsStub()
    ipadCars.state.memberships = { cars: { [s3]: { at: 20 } }, leftCars: {} }
    const annasIpad = user('Anna', undefined, anna.seed, {
      cars: ipadCars.deps,
    })
    await annasIpad.engine.sync()
    expect(ipadCars.state.memberships).toEqual({
      cars: { [s1]: { at: 10 }, [s3]: { at: 20 } },
      leftCars: { [s2]: 7 },
    })
    // The merge differed from what the relay had, so it's written back.
    await anna.engine.sync()
    expect(annaCars.state.memberships.cars).toHaveProperty(s3)
  })

  it('reads older rosters, and drops an entry it can’t read on its own', () => {
    const base = { v: 1, buddies: [], outgoingInvites: [], incomingClaims: [] }
    expect(rosterSchema.parse(base)).toMatchObject({ cars: {}, leftCars: {} })
    const [good, other] = [id(), id()]
    const parsed = rosterSchema.parse({
      ...base,
      cars: { [good]: { at: 1 }, 'not-an-id': { at: 1 }, [other]: { at: 'x' } },
      leftCars: { [good]: 'x', [other]: 4 },
    })
    expect(parsed.cars).toEqual({ [good]: { at: 1 } })
    expect(parsed.leftCars).toEqual({ [other]: 4 })
    expect(rosterSchema.parse({ ...base, cars: 'garbled' }).cars).toEqual({})
  })

  it('fits the cars in the room the relay’s cap leaves, the User’s own first', async () => {
    const { fake, anna, annaCars } = await paired()
    const at = Date.now()
    const active = Object.fromEntries(
      Array.from({ length: 20 }, (_, n) => [id(), { at: at + n }])
    )
    const left = Object.fromEntries(
      Array.from({ length: 300 }, (_, n) => [id(), at - 300 + n])
    )
    annaCars.state.memberships = { cars: active, leftCars: left }
    // A roster near the cap: most of it already taken.
    anna.store.setState({
      closedInviteIds: Object.fromEntries(
        Array.from({ length: 700 }, () => [id(), at + 365 * DAY])
      ),
    })
    anna.engine.noteCarMemberships()
    for (const { run } of anna.timers.splice(0)) run()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const blob = fake.inboxes.get(anna.inboxId)!.roster!.blob
    const written = openRoster(anna.seed, blob)
    expect(JSON.stringify(written).length).toBeLessThanOrEqual(
      MAX_ROSTER_PLAINTEXT_BYTES
    )
    expect(written.cars).toEqual(active)
    const kept = Object.values(written.leftCars)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(MAX_ROSTER_LEFT_CARS)
    // The newest left cars are the ones kept.
    expect(Math.min(...kept)).toBe(at - kept.length)
  })
})

describe('what stays on the device', () => {
  type Paired = Awaited<ReturnType<typeof paired>>
  type Device = Paired['anna']

  /**
   * A new engine on what `who`'s device saved, as after a relaunch: its store,
   * and what its keystore kept of invitations' secrets (`storage`). A new,
   * empty one is a binary without device secrets, which kept them in memory, or
   * a restore onto a new phone, which doesn't bring the keystore along.
   */
  async function relaunch(
    { user }: Paired,
    who: Device,
    cars: ReturnType<typeof carsStub>,
    storage: InviteSecretStorage = who.inviteSecretStorage
  ) {
    await who.inviteSecrets.flushed()
    const next = user(who.profile.name, undefined, who.seed, {
      cars: cars.deps,
      inviteSecrets: createInviteSecretStore(storage),
    })
    next.store.setState(JSON.parse(JSON.stringify(who.store.getState())))
    return next
  }

  /** Whether what `who`'s store saves holds `invite`'s secret or key. */
  const savesSecrets = (who: Device, invite: CarInvitePayload) => {
    const saved = JSON.stringify(who.store.getState())
    return saved.includes(invite.joinSecret) || saved.includes(invite.key)
  }

  const secretsOf = (invite: CarInvitePayload) => ({
    joinSecret: invite.joinSecret,
    key: invite.key,
  })

  it('keeps an invitation’s secret and key in the keystore only while they’re needed', async () => {
    const { anna, joe, invitation, keyOf, offlineOps } = await paired()
    const invite = invitation()
    offlineOps.add('event/put')
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    expect(savesSecrets(anna, invite)).toBe(false)
    await anna.inviteSecrets.flushed()
    expect(JSON.parse(anna.inviteSecretStorage.value()!)).toEqual({
      [sentInviteSecretId(invite.inviteId)]: secretsOf(invite),
    })

    // The relay took it, with both: Anna's copy goes, and Joe's app keeps its
    // own.
    offlineOps.clear()
    await anna.engine.sync()
    await anna.inviteSecrets.flushed()
    expect(anna.inviteSecretStorage.value()).toBeNull()
    await joe.engine.sync()
    expect(savesSecrets(joe, invite)).toBe(false)
    await expect(joe.engine.carInviteSecrets(keyOf(invite))).resolves.toEqual(
      secretsOf(invite)
    )
    await joe.inviteSecrets.flushed()
    expect(JSON.parse(joe.inviteSecretStorage.value()!)).toEqual({
      [receivedInviteSecretId(keyOf(invite))]: secretsOf(invite),
    })

    // Answered: they go.
    await joe.engine.answerCarInvite(keyOf(invite), 'declined')
    await joe.inviteSecrets.flushed()
    expect(joe.inviteSecretStorage.value()).toBeNull()
    await expect(joe.engine.carInviteSecrets(keyOf(invite))).resolves.toBeNull()
  })

  it('sends an invitation again after a relaunch, with what the keystore kept', async () => {
    const context = await paired()
    const { anna, joe, annaCars, invitation, keyOf, offlineOps } = context
    const invite = invitation()
    offlineOps.add('event/put')
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const next = await relaunch(context, anna, annaCars)
    offlineOps.clear()
    await next.engine.sync()
    expect(next.store.getState().carEvents).toEqual({})
    expect(annaCars.lost).toEqual([])
    await joe.engine.sync()
    await expect(joe.engine.carInviteSecrets(keyOf(invite))).resolves.toEqual(
      secretsOf(invite)
    )
  })

  it('takes back an invitation whose secrets the device lost, for the car to send again', async () => {
    const context = await paired()
    const { anna, joe, annaCars, invitation, keyOf, offlineOps, stored } =
      context
    const invite = invitation()
    offlineOps.add('event/put')
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    const next = await relaunch(
      context,
      anna,
      annaCars,
      memoryInviteSecretStorage()
    )
    offlineOps.clear()
    await next.engine.sync()
    expect(annaCars.lost).toEqual([
      { to: joe.inboxId, spaceId: invite.spaceId, inviteId: invite.inviteId },
    ])
    expect(next.store.getState().carEvents).toEqual({})
    // Handed to the relay once already, so it may have reached Joe.
    expect(stored(joe.inboxId, 'car.invite')).toEqual([])
    expect(stored(joe.inboxId, 'car.cancel')).toHaveLength(1)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)].status).toBe(
      'cancelled'
    )
  })

  it('needs no cancel for a lost invitation that never went', async () => {
    const context = await paired()
    const { anna, joe, annaCars, invitation, stored } = context
    const invite = invitation()
    const eventId = inviteEventId(
      'car.invite',
      anna.inboxId,
      joe.inboxId,
      invite.inviteId
    )
    const next = await relaunch(
      context,
      anna,
      annaCars,
      memoryInviteSecretStorage()
    )
    // Saved, but never handed to the relay (it waited for the hourly budget).
    next.store.setState({
      carEvents: {
        [eventId]: {
          eventId,
          kind: 'car.invite',
          to: joe.inboxId,
          spaceId: invite.spaceId,
          inviteId: invite.inviteId,
          body: { v: 1, id: invite.spaceId, inviteId: invite.inviteId },
          push: true,
          expiresAt: invite.expiresAt,
          queuedAt: Date.now(),
        },
      },
    })
    await next.engine.deliverCarEvents()
    expect(annaCars.lost).toEqual([
      { to: joe.inboxId, spaceId: invite.spaceId, inviteId: invite.inviteId },
    ])
    expect(next.store.getState().carEvents).toEqual({})
    expect(stored(joe.inboxId, 'car.invite')).toEqual([])
    expect(stored(joe.inboxId, 'car.cancel')).toEqual([])
  })

  it('drops a buddy’s invitation whose secrets the device lost, with its alert', async () => {
    const context = await paired()
    const { anna, joe, joeCars, invitation, keyOf } = context
    const invite = invitation()
    await anna.engine.sendCarInvite(joe.inboxId, invite)
    await joe.engine.sync()
    const seqs = joe.store.getState().carInvites[keyOf(invite)].alertSeqs!

    // Joining asks for them first.
    const next = await relaunch(
      context,
      joe,
      joeCars,
      memoryInviteSecretStorage()
    )
    await expect(
      next.engine.carInviteSecrets(keyOf(invite))
    ).resolves.toBeNull()
    expect(next.store.getState().carInvites).toEqual({})
    expect(carEntries(next.store.getState().notifications)).toEqual([])
    expect(next.dismissed).toContainEqual(seqs)
    // Nothing is sent: another of Joe's devices may still join.
    expect(next.store.getState().carEvents).toEqual({})

    // A sync finds the same, with nobody asking.
    const again = await relaunch(
      context,
      joe,
      joeCars,
      memoryInviteSecretStorage()
    )
    await again.engine.sync()
    expect(again.store.getState().carInvites).toEqual({})
    expect(carEntries(again.store.getState().notifications)).toEqual([])
  })

  it('lets go of secrets nothing needs as soon as it starts, before anything changes', async () => {
    const context = await paired()
    const { anna, annaCars, invitation } = context
    const storage = memoryInviteSecretStorage()
    // Left by an invitation that lapsed as the store was read back, on a
    // device where nothing else happens.
    await storage.write(
      JSON.stringify({ 'sent|orphan': secretsOf(invitation()) })
    )
    const next = await relaunch(context, anna, annaCars, storage)
    await next.inviteSecrets.flushed()
    expect(storage.value()).toBeNull()
  })

  it('lets go of secrets nothing needs, and of all of them with Delete My Buddies Data', async () => {
    const context = await paired()
    const { anna, joe, annaCars, invitation, offlineOps } = context
    const storage = memoryInviteSecretStorage()
    // Left by an invitation the store no longer has.
    await storage.write(
      JSON.stringify({ 'sent|orphan': secretsOf(invitation()) })
    )
    const next = await relaunch(context, anna, annaCars, storage)
    const invite = invitation()
    offlineOps.add('event/put')
    await next.engine.sendCarInvite(joe.inboxId, invite)
    await next.inviteSecrets.flushed()
    expect(Object.keys(JSON.parse(storage.value()!))).toEqual([
      sentInviteSecretId(invite.inviteId),
    ])

    offlineOps.clear()
    await next.engine.deleteEverything()
    await next.inviteSecrets.flushed()
    expect(storage.value()).toBeNull()
  })

  it('reads an earlier build’s saved invitations without their secrets', () => {
    const invite = {
      from: 'from',
      spaceId: 'space',
      inviteId: 'invite',
      rev: 1,
      name: 'Mazda CX-5',
      people: 1,
      expiresAt: 2,
      receivedAt: 1,
      status: 'pending' as const,
    }
    const saved = withoutStoredInviteSecrets({
      carInvites: {
        key: {
          ...invite,
          join: { joinSecret: 'secret', epoch: 2, key: 'carkey' } as never,
        },
      },
      carEvents: {
        event: {
          eventId: 'event',
          kind: 'car.invite',
          to: 'to',
          spaceId: 'space',
          inviteId: 'invite',
          body: { v: 1, joinSecret: 'secret', epoch: 2, key: 'carkey' },
          push: true,
          expiresAt: 2,
          queuedAt: 1,
        },
      },
    })
    expect(saved.carInvites.key).toEqual({ ...invite, join: { epoch: 2 } })
    expect(saved.carEvents.event.body).toEqual({ v: 1, epoch: 2 })
  })
})
