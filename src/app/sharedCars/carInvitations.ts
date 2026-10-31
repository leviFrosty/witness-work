import {
  activeSharedCarIds,
  isOnSharedCar,
  openCarInvites,
  openInvitesTo,
} from '@/lib/mileage/sharedCar'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type { SharedCarsStore } from '@/stores/sharedCars'
import type {
  CarInvitePayload,
  SharedCar,
  SharedCarMemberships,
} from '@/types/sharedCars'
import type {
  BuddiesCarsDeps,
  BuddiesEngine,
  CarEventNotice,
  LostCarInvite,
} from '@/features/buddies/lib/engine'
import {
  type BuddiesCarsHandler,
  noteRosterMemberships,
  pendingInviteCloses,
  rosterMembershipChanges,
} from '@/features/buddies/lib/sharedCarsLink'
import type { Buddy, BuddiesState } from '@/features/buddies/lib/state'
import type {
  ReissuedInvite,
  SharedCarJoinConfirmed,
  SharedCarsEngine,
} from '@/app/sharedCars/engine'

/**
 * Shared Cars' invitations through Buddies (docs/shared-cars-protocol.md,
 * "Invitations"): inviting a buddy, canceling, joining or declining a buddy's
 * invitation, and what each `car.*` event does to a car. Also the rest of what
 * Buddies asks of Shared Cars: the roster's memberships, and leaving every car
 * with Buddies. The Shared Cars engine does the car's side; the Buddies engine
 * sends and keeps the events. `carInvitationsService` wires the app's one.
 */

export type CarInvitationErrorCode =
  /** No such car here, or no such invitation (answered, canceled, lapsed). */
  | 'not_found'
  /** Not an active buddy. */
  | 'not_buddy'
  /** They're on the car already (answering an invitation: the User is). */
  | 'already_on_car'
  /** Someone on the car already invited them, and it's still open. */
  | 'already_invited'
  /** An answer to this invitation is already on its way (a second tap). */
  | 'answering'

/** An invitation this device refused before asking anyone. */
export class CarInvitationError extends Error {
  constructor(readonly code: CarInvitationErrorCode) {
    super(`Shared Car invitation: ${code}`)
    this.name = 'CarInvitationError'
  }
}

/** One of the User's active buddies, and whether they can be invited. */
export type CarBuddy =
  | { inboxId: string; status: 'available' }
  /** On the car, as `memberId`. */
  | { inboxId: string; status: 'onCar'; memberId: string }
  /**
   * Invited and not answered yet. `mine` when this User sent it, so it's theirs
   * to cancel.
   */
  | {
      inboxId: string
      status: 'invited'
      inviteId: string
      expiresAt: number
      mine: boolean
    }

export type CarInvitationsEvent =
  | { name: 'shared_car_invite_sent' }
  | { name: 'shared_car_invite_answered'; answer: 'joined' | 'declined' }
  | { name: 'shared_car_invite_canceled'; reason: 'user' | 'buddy_gone' }

export type CarInvitationsDeps = {
  engine: Pick<
    SharedCarsEngine,
    | 'createInvite'
    | 'cancelInvite'
    | 'declineInvite'
    | 'joinCar'
    | 'confirmJoins'
    | 'syncCar'
    | 'leaveAll'
    | 'abandonShares'
    | 'finishPendingEnds'
    | 'forgetAll'
    | 'addCarFromRoster'
    | 'dropCarFromRoster'
  >
  buddies: Pick<
    BuddiesEngine,
    'sendCarInvite' | 'sendCarCancel' | 'answerCarInvite' | 'carInviteSecrets'
  >
  buddiesStore: { getState: () => BuddiesState }
  store: SharedCarsStore
  /**
   * Shared Cars runs here (its flag on, with Buddies). Until it does, cars the
   * roster brings are only noted, for the runtime to pick up.
   */
  running: () => boolean
  now: () => number
  /** Key moments, for analytics. Never names, ids, or car details. */
  onEvent?: (event: CarInvitationsEvent) => void
  /** Something that failed in the background; `context` is an op name. */
  onError?: (error: unknown, context: string) => void
}

export function createCarInvitations(deps: CarInvitationsDeps) {
  const { engine, buddies, store } = deps
  const report = (error: unknown, context: string) =>
    deps.onError?.(error, context)
  const background = (work: Promise<unknown>, context: string) =>
    void work.catch((error: unknown) => report(error, context))

  const activeBuddies = () =>
    deps.buddiesStore.getState().buddies.filter((b) => b.status === 'active')

  /** The active buddy an invitation on `car` with this `tag` went to. */
  const buddyByTag = (car: SharedCar, tag: string): Buddy | undefined =>
    activeBuddies().find((b) => memberTag(car.spaceId, b.inboxId) === tag)

  const openInvites = (car: SharedCar) => openCarInvites(car, deps.now())

  /** The User is on `spaceId`: the car is here, or the roster says so. */
  const isOnCar = (spaceId: string) => {
    const { cars, memberships } = store.getState()
    return cars[spaceId] !== undefined || isOnSharedCar(memberships, spaceId)
  }

  /** Invitations being answered here now, by key: one answer at a time. */
  const answering = new Set<string>()

  /** Starts answering `key`, unless a tap before this one already is. */
  function startAnswering(key: string) {
    if (answering.has(key)) throw new CarInvitationError('answering')
    answering.add(key)
  }

  /** Every active buddy, and where each stands on the car. */
  function carBuddies(spaceId: string): CarBuddy[] {
    const car = store.getState().cars[spaceId]
    if (!car) return []
    return activeBuddies().map(({ inboxId }): CarBuddy => {
      const tag = memberTag(spaceId, inboxId)
      const member = car.members.find((m) => m.tag === tag)
      if (member) return { inboxId, status: 'onCar', memberId: member.memberId }
      const invite = openInvites(car).find((i) => i.tag === tag)
      if (invite)
        return {
          inboxId,
          status: 'invited',
          inviteId: invite.inviteId,
          expiresAt: invite.expiresAt,
          mine: invite.invitedBy === car.myMemberId,
        }
      return { inboxId, status: 'available' }
    })
  }

  /**
   * Sends `car.invite` for an invitation just opened on the car. One that can't
   * be saved to send (they stopped being an active buddy meanwhile) closes
   * again, since nobody would hear of it. Whether it's on its way.
   */
  async function sendInvite(
    inboxId: string,
    invite: CarInvitePayload
  ): Promise<boolean> {
    let queued = false
    try {
      queued = await buddies.sendCarInvite(inboxId, invite)
    } finally {
      if (!queued)
        await engine
          .cancelInvite(invite.spaceId, invite.inviteId)
          .catch((error: unknown) => report(error, 'invite/delete'))
    }
    return queued
  }

  /**
   * Invites a buddy to a Shared Car: opens the invitation on the car (by their
   * Buddy Card name and inbox, hashed for the car), then sends them
   * `car.invite`, which is retried until the relay accepts it.
   */
  async function inviteBuddy(
    spaceId: string,
    inboxId: string
  ): Promise<{ inviteId: string }> {
    const car = store.getState().cars[spaceId]
    if (!car) throw new CarInvitationError('not_found')
    const buddy = activeBuddies().find((b) => b.inboxId === inboxId)
    if (!buddy) throw new CarInvitationError('not_buddy')
    const tag = memberTag(spaceId, inboxId)
    if (car.members.some((m) => m.tag === tag))
      throw new CarInvitationError('already_on_car')
    if (openInvites(car).some((i) => i.tag === tag))
      throw new CarInvitationError('already_invited')
    const invite = await engine.createInvite(spaceId, { name: buddy.name, tag })
    if (!(await sendInvite(inboxId, invite)))
      throw new CarInvitationError('not_buddy')
    deps.onEvent?.({ name: 'shared_car_invite_sent' })
    return { inviteId: invite.inviteId }
  }

  /**
   * Cancels one of this User's open invitations: it closes on the car (now, or
   * on a later sync), and the buddy's app takes it back (`car.cancel`).
   */
  async function cancelInvite(
    spaceId: string,
    inviteId: string,
    reason: 'user' | 'buddy_gone' = 'user'
  ): Promise<{ pending: boolean }> {
    const car = store.getState().cars[spaceId]
    const invite = car?.inviteRecords.find((i) => i.inviteId === inviteId)
    if (!car || !invite) throw new CarInvitationError('not_found')
    const buddy = buddyByTag(car, invite.tag)
    const closed = await engine.cancelInvite(spaceId, inviteId)
    if (buddy)
      await buddies.sendCarCancel(buddy.inboxId, {
        spaceId,
        inviteId,
        expiresAt: invite.expiresAt,
      })
    deps.onEvent?.({ name: 'shared_car_invite_canceled', reason })
    return closed
  }

  /**
   * A join whose answer was lost turned out, on a later sync, to have landed
   * after Join gave up: the invitation it used is answered now, as Join would
   * have (`car.reply`, `joined`), and counted once. A Join still running
   * answers it itself.
   */
  function handleJoinConfirmed({ spaceId, inviteId }: SharedCarJoinConfirmed) {
    const key = Object.keys(deps.buddiesStore.getState().carInvites).find(
      (k) => {
        const invite = deps.buddiesStore.getState().carInvites[k]
        return invite.spaceId === spaceId && invite.inviteId === inviteId
      }
    )
    if (!key || answering.has(key)) return
    background(
      (async () => {
        if (
          await buddies.answerCarInvite(key, 'joined', { confirmedJoin: true })
        )
          deps.onEvent?.({
            name: 'shared_car_invite_answered',
            answer: 'joined',
          })
      })(),
      'car.reply'
    )
  }

  /** Invitation `key`, while it's still to answer. */
  function pendingInvite(key: string) {
    const invite = deps.buddiesStore.getState().carInvites[key]
    if (
      !invite ||
      invite.status !== 'pending' ||
      invite.expiresAt <= deps.now()
    )
      throw new CarInvitationError('not_found')
    return invite
  }

  /**
   * What joining from invitation `key` takes, while it can be answered: its
   * secret and the car's key from the device. One whose secrets the device lost
   * can't be joined from here, and goes.
   */
  async function joinPayload(key: string): Promise<CarInvitePayload> {
    const invite = pendingInvite(key)
    const secrets = await buddies.carInviteSecrets(key)
    if (!secrets || !invite.join) throw new CarInvitationError('not_found')
    return {
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      joinSecret: secrets.joinSecret,
      epoch: invite.join.epoch,
      key: secrets.key,
      name: invite.name,
      people: invite.people,
      expiresAt: invite.expiresAt,
    }
  }

  /**
   * Whether the User is on `spaceId` after a join that failed: the server may
   * have taken it, with only its answer lost. A joining mark it left is
   * confirmed now, with a sync as their member; one the server doesn't answer
   * waits for the next sync.
   */
  async function joinLanded(spaceId: string): Promise<boolean> {
    if (isOnCar(spaceId)) return true
    if (!store.getState().joining[spaceId]) return false
    await engine.confirmJoins()
    return isOnCar(spaceId)
  }

  /**
   * Join: joins the car, then tells the buddy (`car.reply`, `joined`). A join
   * the server took counts even when what followed it failed (its answer was
   * lost, say): the User is on the car, which catches up on its next sync. One
   * that didn't leaves the invitation to answer again. The answer counts once,
   * on the device that joined: not here when the User was on the car already
   * (another of their devices joined it, and counted it).
   */
  async function join(key: string): Promise<{ spaceId: string }> {
    startAnswering(key)
    try {
      const payload = await joinPayload(key)
      const { spaceId } = payload
      const joinedElsewhere = isOnCar(spaceId)
      try {
        await engine.joinCar(payload)
      } catch (error) {
        if (!(await joinLanded(spaceId))) throw error
        report(error, 'join')
      }
      const answered = await buddies.answerCarInvite(key, 'joined')
      if (answered && !joinedElsewhere)
        deps.onEvent?.({ name: 'shared_car_invite_answered', answer: 'joined' })
      return { spaceId }
    } finally {
      answering.delete(key)
    }
  }

  /**
   * Decline: tells the buddy, whose app closes the invitation. Not for a car
   * the User is on (a join that landed, here or on another of their devices):
   * that invitation reads as joined.
   */
  async function decline(key: string): Promise<void> {
    startAnswering(key)
    try {
      const { spaceId } = pendingInvite(key)
      if (await joinLanded(spaceId))
        throw new CarInvitationError('already_on_car')
      if (await buddies.answerCarInvite(key, 'declined'))
        deps.onEvent?.({
          name: 'shared_car_invite_answered',
          answer: 'declined',
        })
      else throw new CarInvitationError('not_found')
    } finally {
      answering.delete(key)
    }
  }

  /**
   * A buddy's `car.*` event, once: a reply on one of this User's cars syncs it,
   * and a decline closes its invitation there (when it went to them).
   */
  function handleEvent(notice: CarEventNotice) {
    if (notice.kind !== 'car.reply') return
    const { spaceId, inviteId, from, status } = notice
    if (!store.getState().cars[spaceId]) return
    if (status === 'declined')
      background(
        engine.declineInvite(spaceId, inviteId, memberTag(spaceId, from)),
        'invite/delete'
      )
    else background(engine.syncCar(spaceId, { automatic: true }), 'sync')
  }

  /**
   * A rekey closed an invitation this device sent, and the engine opened its
   * replacement: the buddy's app takes the old one back and gets the new one.
   * One to someone who's no longer a buddy can't reach them, so it closes.
   */
  function handleReissue({
    spaceId,
    previousInviteId,
    invite,
  }: ReissuedInvite) {
    const car = store.getState().cars[spaceId]
    const record = car?.inviteRecords.find(
      (i) => i.inviteId === invite.inviteId
    )
    const buddy = car && record ? buddyByTag(car, record.tag) : undefined
    if (!buddy) {
      background(engine.cancelInvite(spaceId, invite.inviteId), 'invite/delete')
      return
    }
    background(
      (async () => {
        await buddies.sendCarCancel(buddy.inboxId, {
          spaceId,
          inviteId: previousInviteId,
          expiresAt: invite.expiresAt,
        })
        await sendInvite(buddy.inboxId, invite)
      })(),
      'car.invite'
    )
  }

  /**
   * An invitation this device sent can't go from it any more: its secrets are
   * gone (a restore onto a new phone, or a binary without device secrets that
   * restarted), and Buddies dropped its `car.invite`, sending `car.cancel` if
   * it may have reached them. Its car owes it again (the Buddies link marks
   * it): the car syncs now, and on every sync until it's sent, it closes and a
   * new one goes to the same buddy in its place, as after a rekey
   * (`handleReissue`), so they aren't left waiting for one that never comes.
   */
  function handleInviteLost({ spaceId }: LostCarInvite) {
    if (!store.getState().cars[spaceId]) return
    background(engine.syncCar(spaceId, { automatic: true }), 'car.invite')
  }

  /**
   * `inboxId` is no longer a buddy: this User's open invitations to them close
   * on every car. The cars themselves don't change.
   */
  function cancelInvitesTo(inboxId: string) {
    const invites = openInvitesTo(
      store.getState().cars,
      (spaceId) => memberTag(spaceId, inboxId),
      deps.now()
    )
    for (const { spaceId, inviteId } of invites) {
      background(engine.cancelInvite(spaceId, inviteId), 'invite/delete')
      deps.onEvent?.({
        name: 'shared_car_invite_canceled',
        reason: 'buddy_gone',
      })
    }
  }

  let mergingRoster = false

  /**
   * Another device's memberships, from the roster: cars it joined or shared
   * start syncing here, and cars it left end here with the same personal copy,
   * unless the User joined them again since. Only what's newer than this
   * device's own does anything, so reading the same roster again does nothing.
   * While Shared Cars doesn't run here they're only noted, for the runtime.
   */
  function mergeMemberships(remote: SharedCarMemberships) {
    mergingRoster = true
    try {
      if (!deps.running()) {
        noteRosterMemberships(store, remote)
        return
      }
      const { joined, left } = rosterMembershipChanges(
        store.getState().memberships,
        remote
      )
      for (const { spaceId, at } of joined)
        background(engine.addCarFromRoster(spaceId, at), 'roster')
      for (const { spaceId, at, ends } of left)
        if (ends) background(engine.dropCarFromRoster(spaceId, at), 'roster')
        // On it again since: the leave is only kept, for the roster.
        else store.getState().noteLeft(spaceId, at)
    } finally {
      mergingRoster = false
    }
  }

  /**
   * Brings the cars on this device in line with the memberships, when Shared
   * Cars starts: a car the roster brought while it wasn't running starts
   * syncing, and one left elsewhere ends.
   */
  function reconcileMemberships() {
    const { memberships, cars, seeding } = store.getState()
    for (const spaceId of activeSharedCarIds(memberships))
      if (!cars[spaceId] && !seeding[spaceId])
        background(
          engine.addCarFromRoster(spaceId, memberships.cars[spaceId].at),
          'roster'
        )
    for (const spaceId of Object.keys(cars)) {
      const leftAt = memberships.leftCars[spaceId]
      if (leftAt !== undefined && !isOnSharedCar(memberships, spaceId))
        background(engine.dropCarFromRoster(spaceId, leftAt), 'roster')
    }
  }

  /**
   * Closes on the server every invitation the cars here are still closing
   * (canceled or declined while it couldn't hear): each of those cars syncs.
   * How many it still couldn't.
   */
  async function closePendingInvites(): Promise<number> {
    const { closingInvites, cars } = store.getState()
    await Promise.all(
      Object.keys(closingInvites)
        .filter((spaceId) => cars[spaceId])
        .map((spaceId) =>
          engine
            .syncCar(spaceId)
            .catch((error: unknown) => report(error, 'invite/delete'))
        )
    )
    return pendingInviteCloses(store.getState())
  }

  /** What Buddies hands Shared Cars (`setBuddiesCarsHandler`). */
  const buddiesHandler: BuddiesCarsHandler = {
    mergeMemberships,
    onEvent: handleEvent,
    onBuddyGone: cancelInvitesTo,
    onInviteLost: handleInviteLost,
    leaveAll: () => engine.leaveAll(),
    // Signing out here: what this device owes the server goes first, since
    // the account's other devices don't know of it.
    finishPending: async () => {
      await engine.abandonShares()
      const { pending } = await engine.finishPendingEnds()
      return { pending: pending + (await closePendingInvites()) }
    },
    forgetLocal: () => engine.forgetAll(),
  } satisfies Partial<BuddiesCarsDeps>

  return {
    carBuddies,
    inviteBuddy,
    cancelInvite: (spaceId: string, inviteId: string) =>
      cancelInvite(spaceId, inviteId),
    join,
    decline,
    /** A Join or Decline for invitation `key` is on its way. */
    isAnswering: (key: string) => answering.has(key),
    handleEvent,
    handleReissue,
    handleInviteLost,
    handleJoinConfirmed,
    cancelInvitesTo,
    mergeMemberships,
    reconcileMemberships,
    /** A roster merge is writing the memberships (not this device's change). */
    isMergingRoster: () => mergingRoster,
    buddiesHandler,
  }
}

export type CarInvitations = ReturnType<typeof createCarInvitations>
