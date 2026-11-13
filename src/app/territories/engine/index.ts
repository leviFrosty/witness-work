import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { isSpaceError, SPACE_LIMITS } from '@/lib/sharedSpaces/client'
import {
  joinVerifier,
  memberTag,
  newSpaceId,
  newSpaceKey,
  SPACE_ID_PATTERN,
  type SpaceMemberKeys,
  unwrapSpaceKey,
  uuidFromHash,
} from '@/lib/sharedSpaces/crypto'
import type { EpochKey } from '@/lib/sharedSpaces/keyTrust'
import {
  checkLinkCreate,
  checkShare,
  clip,
  heldStreets,
  inviteRecordId,
  MEMBER_NAME_MAX,
  memberRecordId,
  SCOPED_LIMITS,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  deriveLinkSecret,
  guestLinkUrl,
  newLinkId,
  scopeIdForStreet,
  streetIdForScope,
} from '@/lib/sharedSpaces/scopes'
import { memberRecordData } from '@/app/sharedCars/profile'
import {
  AMBIGUOUS,
  createEngineContext,
} from '@/app/territories/engine/context'
import { createKeys, type TerritoryKeys } from '@/app/territories/engine/keys'
import {
  createSync,
  type SyncHooks,
  type TerritorySync,
} from '@/app/territories/engine/sync'
import {
  type TerritoryEngineDeps,
  type TerritoryInvitee,
  type TerritoryInvitePayload,
  TerritorySharingError,
  type TerritorySyncOutcome,
} from '@/app/territories/engine/types'
import {
  personalCopy,
  plainTitle,
  territoryById,
  viewOfSpace,
} from '@/app/territories/engine/views'
import {
  clearDoorRecords,
  finishTerritory,
} from '@/features/territories/lib/doors'
import { diffTerritory } from '@/features/territories/lib/shared/diff'
import { myRole } from '@/features/territories/lib/shared/projection'
import { emptySpace } from '@/features/territories/lib/shared/space'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import { withPending } from '@/features/territories/stores/territories'
import type {
  TerritoryEnding,
  TerritorySpace,
} from '@/features/territories/types/sharedTerritory'
import type { Territory } from '@/features/territories/types/territory'

export * from '@/app/territories/engine/types'

const INVITE_ATTEMPTS = 3

const CREATE_REFUSED = new Set<string>([
  'bad_request',
  'forbidden',
  'gone',
  'too_large',
  'limit',
])

export const scopeOf = (streetId: string) =>
  scopeIdForStreet(streetId.toLowerCase())

export const endedCopyId = (spaceId: string) =>
  uuidFromHash(sha256(utf8(`ww-territories/v1/ended|${spaceId}`)))

export function createTerritoryEngine(deps: TerritoryEngineDeps) {
  const ctx = createEngineContext(deps)
  const { client, store, keyring } = ctx
  const hooks: SyncHooks = {
    endLocally: (spaceId, reason) => endLocally(spaceId, reason),
    reissueInvites: (spaceId, member) => reissueInvites(spaceId, member),
  }
  const keys: TerritoryKeys = createKeys(ctx, (spaceId, member) =>
    sync.pull(spaceId, member)
  )
  const sync: TerritorySync = createSync(
    ctx,
    () => keys,
    () => hooks
  )

  const required = (spaceId: string) => {
    const space = ctx.space(spaceId)
    if (!space) throw new TerritorySharingError('not_found')
    return space
  }

  const streetNames = (space: TerritorySpace, scopes: readonly string[]) => {
    const view = viewOfSpace(store, space.spaceId)
    return scopes
      .map(
        (scopeId) =>
          view?.streets.find((s) => scopeOf(s.id) === scopeId)?.name ?? ''
      )
      .filter(Boolean)
      .slice(0, 30)
      .map((name) => clip(name, 80))
  }

  async function seedSpace(territoryId: string): Promise<string> {
    const territory = territoryById(store, territoryId)
    if (!territory) throw new TerritorySharingError('not_found')
    if (territory.shared) return territory.shared.spaceId
    if (territory.received || territory.finishedAt !== undefined)
      throw new TerritorySharingError('not_allowed')
    const spaceId = newSpaceId(deps.randomBytes)
    const member = await ctx.memberFor(spaceId)
    const startedAt = deps.syncNow()
    store
      .getState()
      .saveSeeding({ spaceId, territoryId, created: false, startedAt })
    const key = newSpaceKey(deps.randomBytes)
    keys.trust(spaceId, { epoch: 1, key })
    const wrap = ctx.wrapTo(key, member.dhPub, {
      spaceId,
      epoch: 1,
      memberId: member.memberId,
    })
    let joinedAt = startedAt
    try {
      const answer = await client.create(
        {
          spaceId,
          memberId: member.memberId,
          dhPub: member.dhPub,
          tokenHash: member.tokenHash,
          wrap,
          mode: 'scoped',
        },
        ctx.call()
      )
      joinedAt = answer.joinedAt
    } catch (error) {
      if (!isSpaceError(error, 'conflict')) {
        if (isSpaceError(error) && CREATE_REFUSED.has(error.code))
          abandonSeed(spaceId)
        else await deleteSeed(spaceId)
        throw error
      }
    }
    store
      .getState()
      .saveSeeding({ spaceId, territoryId, created: true, startedAt })
    try {
      const profile = await ctx.profile()
      let space = emptySpace(spaceId, {
        territoryId: territory.id,
        myMemberId: member.memberId,
        ownerId: member.memberId,
        members: [
          {
            memberId: member.memberId,
            dhPub: member.dhPub,
            joinedAt,
            scopes: null,
            invitedBy: null,
          },
        ],
      })
      const current = territoryById(store, territoryId) ?? territory
      const changes = diffTerritory(null, current, space, {
        me: member.memberId,
        myName: profile.name,
        houseRecords: !deps.privacy(),
        stamp: deps.stamp,
      })
      const memberData = memberRecordData(profile, spaceId, joinedAt)
      const records = {
        ...changes.records,
        [memberRecordId(member.memberId)]: {
          kind: 'member',
          data: { ...memberData },
          stamp: deps.stamp(),
          deleted: false,
        },
      }
      space = {
        ...space,
        records,
        pending: Object.keys(records),
        local: changes.local,
        ownRecordChecked: true,
        writtenName: memberData.name,
      }
      for (const batch of sync.seal(space, member, key).batches)
        await client.put(ctx.auth(member), batch.records, ctx.call())
      const latest = territoryById(store, territoryId) ?? current
      store.getState().saveSpace({ ...space, pending: [] }, territoryId)
      if (latest !== current) store.getState().update(territoryId, () => latest)
      store.getState().noteJoined(spaceId, joinedAt)
      store.getState().clearSeeding(spaceId)
      return spaceId
    } catch (error) {
      ctx.rethrowReset(error)
      await deleteSeed(spaceId)
      throw error
    }
  }

  function abandonSeed(spaceId: string) {
    store.getState().clearSeeding(spaceId)
    keyring.forget(spaceId)
    keys.forget(spaceId)
    ctx.forgetMember(spaceId)
  }

  async function deleteSeed(spaceId: string) {
    store.getState().setPendingEnd(spaceId, 'delete')
    abandonSeed(spaceId)
    await finishEnd(spaceId).catch((error: unknown) =>
      ctx.report(error, 'delete')
    )
  }

  async function abandonSeeds() {
    for (const spaceId of Object.keys(store.getState().seeding))
      if (!ctx.space(spaceId)) await deleteSeed(spaceId)
      else store.getState().clearSeeding(spaceId)
  }

  function ensureSpace(territoryId: string): Promise<string> {
    const shared = territoryById(store, territoryId)?.shared
    if (shared) return Promise.resolve(shared.spaceId)
    return ctx.serial(`seed:${territoryId}`, () => seedSpace(territoryId))
  }

  async function openInvite(
    spaceId: string,
    member: SpaceMemberKeys,
    invitee: TerritoryInvitee,
    {
      scopes,
      handoff,
      replaces,
    }: { scopes: string[] | null; handoff: boolean; replaces?: string }
  ): Promise<TerritoryInvitePayload> {
    let calibrated = false
    for (let attempt = 0; ; attempt++) {
      const space = required(spaceId)
      const key = keys.sealingKey(space)
      if (!key) throw new TerritorySharingError('key_unverified')
      const inviteId = toB64u(deps.randomBytes(16))
      const joinSecret = deps.randomBytes(32)
      const expiresAt = Math.floor(
        deps.syncNow() + SPACE_LIMITS.inviteLifetimeMs
      )
      try {
        await client.createInvite(
          ctx.auth(member),
          {
            inviteId,
            joinVerifier: joinVerifier(joinSecret),
            expiresAt,
            epoch: space.epoch,
            ...(scopes && { scopes }),
            ...(handoff && { handoff: true }),
          },
          ctx.call()
        )
      } catch (error) {
        if (isSpaceError(error) && AMBIGUOUS.has(error.code))
          store.getState().addClosingInvite(spaceId, inviteId)
        if (isSpaceError(error, 'stale_key') && attempt < INVITE_ATTEMPTS) {
          await sync.pull(spaceId, member)
          continue
        }
        if (isSpaceError(error, 'bad_request') && !calibrated) {
          calibrated = true
          await ctx.refreshClock()
          continue
        }
        throw error
      }
      const now = deps.syncNow()
      const recordId = inviteRecordId(inviteId)
      const previousId = replaces && inviteRecordId(replaces)
      ctx.update(spaceId, (s) => {
        const previous = previousId ? s.records[previousId] : undefined
        const { [replaces ?? '']: _old, ...sentInvites } = s.sentInvites
        return {
          ...s,
          invites: [
            ...s.invites.filter((i) => i.inviteId !== replaces),
            {
              inviteId,
              invitedBy: member.memberId,
              expiresAt,
              scopes,
              handoff,
            },
          ],
          holders: handoff
            ? [
                ...s.holders.filter((h) => h.scopeId !== scopes?.[0]),
                {
                  scopeId: scopes![0]!,
                  memberId: null,
                  inviteId,
                  since: now,
                },
              ]
            : s.holders,
          records: {
            ...s.records,
            [recordId]: {
              kind: 'invite',
              data: {
                invitedBy: member.memberId,
                name: clip(invitee.name.trim(), MEMBER_NAME_MAX),
                tag: invitee.tag,
                expiresAt,
                ...(scopes && { scopes }),
                ...(handoff && { handoff: true }),
              },
              stamp: deps.stamp(),
              deleted: false,
            },
            ...(previousId &&
              previous && {
                [previousId]: {
                  kind: 'invite',
                  stamp: deps.stamp(previous.stamp),
                  deleted: true,
                },
              }),
          },
          pending: withPending(s.pending, [
            recordId,
            ...(previousId ? [previousId] : []),
          ]),
          sentInvites: {
            ...sentInvites,
            [inviteId]: {
              epoch: space.epoch,
              to: invitee.inboxId,
              scopes,
              handoff,
            },
          },
        }
      })
      const after = required(spaceId)
      const view = viewOfSpace(store, spaceId)
      return {
        spaceId,
        inviteId,
        joinSecret: toB64u(joinSecret),
        epoch: space.epoch,
        key: toB64u(key),
        title: view ? plainTitle(view) : '',
        streets: scopes ? streetNames(after, scopes) : [],
        handoff,
        people: after.members.length,
        expiresAt,
      }
    }
  }

  async function reissueInvites(spaceId: string, member: SpaceMemberKeys) {
    const space = ctx.space(spaceId)
    if (!space) return
    const open = new Set(space.invites.map((i) => i.inviteId))
    const now = deps.syncNow()
    const onSpace = new Set(space.members.map((m) => m.memberId))
    const tags = new Set(
      Object.entries(space.records)
        .filter(
          ([id, r]) =>
            id.startsWith('m.') && onSpace.has(id.slice(2)) && !r.deleted
        )
        .map(([, r]) => r.data?.tag)
    )
    for (const [inviteId, sent] of Object.entries(space.sentInvites)) {
      if (open.has(inviteId)) continue
      const record = space.records[inviteRecordId(inviteId)]
      const tag = record?.data?.tag
      const expiresAt = record?.data?.expiresAt
      const done =
        !record ||
        record.deleted ||
        tags.has(tag) ||
        (typeof expiresAt === 'number' && expiresAt <= now) ||
        sent.epoch >= space.epoch ||
        store.getState().closingInvites[spaceId]?.[inviteId]
      if (done) {
        ctx.update(spaceId, (s) => {
          const { [inviteId]: _done, ...sentInvites } = s.sentInvites
          return { ...s, sentInvites }
        })
        continue
      }
      try {
        const invite = await openInvite(
          spaceId,
          member,
          {
            inboxId: sent.to,
            name: String(record.data?.name ?? ''),
            tag: String(tag ?? ''),
          },
          { scopes: sent.scopes, handoff: sent.handoff, replaces: inviteId }
        )
        deps.onInviteReissued?.({
          spaceId,
          previousInviteId: inviteId,
          to: sent.to,
          invite,
        })
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) throw error
        ctx.report(error, 'invite/create')
      }
    }
  }

  function memberWithTag(space: TerritorySpace, tag: string) {
    return space.members.find(
      (m) => space.records[memberRecordId(m.memberId)]?.data?.tag === tag
    )
  }

  function openInviteTo(space: TerritorySpace, tag: string) {
    return space.invites.find(
      (i) => space.records[inviteRecordId(i.inviteId)]?.data?.tag === tag
    )
  }

  type ShareResult = {
    invites: { to: string; invite: TerritoryInvitePayload }[]
    canceled: {
      to: string
      spaceId: string
      inviteId: string
      expiresAt: number
    }[]
    widened: number
  }

  async function shareWithBuddies(
    territoryId: string,
    buddies: readonly { inboxId: string; name: string }[],
    streetIds?: readonly string[]
  ): Promise<ShareResult> {
    if (buddies.length === 0) return { invites: [], canceled: [], widened: 0 }
    const spaceId = await ensureSpace(territoryId)
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      await sync.runSteps(spaceId, member)
      const before = required(spaceId)
      const held = myRole(before) === 'owner' ? [] : linkScopes(before)
      const wanted = streetIds
        ? streetIds.map(scopeOf)
        : held.length > 0
          ? held
          : null
      if (wanted?.length === 0)
        throw new TerritorySharingError('nothing_to_share')
      const result: ShareResult = { invites: [], canceled: [], widened: 0 }
      for (const buddy of buddies) {
        const space = required(spaceId)
        const tag = memberTag(spaceId, buddy.inboxId)
        const already = memberWithTag(space, tag)
        if (already) {
          if (already.scopes === null) continue
          const union =
            wanted === null
              ? null
              : [...new Set([...already.scopes, ...wanted])]
          if (union && union.length === already.scopes.length) continue
          await client.setMemberScopes(
            ctx.auth(member),
            { target: already.memberId, scopes: union },
            ctx.call()
          )
          ctx.update(spaceId, (s) => ({
            ...s,
            members: s.members.map((m) =>
              m.memberId === already.memberId ? { ...m, scopes: union } : m
            ),
          }))
          result.widened += 1
          continue
        }
        let scopes = wanted
        const waiting = openInviteTo(space, tag)
        if (waiting && !waiting.handoff) {
          if (waiting.scopes === null) continue
          scopes =
            wanted === null
              ? null
              : [...new Set([...waiting.scopes, ...wanted])]
          if (scopes && scopes.length === waiting.scopes.length) continue
          await closeInvite(spaceId, member, waiting.inviteId)
          result.canceled.push({
            to: buddy.inboxId,
            spaceId,
            inviteId: waiting.inviteId,
            expiresAt: waiting.expiresAt,
          })
        }
        const check = checkShare(
          {
            ownerId: space.ownerId,
            members: space.members,
            invites: space.invites,
            holders: space.holders,
            links: space.links,
          },
          member.memberId,
          { scopes }
        )
        if (check !== 'ok') throw new TerritorySharingError('not_allowed')
        const invite = await openInvite(
          spaceId,
          member,
          { inboxId: buddy.inboxId, name: buddy.name, tag },
          { scopes, handoff: false }
        )
        result.invites.push({ to: buddy.inboxId, invite })
      }
      await sync.push(spaceId, member)
      deps.onOutcome?.({
        type: 'shared',
        scope: wanted === null ? 'whole' : 'streets',
        people: buddies.length,
      })
      return result
    })
  }

  async function closeInvite(
    spaceId: string,
    member: SpaceMemberKeys,
    inviteId: string
  ) {
    try {
      await client.deleteInvite(ctx.auth(member), inviteId, ctx.call())
    } catch (error) {
      if (!isSpaceError(error, 'not_found')) throw error
    }
    ctx.update(spaceId, (s) => {
      const recordId = inviteRecordId(inviteId)
      const record = s.records[recordId]
      const { [inviteId]: _sent, ...sentInvites } = s.sentInvites
      return {
        ...s,
        invites: s.invites.filter((i) => i.inviteId !== inviteId),
        holders: s.holders.filter((h) => h.inviteId !== inviteId),
        sentInvites,
        ...(record &&
          !record.deleted && {
            records: {
              ...s.records,
              [recordId]: {
                kind: 'invite',
                stamp: deps.stamp(record.stamp),
                deleted: true,
              },
            },
            pending: withPending(s.pending, [recordId]),
          }),
      }
    })
  }

  function cancelInvite(spaceId: string, inviteId: string) {
    return ctx.serial(spaceId, async () => {
      const space = required(spaceId)
      const to = space.sentInvites[inviteId]?.to
      const member = await ctx.memberFor(spaceId)
      const expiresAt =
        space.invites.find((i) => i.inviteId === inviteId)?.expiresAt ??
        deps.syncNow()
      await closeInvite(spaceId, member, inviteId)
      await sync.runSteps(spaceId, member)
      return { to, expiresAt }
    })
  }

  function inviteDeclined(spaceId: string, inviteId: string) {
    if (!ctx.space(spaceId)) return Promise.resolve()
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      await closeInvite(spaceId, member, inviteId)
      await sync.runSteps(spaceId, member)
    })
  }

  function stopSharingWith(territoryId: string, personId: string) {
    const spaceId = territoryById(store, territoryId)?.shared?.spaceId
    if (!spaceId) return Promise.reject(new TerritorySharingError('not_found'))
    const space = required(spaceId)
    if (space.invites.some((i) => i.inviteId === personId))
      return cancelInvite(spaceId, personId).then(() => undefined)
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      if (!SPACE_ID_PATTERN.test(personId) || personId === member.memberId)
        throw new TerritorySharingError('not_found')
      await client.removeMember(ctx.auth(member), personId, ctx.call())
      await sync.runSteps(spaceId, member)
    })
  }

  async function joinLanded(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<{ joinedAt: number; epoch: number; wrap: string } | false | null> {
    try {
      const head = await client.sync(
        ctx.auth(member),
        { since: 0, limit: 1 },
        ctx.call()
      )
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

  async function joined(
    spaceId: string,
    member: SpaceMemberKeys,
    epoch: number,
    joinedAt: number
  ) {
    if (!ctx.space(spaceId)) {
      const profile = await ctx.profile()
      const data = memberRecordData(profile, spaceId, joinedAt)
      const id = memberRecordId(member.memberId)
      store.getState().saveSpace(
        emptySpace(spaceId, {
          territoryId: endedCopyId(`${spaceId}|live`),
          myMemberId: member.memberId,
          epoch,
          records: {
            [id]: {
              kind: 'member',
              data: { ...data },
              stamp: deps.stamp(),
              deleted: false,
            },
          },
          pending: [id],
          ownRecordChecked: true,
          writtenName: data.name,
        })
      )
    }
    store.getState().noteJoined(spaceId, Math.max(deps.syncNow(), joinedAt))
    store.getState().clearJoining(spaceId)
  }

  function notJoined(spaceId: string) {
    store.getState().clearJoining(spaceId)
    if (!ctx.space(spaceId)) {
      keyring.forget(spaceId)
      keys.forget(spaceId)
    }
  }

  function joinTerritory(payload: TerritoryInvitePayload) {
    const { spaceId } = payload
    if (!SPACE_ID_PATTERN.test(spaceId))
      return Promise.reject(new TerritorySharingError('invalid_invite'))
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      if (ctx.space(spaceId)) {
        await sync.runSteps(spaceId, member)
        return { spaceId }
      }
      const earlier = store.getState().joining[spaceId]
      const invited: EpochKey = {
        epoch: payload.epoch,
        key: fromB64u(payload.key),
      }
      const wrap = ctx.wrapTo(
        keyring.key(spaceId, payload.epoch) ?? invited.key,
        member.dhPub,
        { spaceId, epoch: payload.epoch, memberId: member.memberId }
      )
      store.getState().saveJoining({
        spaceId,
        inviteId: payload.inviteId,
        epoch: payload.epoch,
        startedAt: deps.syncNow(),
        wrap,
      })
      let epoch = payload.epoch
      let joinedAt = deps.syncNow()
      try {
        const answer = await client.join(
          {
            spaceId,
            inviteId: payload.inviteId,
            joinSecret: payload.joinSecret,
            epoch: payload.epoch,
            memberId: member.memberId,
            dhPub: member.dhPub,
            tokenHash: member.tokenHash,
            wrap,
          },
          ctx.call()
        )
        keys.trust(spaceId, invited)
        epoch = answer.epoch
        joinedAt = answer.joinedAt
      } catch (error) {
        if (isSpaceError(error) && AMBIGUOUS.has(error.code)) throw error
        const conflict = isSpaceError(error, 'conflict')
        const landed =
          conflict || earlier !== undefined
            ? await joinLanded(spaceId, member)
            : false
        if (landed === false) {
          notJoined(spaceId)
          throw error
        }
        if (landed === null) throw error
        keys.trustInvited(spaceId, invited, landed, member)
        epoch = landed.epoch
        joinedAt = landed.joinedAt
      }
      await joined(spaceId, member, epoch, joinedAt)
      try {
        await sync.runSteps(spaceId, member)
      } catch (error) {
        ctx.rethrowReset(error)
        ctx.noteFailure(error)
        ctx.report(error, 'join')
      }
      deps.onOutcome?.({ type: 'joined', handoff: payload.handoff })
      return { spaceId }
    })
  }

  async function confirmJoins() {
    await Promise.all(
      Object.keys(store.getState().joining).map((spaceId) =>
        ctx
          .serial(spaceId, async () => {
            const mark = store.getState().joining[spaceId]
            if (!mark) return
            if (ctx.space(spaceId))
              return store.getState().clearJoining(spaceId)
            const member = await ctx.memberFor(spaceId)
            const landed = await joinLanded(spaceId, member)
            if (landed === null) return
            if (!landed) return notJoined(spaceId)
            if (mark.wrap)
              try {
                const key = unwrapSpaceKey(mark.wrap, member, {
                  spaceId,
                  epoch: mark.epoch,
                  memberId: member.memberId,
                })
                keys.trustInvited(
                  spaceId,
                  { epoch: mark.epoch, key },
                  landed,
                  member
                )
              } catch (error) {
                ctx.report(error, 'join')
              }
            await joined(spaceId, member, landed.epoch, landed.joinedAt)
          })
          .catch((error: unknown) => ctx.report(error, 'join'))
      )
    )
  }

  function endLocally(spaceId: string, reason: TerritoryEnding) {
    const space = ctx.space(spaceId)
    const view = viewOfSpace(store, spaceId)
    let keep: Territory | undefined
    if (view && space) {
      const owner = myRole(space) === 'owner'
      if (owner && (reason === 'returned' || reason === 'gone'))
        keep = finishTerritory(
          personalCopy(view),
          deps.now(),
          formatDoorAddress
        )
      else if (!owner && reason === 'gone' && view.received)
        keep = {
          ...clearDoorRecords(personalCopy(view), formatDoorAddress),
          id: endedCopyId(spaceId),
          received: { ...view.received, endedAt: deps.now() },
        }
    }
    store.getState().removeSpace(spaceId, keep)
    store
      .getState()
      .noteLeft(
        spaceId,
        Math.max(
          deps.syncNow(),
          store.getState().memberships.territories[spaceId]?.at ?? 0
        )
      )
    store.getState().clearJoining(spaceId)
    keyring.forget(spaceId)
    keys.forget(spaceId)
    ctx.forgetMember(spaceId)
    if (view) {
      deps.onOutcome?.({ type: 'ended', reason })
      deps.onEnded?.({ spaceId, title: plainTitle(view), reason })
    }
  }

  async function finishEnd(spaceId: string): Promise<boolean> {
    const end = store.getState().pendingEnds[spaceId]
    if (!end) return true
    const clear = () => store.getState().clearPendingEnd(spaceId)
    if (ctx.space(spaceId)) {
      clear()
      return true
    }
    const member = await ctx.memberFor(spaceId)
    try {
      if (end === 'delete')
        await client.deleteSpace(ctx.auth(member), ctx.call())
      else await client.leave(ctx.auth(member), ctx.call())
    } catch (error) {
      ctx.rethrowReset(error)
      if (
        !isSpaceError(error, 'gone') &&
        !isSpaceError(error, 'not_found') &&
        !isSpaceError(error, 'forbidden') &&
        !isSpaceError(error, 'bad_request')
      ) {
        ctx.noteFailure(error)
        ctx.report(error, end)
        return false
      }
    }
    clear()
    return true
  }

  async function finishPendingEnds() {
    await Promise.all(
      Object.keys(store.getState().pendingEnds).map((spaceId) =>
        ctx
          .serial(spaceId, () => finishEnd(spaceId))
          .catch((error: unknown) => ctx.report(error, 'end'))
      )
    )
    return { pending: Object.keys(store.getState().pendingEnds).length }
  }

  async function syncBeforeEnding(spaceId: string) {
    const member = await ctx.memberFor(spaceId)
    try {
      await sync.pull(spaceId, member)
      await sync.push(spaceId, member)
    } catch (error) {
      ctx.rethrowReset(error)
      if (isSpaceError(error, 'gone')) {
        endLocally(spaceId, 'gone')
        return false
      }
      ctx.report(error, 'end')
    }
    return true
  }

  async function endAndTell(
    spaceId: string,
    reason: TerritoryEnding,
    end: 'leave' | 'delete'
  ) {
    store.getState().setPendingEnd(spaceId, end)
    endLocally(spaceId, reason)
    return { pending: !(await finishEnd(spaceId)) }
  }

  function leaveTerritory(territoryId: string) {
    const spaceId = territoryById(store, territoryId)?.shared?.spaceId
    if (!spaceId) return Promise.reject(new TerritorySharingError('not_found'))
    return ctx.serial(spaceId, async () => {
      const space = required(spaceId)
      if (myRole(space) === 'owner')
        throw new TerritorySharingError('not_allowed')
      if (!(await syncBeforeEnding(spaceId))) return { pending: false }
      return endAndTell(spaceId, 'left', 'leave')
    })
  }

  function returnTerritory(territoryId: string) {
    const spaceId = territoryById(store, territoryId)?.shared?.spaceId
    if (!spaceId) return Promise.reject(new TerritorySharingError('not_found'))
    return ctx.serial(spaceId, async () => {
      const space = required(spaceId)
      if (myRole(space) !== 'owner')
        throw new TerritorySharingError('not_owner')
      if (!(await syncBeforeEnding(spaceId))) return { pending: false }
      return endAndTell(spaceId, 'returned', 'delete')
    })
  }

  function linkScopes(space: TerritorySpace, streetIds?: readonly string[]) {
    const me = space.myMemberId
    const held = heldStreets(
      {
        ownerId: space.ownerId,
        members: space.members,
        invites: space.invites,
        holders: space.holders,
        links: space.links,
      },
      me
    )
    const view = viewOfSpace(store, space.spaceId)
    const all = (view?.streets ?? [])
      .map((street) => scopeOf(street.id))
      .filter((scopeId) =>
        myRole(space) === 'owner'
          ? !space.holders.some(
              (h) =>
                h.scopeId === scopeId &&
                (h.memberId !== null || h.inviteId !== null)
            )
          : held.includes(scopeId)
      )
    return streetIds
      ? streetIds.map(scopeOf).filter((s) => all.includes(s))
      : all
  }

  async function linkUrl(spaceId: string, linkId: string) {
    const seed = await ctx.seed()
    return guestLinkUrl(deps.variant, {
      spaceId,
      linkId,
      linkSecret: deriveLinkSecret(seed, spaceId, linkId),
    })
  }

  async function createLink(
    territoryId: string,
    streetIds?: readonly string[]
  ) {
    const spaceId = await ensureSpace(territoryId)
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      await sync.runSteps(spaceId, member)
      for (let attempt = 0; ; attempt++) {
        const space = required(spaceId)
        if (
          myRole(space) !== 'owner' &&
          !space.holders.some((h) => h.memberId === member.memberId)
        )
          throw new TerritorySharingError('not_allowed')
        const scopes = linkScopes(space, streetIds).slice(
          0,
          SCOPED_LIMITS.scopesPerLink
        )
        if (scopes.length === 0)
          throw new TerritorySharingError('nothing_to_share')
        if (
          checkLinkCreate(
            {
              ownerId: space.ownerId,
              members: space.members,
              invites: space.invites,
              holders: space.holders,
              links: space.links,
            },
            member.memberId,
            scopes
          ) !== 'ok'
        )
          throw new TerritorySharingError('not_allowed')
        const linkId = newLinkId(deps.randomBytes)
        const seed = await ctx.seed()
        const { verifier } = deriveLinkCredentials(
          deriveLinkSecret(seed, spaceId, linkId)
        )
        const expiresAt = Math.floor(
          deps.syncNow() + SCOPED_LIMITS.linkLifetimeMs
        )
        try {
          await client.createLink(
            ctx.auth(member),
            { linkId, verifier, scopes, expiresAt, epoch: space.epoch },
            ctx.call()
          )
        } catch (error) {
          if (isSpaceError(error, 'stale_key') && attempt < INVITE_ATTEMPTS) {
            await sync.pull(spaceId, member)
            continue
          }
          throw error
        }
        ctx.update(spaceId, (s) => ({
          ...s,
          links: [
            ...s.links,
            {
              linkId,
              createdBy: member.memberId,
              scopes,
              createdAt: deps.syncNow(),
              expiresAt,
              endedAt: null,
            },
          ],
        }))
        await sync.putGuestKeys(spaceId, member, linkId)
        deps.onOutcome?.({ type: 'link_created', streets: scopes.length })
        return { spaceId, linkId, url: await linkUrl(spaceId, linkId) }
      }
    })
  }

  function endLink(spaceId: string, linkId: string) {
    return ctx.serial(spaceId, async () => {
      required(spaceId)
      const member = await ctx.memberFor(spaceId)
      await client.endLink(ctx.auth(member), linkId, ctx.call())
      ctx.update(spaceId, (s) => ({
        ...s,
        links: s.links.map((link) =>
          link.linkId === linkId && link.endedAt === null
            ? { ...link, endedAt: deps.syncNow() }
            : link
        ),
      }))
      deps.onOutcome?.({ type: 'link_ended' })
      await sync.runSteps(spaceId, member).catch((error: unknown) => {
        ctx.rethrowReset(error)
        ctx.report(error, 'sync')
      })
    })
  }

  type HandOffResult =
    | { kind: 'invite'; to: string; invite: TerritoryInvitePayload }
    | {
        kind: 'existing'
        to: string
        spaceId: string
        scopeId: string
        street: string
        since: number
      }

  async function handOff(
    territoryId: string,
    streetId: string,
    buddy: { inboxId: string; name: string }
  ): Promise<HandOffResult> {
    const spaceId = await ensureSpace(territoryId)
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      await sync.runSteps(spaceId, member)
      const space = required(spaceId)
      if (myRole(space) !== 'owner')
        throw new TerritorySharingError('not_owner')
      const scopeId = scopeOf(streetId)
      const tag = memberTag(spaceId, buddy.inboxId)
      const target = memberWithTag(space, tag)
      const street = streetNames(space, [scopeId])[0] ?? ''
      if (target) {
        await client.createHandoff(
          ctx.auth(member),
          { scopeId, target: target.memberId },
          ctx.call()
        )
        const since = deps.syncNow()
        ctx.update(spaceId, (s) => ({
          ...s,
          holders: [
            ...s.holders.filter((h) => h.scopeId !== scopeId),
            { scopeId, memberId: target.memberId, inviteId: null, since },
          ],
        }))
        await sync.runSteps(spaceId, member)
        deps.onOutcome?.({ type: 'handoff', action: 'handed' })
        return {
          kind: 'existing',
          to: buddy.inboxId,
          spaceId,
          scopeId,
          street,
          since,
        }
      }
      const invite = await openInvite(
        spaceId,
        member,
        { inboxId: buddy.inboxId, name: buddy.name, tag },
        { scopes: [scopeId], handoff: true }
      )
      await sync.push(spaceId, member)
      deps.onOutcome?.({ type: 'handoff', action: 'handed' })
      return { kind: 'invite', to: buddy.inboxId, invite }
    })
  }

  function endHandoff(territoryId: string, streetId: string) {
    const spaceId = territoryById(store, territoryId)?.shared?.spaceId
    if (!spaceId) return Promise.reject(new TerritorySharingError('not_found'))
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      try {
        await sync.pull(spaceId, member)
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) {
          endLocally(spaceId, 'gone')
          return {}
        }
        ctx.report(error, 'sync')
      }
      const space = required(spaceId)
      const scopeId = scopeOf(streetId)
      const hold = space.holders.find((h) => h.scopeId === scopeId)
      const owner = myRole(space) === 'owner'
      const pendingInvite = hold?.memberId === null ? hold.inviteId : null
      if (owner && pendingInvite) {
        const to = space.sentInvites[pendingInvite]?.to
        await closeInvite(spaceId, member, pendingInvite)
        await sync.runSteps(spaceId, member)
        deps.onOutcome?.({ type: 'handoff', action: 'taken_back' })
        return { canceled: to ? { to, inviteId: pendingInvite } : undefined }
      }
      try {
        await client.endHandoff(ctx.auth(member), scopeId, ctx.call())
      } catch (error) {
        if (isSpaceError(error, 'gone')) {
          endLocally(spaceId, 'gone')
          return {}
        }
        throw error
      }
      ctx.update(spaceId, (s) => ({
        ...s,
        holders: s.holders.filter((h) => h.scopeId !== scopeId),
      }))
      deps.onOutcome?.({
        type: 'handoff',
        action: owner ? 'taken_back' : 'given_back',
      })
      await sync.runSteps(spaceId, member).catch((error: unknown) => {
        ctx.rethrowReset(error)
        ctx.report(error, 'sync')
      })
      return {}
    })
  }

  async function syncAll(options: { automatic?: boolean } = {}) {
    if (
      options.automatic &&
      (ctx.backPressure.coolingDown() || deps.canSync?.() === false)
    )
      return {}
    await abandonSeeds().catch((error: unknown) => ctx.report(error, 'seed'))
    await finishPendingEnds()
    await confirmJoins()
    const outcomes: Record<string, TerritorySyncOutcome | { error: string }> =
      {}
    await Promise.all(
      Object.keys(ctx.spaces()).map(async (spaceId) => {
        try {
          outcomes[spaceId] = await sync.syncSpace(spaceId, options)
        } catch (error) {
          outcomes[spaceId] = {
            error:
              isSpaceError(error) || error instanceof TerritorySharingError
                ? error.code
                : 'unknown',
          }
        }
      })
    )
    return outcomes
  }

  function addFromRoster(spaceId: string, at: number) {
    if (!SPACE_ID_PATTERN.test(spaceId)) return Promise.resolve('missing')
    const left = store.getState().memberships.leftTerritories[spaceId]
    if (left !== undefined && left >= at) return Promise.resolve('skipped')
    store.getState().noteJoined(spaceId, at)
    if (ctx.space(spaceId) || store.getState().seeding[spaceId])
      return Promise.resolve('skipped')
    return ctx
      .serial(spaceId, async () => {
        const member = await ctx.memberFor(spaceId)
        if (!ctx.space(spaceId))
          store.getState().saveSpace(
            emptySpace(spaceId, {
              territoryId: endedCopyId(`${spaceId}|live`),
              myMemberId: member.memberId,
            })
          )
      })
      .then(() => sync.syncSpace(spaceId))
  }

  async function adoptOwnSpace(mark: {
    spaceId: string
    ownerId: string
    at: number
  }): Promise<string> {
    const { spaceId, ownerId, at } = mark
    const state = store.getState()
    if (
      !SPACE_ID_PATTERN.test(spaceId) ||
      ctx.space(spaceId) ||
      state.seeding[spaceId] ||
      state.pendingEnds[spaceId]
    )
      return 'skipped'
    const member = await ctx.memberFor(spaceId)
    if (member.memberId !== ownerId) return 'skipped'
    return addFromRoster(spaceId, at)
  }

  function dropFromRoster(spaceId: string, leftAt: number) {
    store.getState().noteLeft(spaceId, leftAt)
    const joinedAt = store.getState().memberships.territories[spaceId]?.at
    if (joinedAt !== undefined && joinedAt > leftAt) return Promise.resolve()
    return ctx.serial(spaceId, async () => {
      if (ctx.space(spaceId)) endLocally(spaceId, 'left_elsewhere')
    })
  }

  async function leaveAll() {
    const titles = new Map<string, string>()
    for (const spaceId of Object.keys(ctx.spaces())) {
      const view = viewOfSpace(store, spaceId)
      titles.set(spaceId, view ? plainTitle(view) : '')
      try {
        await ctx.serial(spaceId, async () => {
          const space = required(spaceId)
          if (!(await syncBeforeEnding(spaceId))) return
          if (myRole(space) === 'owner')
            await endAndTell(spaceId, 'returned', 'delete')
          else await endAndTell(spaceId, 'left', 'leave')
        })
      } catch (error) {
        ctx.report(error, 'leave')
      }
    }
    await finishPendingEnds()
    const state = store.getState()
    const notLeft = [
      ...new Set([
        ...Object.keys(state.spaces),
        ...Object.keys(state.pendingEnds),
      ]),
    ].map((spaceId) => ({ spaceId, name: titles.get(spaceId) ?? '' }))
    return { pending: notLeft.length, notLeft }
  }

  function resyncWithoutPrivacy() {
    for (const space of Object.values(ctx.spaces()))
      if (myRole(space) !== 'owner')
        ctx.update(space.spaceId, (s) => ({ ...s, seq: 0 }))
  }

  return {
    ensureSpace,
    shareWithBuddies,
    cancelInvite,
    inviteDeclined,
    stopSharingWith,
    joinTerritory,
    confirmJoins,
    leaveTerritory,
    returnTerritory,
    createLink,
    linkUrl,
    endLink,
    handOff,
    endHandoff,
    syncAll,
    syncSpace: sync.syncSpace,
    finishPendingEnds,
    addFromRoster,
    adoptOwnSpace,
    dropFromRoster,
    leaveAll,
    resyncWithoutPrivacy,
    streetOfScope: (scopeId: string) => streetIdForScope(scopeId),
    async openLive(spaceId: string) {
      return client.openLive(ctx.auth(await ctx.memberFor(spaceId)))
    },
    coolingDownUntil: () => ctx.backPressure.until(),
    forgetAll() {
      ctx.reset()
      store.getState().reset()
      keyring.forgetAll()
      ctx.forgetMembers()
      keys.forgetAll()
      sync.forgetAll()
    },
    cancel: ctx.cancel,
  }
}

export type TerritoryEngine = ReturnType<typeof createTerritoryEngine>
