import { fromB64u, toB64u } from '@/lib/bytes'
import {
  CAR_INVITE_NAME_MAX,
  emptySharedCar,
  parseCarInvitePayload,
  withDerivedPeople,
  withPending,
} from '@/lib/mileage/sharedCar'
import { isSpaceError, SPACE_LIMITS } from '@/lib/sharedSpaces/client'
import {
  joinVerifier,
  SPACE_ID_PATTERN,
  type SpaceMemberKeys,
  unwrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import type { EpochKey } from '@/lib/sharedSpaces/keyTrust'
import {
  clip,
  inviteRecordId,
  MEMBER_NAME_MAX,
  memberRecordId,
} from '@/lib/sharedSpaces/records'
import {
  memberRecordData,
  type SharedCarProfile,
} from '@/app/sharedCars/profile'
import { AMBIGUOUS, type EngineContext } from '@/app/sharedCars/engine/context'
import type { EngineParts, Invitations } from '@/app/sharedCars/engine/parts'
import {
  type CarSyncOptions,
  SharedCarsError,
} from '@/app/sharedCars/engine/types'
import type {
  CarInvitePayload,
  SharedCar,
  SharedCarJoining,
} from '@/types/sharedCars'

const INVITE_ATTEMPTS = 3

const UNANSWERED = new Set<string>(['network', 'timeout', 'unknown'])

export function createInvitations(
  ctx: EngineContext,
  parts: EngineParts
): Invitations {
  const { deps, client, store, keyring } = ctx

  async function openInvite(
    spaceId: string,
    member: SpaceMemberKeys,
    invitee: { name: string; tag: string },
    options: { expiresAt?: number; replaces?: string } = {}
  ): Promise<CarInvitePayload> {
    let calibrated = false
    for (let attempt = 0; ; attempt++) {
      const car = ctx.cars()[spaceId]
      if (!car) throw new SharedCarsError('not_found')
      const { epoch } = car

      const key = parts.keys.sealingKey(car)
      if (!key) throw new SharedCarsError('key_unverified')
      const inviteId = toB64u(deps.randomBytes(16))
      const joinSecret = deps.randomBytes(32)

      const expiresAt = Math.min(
        options.expiresAt ?? Infinity,
        deps.syncNow() + SPACE_LIMITS.inviteLifetimeMs
      )
      const fields = {
        inviteId,
        joinVerifier: joinVerifier(joinSecret),
        expiresAt,
        epoch,
      }
      const send = () =>
        client.createInvite(ctx.auth(member), fields, ctx.call()).then(
          () => null,
          (error: unknown) => error
        )
      let error = await send()
      const unanswered = isSpaceError(error) && UNANSWERED.has(error.code)
      if (unanswered) error = await send()
      if (error !== null) {
        const mayBeOpen =
          unanswered || (isSpaceError(error) && AMBIGUOUS.has(error.code))
        if (mayBeOpen && ctx.cars()[spaceId])
          ctx.engineWrite(() =>
            store.getState().addClosingInvite(spaceId, inviteId, {})
          )
        if (isSpaceError(error, 'stale_key') && attempt < INVITE_ATTEMPTS) {
          await parts.sync.pull(spaceId, member)
          continue
        }
        if (isSpaceError(error, 'bad_request') && !calibrated) {
          calibrated = true
          await ctx.refreshClock()
          continue
        }
        throw error
      }
      ctx.noteAnswered()
      added(spaceId, member, invitee, {
        inviteId,
        expiresAt,
        epoch,
        replaces: options.replaces,
      })
      return {
        spaceId,
        inviteId,
        joinSecret: toB64u(joinSecret),
        epoch,
        key: toB64u(key),
        name: clip(car.vehicles[0]?.name ?? '', CAR_INVITE_NAME_MAX),
        people: car.spaceMembers.length,
        expiresAt,
      }
    }
  }

  function added(
    spaceId: string,
    member: SpaceMemberKeys,
    invitee: { name: string; tag: string },
    invite: {
      inviteId: string
      expiresAt: number
      epoch: number
      replaces?: string
    }
  ) {
    const { inviteId, expiresAt, epoch, replaces } = invite
    ctx.update(spaceId, (c) => {
      const previous = replaces
        ? c.inviteRecords.find((record) => record.inviteId === replaces)
        : undefined
      const { [replaces ?? '']: _replaced, ...sentInvites } = c.sentInvites
      const replacedId = previous && inviteRecordId(previous.inviteId)
      return withDerivedPeople({
        ...c,
        inviteRecords: [
          ...c.inviteRecords.filter((record) => record !== previous),
          {
            inviteId,
            invitedBy: member.memberId,
            name: clip(invitee.name.trim(), MEMBER_NAME_MAX),
            tag: invitee.tag,
            expiresAt,
            updatedAt: deps.stamp(),
          },
        ],
        deletedSpaceRecords:
          previous && replacedId
            ? [
                ...c.deletedSpaceRecords.filter((t) => t.id !== replacedId),
                {
                  id: replacedId,
                  deletedAt: deps.stamp(previous.updatedAt),
                },
              ]
            : c.deletedSpaceRecords,
        spaceInvites: [
          ...c.spaceInvites.filter((open) => open.inviteId !== replaces),
          { inviteId, invitedBy: member.memberId, expiresAt },
        ],
        sentInvites: { ...sentInvites, [inviteId]: { epoch } },
        pendingPuts: withPending(c.pendingPuts, [
          inviteRecordId(inviteId),
          ...(replacedId ? [replacedId] : []),
        ]),
      })
    })
  }

  async function reissueInvites(spaceId: string, member: SpaceMemberKeys) {
    const car = ctx.cars()[spaceId]
    if (!car) return
    const now = deps.syncNow()
    const open = new Set(car.spaceInvites.map((invite) => invite.inviteId))
    const tags = new Set(car.members.map((m) => m.tag))
    const closing = store.getState().closingInvites[spaceId] ?? {}
    const records = new Map(car.inviteRecords.map((i) => [i.inviteId, i]))
    for (const [inviteId, sent] of Object.entries(car.sentInvites)) {
      const record = records.get(inviteId)
      if (
        (!sent.owed && (sent.epoch >= car.epoch || open.has(inviteId))) ||
        closing[inviteId] ||
        !record ||
        record.expiresAt <= now ||
        tags.has(record.tag)
      )
        continue
      try {
        if (open.has(inviteId)) {
          await client.deleteInvite(ctx.auth(member), inviteId, ctx.call())
          ctx.noteAnswered()
        }
        const invite = await openInvite(spaceId, member, record, {
          expiresAt: record.expiresAt,
          replaces: inviteId,
        })
        deps.onInviteReissued?.({ spaceId, previousInviteId: inviteId, invite })
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) throw error
        ctx.noteFailure(error)
        ctx.report(error, 'invite/create')
      }
    }
  }

  function withoutInvite(car: SharedCar, inviteId: string): SharedCar {
    const recordId = inviteRecordId(inviteId)
    const record = car.inviteRecords.find(
      (invite) => invite.inviteId === inviteId
    )
    const { [inviteId]: _closed, ...sentInvites } = car.sentInvites
    return withDerivedPeople({
      ...car,
      inviteRecords: car.inviteRecords.filter((invite) => invite !== record),
      spaceInvites: car.spaceInvites.filter(
        (invite) => invite.inviteId !== inviteId
      ),
      sentInvites,
      ...(record && {
        deletedSpaceRecords: [
          ...car.deletedSpaceRecords.filter((t) => t.id !== recordId),
          { id: recordId, deletedAt: deps.stamp(record.updatedAt) },
        ],
        pendingPuts: withPending(car.pendingPuts, [recordId]),
      }),
    })
  }

  async function closePendingInvites(
    spaceId: string,
    member: SpaceMemberKeys,
    only?: readonly string[]
  ) {
    const closing = store.getState().closingInvites[spaceId] ?? {}
    for (const [inviteId, { tag }] of Object.entries(closing)) {
      if (only && !only.includes(inviteId)) continue
      const car = ctx.cars()[spaceId]
      const record = car?.inviteRecords.find(
        (invite) => invite.inviteId === inviteId
      )
      const clear = () =>
        ctx.engineWrite(() =>
          store.getState().clearClosingInvite(spaceId, inviteId)
        )
      if (tag !== undefined && record && record.tag !== tag) {
        clear()
        continue
      }
      try {
        await client.deleteInvite(ctx.auth(member), inviteId, ctx.call())
        ctx.noteAnswered()
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) throw error
        if (isSpaceError(error, 'forbidden')) {
          clear()
          continue
        }
        if (!isSpaceError(error, 'not_found')) {
          ctx.noteFailure(error)
          ctx.report(error, 'invite/delete')
          continue
        }
      }
      ctx.update(spaceId, (c) => withoutInvite(c, inviteId))
      clear()
    }
  }

  async function closeInvite(
    spaceId: string,
    inviteId: string,
    tag?: string,
    options: Pick<CarSyncOptions, 'automatic'> = {}
  ): Promise<{ pending: boolean }> {
    if (!ctx.cars()[spaceId]) throw new SharedCarsError('not_found')
    if (!SPACE_ID_PATTERN.test(inviteId)) throw new SharedCarsError('not_found')
    ctx.engineWrite(() =>
      store
        .getState()
        .addClosingInvite(spaceId, inviteId, tag === undefined ? {} : { tag })
    )
    try {
      await parts.sync.syncCar(spaceId, options)
    } catch (error) {
      ctx.rethrowReset(error)
      ctx.report(error, 'invite/delete')
    }
    return {
      pending: Boolean(store.getState().closingInvites[spaceId]?.[inviteId]),
    }
  }

  function createInvite(
    spaceId: string,
    invitee: { name: string; tag: string }
  ): Promise<CarInvitePayload> {
    return ctx.serial(spaceId, async () => {
      if (!ctx.cars()[spaceId]) throw new SharedCarsError('not_found')
      const member = await ctx.memberFor(spaceId)
      const outcome = await parts.sync.runSteps(spaceId, member)

      if (outcome === 'waiting') throw new SharedCarsError('key_unverified')
      if (outcome !== 'synced') throw new SharedCarsError('not_found')
      const invite = await openInvite(spaceId, member, invitee)
      try {
        await parts.sync.push(spaceId, member)
      } catch (error) {
        if (isSpaceError(error, 'gone')) {
          parts.endings.endLocally(spaceId, 'gone')
          throw error
        }
        ctx.rethrowReset(error)
        ctx.noteFailure(error)
        ctx.report(error, 'put')
      }
      return invite
    })
  }

  async function joined(
    spaceId: string,
    member: SpaceMemberKeys,
    epoch: number,
    joinedAt: number | null,
    profile?: SharedCarProfile
  ) {
    let car = emptySharedCar(spaceId, { myMemberId: member.memberId, epoch })
    if (joinedAt !== null) {
      const data = memberRecordData(
        profile ?? (await ctx.profile()),
        spaceId,
        joinedAt
      )
      car = {
        ...car,
        memberRecords: [
          { memberId: member.memberId, ...data, updatedAt: deps.stamp() },
        ],

        ownRecordChecked: true,
        writtenName: data.name,
        writtenAvatar: data.avatar ?? null,
        pendingPuts: [memberRecordId(member.memberId)],
      }
    }
    ctx.engineWrite(() => {
      const state = store.getState()
      if (!state.cars[spaceId]) state.saveSharedCar(car)
      state.noteJoined(spaceId, ctx.joinTime(spaceId))
      state.clearJoining(spaceId)
    })
  }

  function notJoined(spaceId: string) {
    ctx.engineWrite(() => store.getState().clearJoining(spaceId))
    if (!ctx.cars()[spaceId]) {
      keyring.forget(spaceId)
      parts.keys.forget(spaceId)
    }
  }

  async function isMember(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<{ joinedAt: number; epoch: number; wrap: string } | false | null> {
    try {
      const head = await client.sync(
        ctx.auth(member),
        { since: 0, limit: 1 },
        ctx.call()
      )
      ctx.noteAnswered()
      const me = head.members.find((m) => m.memberId === member.memberId)
      return me
        ? { joinedAt: me.joinedAt, epoch: head.epoch, wrap: head.wrap }
        : false
    } catch (error) {
      ctx.rethrowReset(error)
      if (isSpaceError(error, 'gone') || isSpaceError(error, 'forbidden'))
        return false
      ctx.report(error, 'join')
      return null
    }
  }

  function markedKey(
    mark: SharedCarJoining,
    member: SpaceMemberKeys
  ): EpochKey | null {
    if (!mark.wrap) return null
    try {
      const key = unwrapSpaceKey(mark.wrap, member, {
        spaceId: mark.spaceId,
        epoch: mark.epoch,
        memberId: member.memberId,
      })
      return { epoch: mark.epoch, key }
    } catch (error) {
      ctx.report(error, 'join')
      return null
    }
  }

  function joinCar(
    payload: CarInvitePayload,
    profile?: SharedCarProfile
  ): Promise<{ spaceId: string }> {
    const invite = parseCarInvitePayload(payload)
    if (!invite) return Promise.reject(new SharedCarsError('invalid_invite'))
    const { spaceId } = invite
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      if (ctx.cars()[spaceId]) {
        await parts.sync.runSteps(spaceId, member)
        return { spaceId }
      }
      const earlier = store.getState().joining[spaceId]
      const invited: EpochKey = {
        epoch: invite.epoch,
        key: fromB64u(invite.key),
      }

      const wrap = ctx.wrapTo(
        keyring.key(spaceId, invite.epoch) ?? invited.key,
        member.dhPub,
        { spaceId, epoch: invite.epoch, memberId: member.memberId }
      )
      ctx.engineWrite(() =>
        store.getState().saveJoining({
          spaceId,
          inviteId: invite.inviteId,
          epoch: invite.epoch,
          startedAt: deps.syncNow(),
          wrap,
        })
      )
      let epoch = 0
      let joinedAt: number | null = null
      try {
        const answer = await client.join(
          {
            spaceId,
            inviteId: invite.inviteId,
            joinSecret: invite.joinSecret,
            epoch: invite.epoch,
            memberId: member.memberId,
            dhPub: member.dhPub,
            tokenHash: member.tokenHash,
            wrap,
          },
          ctx.call()
        )
        ctx.noteAnswered()

        parts.keys.trust(spaceId, invited)
        epoch = answer.epoch
        joinedAt = answer.joinedAt
      } catch (error) {
        if (isSpaceError(error) && AMBIGUOUS.has(error.code)) throw error
        const conflict = isSpaceError(error, 'conflict')
        const landed =
          conflict || earlier !== undefined
            ? await isMember(spaceId, member)
            : false
        if (landed === false) {
          notJoined(spaceId)
          throw error
        }

        if (landed === null && !conflict) throw error
        if (landed) {
          parts.keys.trustInvited(spaceId, invited, landed, member)
          epoch = landed.epoch

          if (!conflict) joinedAt = landed.joinedAt
        }
      }
      await joined(spaceId, member, epoch, joinedAt, profile)

      try {
        await parts.sync.push(spaceId, member)
        await parts.sync.runSteps(spaceId, member)
      } catch (error) {
        ctx.rethrowReset(error)
        ctx.noteFailure(error)
        ctx.report(error, 'join')
      }
      const people = ctx.cars()[spaceId]?.spaceMembers.length ?? 1
      deps.onOutcome?.({ type: 'joined', people })
      return { spaceId }
    })
  }

  async function confirmJoins(): Promise<void> {
    await Promise.all(
      Object.keys(store.getState().joining).map((spaceId) =>
        ctx
          .serial(spaceId, async () => {
            const mark = store.getState().joining[spaceId]
            if (!mark) return
            if (ctx.cars()[spaceId]) {
              ctx.engineWrite(() => store.getState().clearJoining(spaceId))
              return
            }
            const member = await ctx.memberFor(spaceId)
            const landed = await isMember(spaceId, member)
            if (landed === null) return
            if (!landed) return notJoined(spaceId)
            const invited = markedKey(mark, member)
            if (invited)
              parts.keys.trustInvited(spaceId, invited, landed, member)
            await joined(spaceId, member, landed.epoch, landed.joinedAt)
            deps.onJoinConfirmed?.({ spaceId, inviteId: mark.inviteId })
          })
          .catch((error: unknown) => ctx.report(error, 'join'))
      )
    )
  }

  return {
    reissueInvites,
    closePendingInvites,
    closeInvite,
    createInvite,
    joinCar,
    confirmJoins,
  }
}
