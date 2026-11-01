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

export type CarInvitationErrorCode =
  | 'not_found'
  | 'not_buddy'
  | 'already_on_car'
  | 'already_invited'
  | 'answering'

export class CarInvitationError extends Error {
  constructor(readonly code: CarInvitationErrorCode) {
    super(`Shared Car invitation: ${code}`)
    this.name = 'CarInvitationError'
  }
}

export type CarBuddy =
  | { inboxId: string; status: 'available' }
  | { inboxId: string; status: 'onCar'; memberId: string }
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

  running: () => boolean
  now: () => number

  onEvent?: (event: CarInvitationsEvent) => void

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

  const buddyByTag = (car: SharedCar, tag: string): Buddy | undefined =>
    activeBuddies().find((b) => memberTag(car.spaceId, b.inboxId) === tag)

  const openInvites = (car: SharedCar) => openCarInvites(car, deps.now())

  const isOnCar = (spaceId: string) => {
    const { cars, memberships } = store.getState()
    return cars[spaceId] !== undefined || isOnSharedCar(memberships, spaceId)
  }

  const answering = new Set<string>()

  function startAnswering(key: string) {
    if (answering.has(key)) throw new CarInvitationError('answering')
    answering.add(key)
  }

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

  async function joinLanded(spaceId: string): Promise<boolean> {
    if (isOnCar(spaceId)) return true
    if (!store.getState().joining[spaceId]) return false
    await engine.confirmJoins()
    return isOnCar(spaceId)
  }

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

  function handleInviteLost({ spaceId }: LostCarInvite) {
    if (!store.getState().cars[spaceId]) return
    background(engine.syncCar(spaceId, { automatic: true }), 'car.invite')
  }

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
        else store.getState().noteLeft(spaceId, at)
    } finally {
      mergingRoster = false
    }
  }

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

  const buddiesHandler: BuddiesCarsHandler = {
    mergeMemberships,
    onEvent: handleEvent,
    onBuddyGone: cancelInvitesTo,
    onInviteLost: handleInviteLost,
    leaveAll: () => engine.leaveAll(),

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

    isAnswering: (key: string) => answering.has(key),
    handleEvent,
    handleReissue,
    handleInviteLost,
    handleJoinConfirmed,
    cancelInvitesTo,
    mergeMemberships,
    reconcileMemberships,

    isMergingRoster: () => mergingRoster,
    buddiesHandler,
  }
}

export type CarInvitations = ReturnType<typeof createCarInvitations>
