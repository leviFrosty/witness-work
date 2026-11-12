import { memberTag } from '@/lib/sharedSpaces/crypto'
import { inviteRecordId } from '@/lib/sharedSpaces/records'
import type {
  BuddiesEngine,
  BuddiesTerritoriesDeps,
  TerritoryEventNotice,
  TerritoryMembershipsRoster,
} from '@/features/buddies/lib/engine'
import type { Buddy, BuddiesState } from '@/features/buddies/lib/state'
import type { TerritoriesState } from '@/features/territories/stores/territories'
import type { TerritorySpace } from '@/features/territories/types/sharedTerritory'
import type {
  TerritoryEngine,
  TerritoryInvitePayload,
} from '@/app/territories/engine'

export type TerritoryInvitationErrorCode =
  | 'not_found'
  | 'not_buddy'
  | 'already_on'
  | 'answering'

export class TerritoryInvitationError extends Error {
  constructor(readonly code: TerritoryInvitationErrorCode) {
    super(`Territory invitation: ${code}`)
    this.name = 'TerritoryInvitationError'
  }
}

export type TerritoryInvitationsEvent = {
  name: 'territory_invite_answered'
  answer: 'joined' | 'declined'
  handoff: boolean
}

export type TerritoryInvitationsDeps = {
  engine: Pick<
    TerritoryEngine,
    | 'shareWithBuddies'
    | 'cancelInvite'
    | 'inviteDeclined'
    | 'stopSharingWith'
    | 'joinTerritory'
    | 'confirmJoins'
    | 'syncSpace'
    | 'handOff'
    | 'endHandoff'
    | 'leaveAll'
    | 'finishPendingEnds'
    | 'forgetAll'
    | 'addFromRoster'
    | 'dropFromRoster'
  >
  buddies: Pick<
    BuddiesEngine,
    | 'sendTerritoryInvite'
    | 'sendTerritoryCancel'
    | 'sendTerritoryHandoff'
    | 'answerCarInvite'
    | 'carInviteSecrets'
  >
  buddiesStore: { getState: () => BuddiesState }
  store: { getState: () => TerritoriesState }

  running: () => boolean
  now: () => number

  onEvent?: (event: TerritoryInvitationsEvent) => void

  onError?: (error: unknown, context: string) => void
}

const isOn = (state: TerritoriesState, spaceId: string) =>
  state.spaces[spaceId] !== undefined ||
  (state.memberships.territories[spaceId] !== undefined &&
    (state.memberships.leftTerritories[spaceId] ?? 0) <
      state.memberships.territories[spaceId].at)

const inviteTag = (space: TerritorySpace, inviteId: string) => {
  const tag = space.records[inviteRecordId(inviteId)]?.data?.tag
  return typeof tag === 'string' ? tag : undefined
}

export function createTerritoryInvitations(deps: TerritoryInvitationsDeps) {
  const { engine, buddies, store } = deps
  const report = (error: unknown, context: string) =>
    deps.onError?.(error, context)
  const background = (work: Promise<unknown>, context: string) =>
    void work.catch((error: unknown) => report(error, context))

  const activeBuddies = () =>
    deps.buddiesStore.getState().buddies.filter((b) => b.status === 'active')

  const buddyNamed = (inboxId: string): Buddy => {
    const buddy = activeBuddies().find((b) => b.inboxId === inboxId)
    if (!buddy) throw new TerritoryInvitationError('not_buddy')
    return buddy
  }

  const buddyByTag = (spaceId: string, tag: string | undefined) =>
    tag === undefined
      ? undefined
      : activeBuddies().find((b) => memberTag(spaceId, b.inboxId) === tag)

  const answering = new Set<string>()

  async function sendInvite(to: string, invite: TerritoryInvitePayload) {
    let queued = false
    try {
      queued = await buddies.sendTerritoryInvite(to, invite)
    } finally {
      if (!queued)
        await engine
          .cancelInvite(invite.spaceId, invite.inviteId)
          .catch((error: unknown) => report(error, 'invite/delete'))
    }
    return queued
  }

  const sendCancel = (
    to: string | undefined,
    spaceId: string,
    inviteId: string,
    expiresAt: number
  ) =>
    to
      ? buddies.sendTerritoryCancel(to, { spaceId, inviteId, expiresAt })
      : Promise.resolve()

  async function share(
    territoryId: string,
    inboxIds: readonly string[],
    streetIds?: readonly string[]
  ) {
    const people = inboxIds.map(buddyNamed).map((b) => ({
      inboxId: b.inboxId,
      name: b.nickname ?? b.name,
    }))
    const result = await engine.shareWithBuddies(territoryId, people, streetIds)
    for (const canceled of result.canceled)
      await sendCancel(
        canceled.to,
        canceled.spaceId,
        canceled.inviteId,
        canceled.expiresAt
      ).catch((error: unknown) => report(error, 'territory.cancel'))
    let sent = 0
    for (const { to, invite } of result.invites)
      if (await sendInvite(to, invite)) sent += 1
    return { sent, widened: result.widened }
  }

  async function handOff(
    territoryId: string,
    streetId: string,
    inboxId: string
  ) {
    const buddy = buddyNamed(inboxId)
    const result = await engine.handOff(territoryId, streetId, {
      inboxId,
      name: buddy.nickname ?? buddy.name,
    })
    if (result.kind === 'invite') await sendInvite(result.to, result.invite)
    else
      await buddies
        .sendTerritoryHandoff(result.to, {
          spaceId: result.spaceId,
          scopeId: result.scopeId,
          street: result.street,
          since: result.since,
        })
        .catch((error: unknown) => report(error, 'territory.handoff'))
  }

  async function endHandoff(territoryId: string, streetId: string) {
    const result = await engine.endHandoff(territoryId, streetId)
    const spaceId = store
      .getState()
      .territories.find((t) => t.id === territoryId)?.shared?.spaceId
    if (result.canceled && spaceId)
      await sendCancel(
        result.canceled.to,
        spaceId,
        result.canceled.inviteId,
        deps.now()
      ).catch((error: unknown) => report(error, 'territory.cancel'))
  }

  async function stopSharing(territoryId: string, personId: string) {
    const state = store.getState()
    const spaceId = state.territories.find((t) => t.id === territoryId)?.shared
      ?.spaceId
    const space = spaceId ? state.spaces[spaceId] : undefined
    if (!spaceId || !space) throw new TerritoryInvitationError('not_found')
    if (space.invites.some((i) => i.inviteId === personId)) {
      const { to, expiresAt } = await engine.cancelInvite(spaceId, personId)
      await sendCancel(to, spaceId, personId, expiresAt).catch(
        (error: unknown) => report(error, 'territory.cancel')
      )
      return
    }
    await engine.stopSharingWith(territoryId, personId)
  }

  function pendingInvite(key: string) {
    const invite = deps.buddiesStore.getState().carInvites[key]
    if (
      !invite ||
      invite.family !== 'territory' ||
      invite.status !== 'pending' ||
      invite.expiresAt <= deps.now()
    )
      throw new TerritoryInvitationError('not_found')
    return invite
  }

  async function joinPayload(key: string): Promise<TerritoryInvitePayload> {
    const invite = pendingInvite(key)
    const secrets = await buddies.carInviteSecrets(key)
    if (!secrets || !invite.join)
      throw new TerritoryInvitationError('not_found')
    return {
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      joinSecret: secrets.joinSecret,
      epoch: invite.join.epoch,
      key: secrets.key,
      title: invite.territory?.title ?? invite.name,
      streets: invite.territory?.streets ?? [],
      handoff: invite.territory?.handoff ?? false,
      people: invite.people,
      expiresAt: invite.expiresAt,
    }
  }

  function startAnswering(key: string) {
    if (answering.has(key)) throw new TerritoryInvitationError('answering')
    answering.add(key)
  }

  async function join(key: string): Promise<{ spaceId: string }> {
    startAnswering(key)
    try {
      const payload = await joinPayload(key)
      const joinedElsewhere = isOn(store.getState(), payload.spaceId)
      await engine.joinTerritory(payload)
      const answered = await buddies.answerCarInvite(key, 'joined')
      if (answered && !joinedElsewhere)
        deps.onEvent?.({
          name: 'territory_invite_answered',
          answer: 'joined',
          handoff: payload.handoff,
        })
      return { spaceId: payload.spaceId }
    } finally {
      answering.delete(key)
    }
  }

  async function decline(key: string): Promise<void> {
    startAnswering(key)
    try {
      const invite = pendingInvite(key)
      if (isOn(store.getState(), invite.spaceId))
        throw new TerritoryInvitationError('already_on')
      if (!(await buddies.answerCarInvite(key, 'declined')))
        throw new TerritoryInvitationError('not_found')
      deps.onEvent?.({
        name: 'territory_invite_answered',
        answer: 'declined',
        handoff: invite.territory?.handoff ?? false,
      })
    } finally {
      answering.delete(key)
    }
  }

  function handleEvent(notice: TerritoryEventNotice) {
    const { spaceId } = notice
    if (!store.getState().spaces[spaceId]) return
    if (notice.kind === 'territory.reply' && notice.status === 'declined')
      background(
        engine.inviteDeclined(spaceId, notice.inviteId),
        'invite/delete'
      )
    else if (notice.kind !== 'territory.invite')
      background(engine.syncSpace(spaceId, { automatic: true }), 'sync')
  }

  function handleReissue({
    spaceId,
    previousInviteId,
    to,
    invite,
  }: {
    spaceId: string
    previousInviteId: string
    to: string
    invite: TerritoryInvitePayload
  }) {
    if (!activeBuddies().some((b) => b.inboxId === to)) {
      background(engine.cancelInvite(spaceId, invite.inviteId), 'invite/delete')
      return
    }
    background(
      (async () => {
        await sendCancel(to, spaceId, previousInviteId, invite.expiresAt)
        await sendInvite(to, invite)
      })(),
      'territory.invite'
    )
  }

  function openInvitesTo(inboxId: string) {
    const now = deps.now()
    return Object.values(store.getState().spaces).flatMap((space) => {
      const tag = memberTag(space.spaceId, inboxId)
      return space.invites
        .filter(
          (invite) =>
            invite.expiresAt > now &&
            invite.invitedBy === space.myMemberId &&
            inviteTag(space, invite.inviteId) === tag
        )
        .map((invite) => ({
          spaceId: space.spaceId,
          inviteId: invite.inviteId,
          tag,
          expiresAt: invite.expiresAt,
        }))
    })
  }

  function cancelInvitesTo(inboxId: string) {
    for (const { spaceId, inviteId } of openInvitesTo(inboxId))
      background(engine.cancelInvite(spaceId, inviteId), 'invite/delete')
  }

  function mergeMemberships(remote: TerritoryMembershipsRoster) {
    const state = store.getState()
    const local = state.memberships
    for (const [spaceId, { at }] of Object.entries(remote.territories)) {
      if ((local.territories[spaceId]?.at ?? -Infinity) >= at) continue
      if (deps.running())
        background(engine.addFromRoster(spaceId, at), 'roster')
      else state.noteJoined(spaceId, at)
    }
    for (const [spaceId, at] of Object.entries(remote.leftTerritories)) {
      if ((local.leftTerritories[spaceId] ?? -Infinity) >= at) continue
      if (deps.running())
        background(engine.dropFromRoster(spaceId, at), 'roster')
      else state.noteLeft(spaceId, at)
    }
  }

  function reconcileMemberships() {
    const { memberships, spaces, seeding } = store.getState()
    for (const [spaceId, { at }] of Object.entries(memberships.territories))
      if (
        !spaces[spaceId] &&
        !seeding[spaceId] &&
        (memberships.leftTerritories[spaceId] ?? 0) < at
      )
        background(engine.addFromRoster(spaceId, at), 'roster')
    for (const spaceId of Object.keys(spaces)) {
      const leftAt = memberships.leftTerritories[spaceId]
      const joinedAt = memberships.territories[spaceId]?.at ?? 0
      if (leftAt !== undefined && leftAt >= joinedAt)
        background(engine.dropFromRoster(spaceId, leftAt), 'roster')
    }
  }

  const buddiesHandler: BuddiesTerritoriesDeps = {
    memberships: () => store.getState().memberships,
    mergeMemberships,
    openInvitesTo,
    replyApplies: ({ from, spaceId, inviteId }) => {
      const space = store.getState().spaces[spaceId]
      if (!space) return false
      const sent = space.sentInvites[inviteId]
      if (sent) return sent.to === from
      return inviteTag(space, inviteId) === memberTag(spaceId, from)
    },
    isOnCar: (spaceId) => isOn(store.getState(), spaceId),
    inviteOpen: (spaceId, inviteId) => {
      const state = store.getState()
      const space = state.spaces[spaceId]
      return (
        space !== undefined &&
        !state.closingInvites[spaceId]?.[inviteId] &&
        space.invites.some(
          (i) => i.inviteId === inviteId && i.expiresAt > deps.now()
        )
      )
    },
    onEvent: handleEvent,
    onInviteLost: ({ spaceId }) => {
      if (store.getState().spaces[spaceId])
        background(engine.syncSpace(spaceId, { automatic: true }), 'sync')
    },
    onBuddyGone: cancelInvitesTo,
    leaveAll: () => engine.leaveAll(),
    finishPending: () => engine.finishPendingEnds(),
    forgetLocal: () => engine.forgetAll(),
  }

  return {
    share,
    handOff,
    endHandoff,
    stopSharing,
    join,
    decline,
    isAnswering: (key: string) => answering.has(key),
    handleEvent,
    handleReissue,
    cancelInvitesTo,
    mergeMemberships,
    reconcileMemberships,
    buddiesHandler,
    buddyByTag,
  }
}

export type TerritoryInvitations = ReturnType<typeof createTerritoryInvitations>
