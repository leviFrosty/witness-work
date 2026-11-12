import { toB64u } from '@/lib/bytes'
import {
  isSpaceError,
  putRecordBytes,
  SPACE_LIMITS,
  type SpacePutRecord,
  type SpaceSyncPage,
} from '@/lib/sharedSpaces/client'
import {
  memberCheck,
  SpaceOpenError,
  type SpaceMemberKeys,
} from '@/lib/sharedSpaces/crypto'
import { checkMatches } from '@/lib/sharedSpaces/keyTrust'
import {
  epochOfKeysRecord,
  guestKeysRecordId,
  keysRecordData,
  keysRecordId,
  mayReadRecord,
  mayWriteRecord,
  memberRecordId,
  openRecordWithKey,
  parseScopedRecordId,
  readMemberData,
  scopedRecordKey,
  sealRecordWithKey,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  deriveLinkSecret,
  deriveScopeKey,
} from '@/lib/sharedSpaces/scopes'
import { memberRecordData, sameMemberData } from '@/app/sharedCars/profile'
import type { EngineContext } from '@/app/territories/engine/context'
import type { TerritoryKeys } from '@/app/territories/engine/keys'
import type { TerritorySyncOutcome } from '@/app/territories/engine/types'
import { plainTitle } from '@/app/territories/engine/views'
import {
  myRole,
  scopedView,
} from '@/features/territories/lib/shared/projection'
import { withPending } from '@/features/territories/stores/territories'
import type {
  TerritorySpace,
  TerritorySpaceRecord,
} from '@/features/territories/types/sharedTerritory'
import type { SealedSpaceRecord, UnreadSpaceRecord } from '@/types/sharedCars'

const PUT_BYTES_BUDGET = SPACE_LIMITS.putBytes - 64 * 1024
const STAMP_MARGIN_MS = 60 * 60 * 1000
const SUSPENDED_WAIT_MS = 60 * 1000

const keysFirst = (a: SealedSpaceRecord, b: SealedSpaceRecord) =>
  Number(b.recordId.startsWith('k.')) - Number(a.recordId.startsWith('k.')) ||
  a.seq - b.seq

const problemOf = (error: unknown): UnreadSpaceRecord['problem'] =>
  error instanceof SpaceOpenError &&
  (error.problem === 'newer' ||
    error.problem === 'decrypt' ||
    error.problem === 'format')
    ? error.problem
    : 'unknown'

export type TerritorySync = ReturnType<typeof createSync>

export type SyncHooks = {
  endLocally: (spaceId: string, reason: 'gone') => void
  reissueInvites: (spaceId: string, member: SpaceMemberKeys) => Promise<void>
}

export function createSync(
  ctx: EngineContext,
  keys: () => TerritoryKeys,
  hooks: () => SyncHooks
) {
  const { deps, client, store, keyring } = ctx

  const viewTitle = (spaceId: string) => {
    const view = store
      .getState()
      .territories.find((t) => t.shared?.spaceId === spaceId)
    return view ? plainTitle(view) : ''
  }

  async function linkKeys(spaceId: string, linkIds: string[]) {
    const seed = await ctx.seed()
    return new Map(
      linkIds.map((linkId) => [
        linkId,
        deriveLinkCredentials(deriveLinkSecret(seed, spaceId, linkId)).linkKey,
      ])
    )
  }

  function mergeIncoming(
    space: TerritorySpace,
    recordId: string,
    incoming: TerritorySpaceRecord,
    owner: boolean
  ): TerritorySpace {
    const local = space.records[recordId]
    const pending = space.pending.includes(recordId)
    if (pending && local) {
      if (local.stamp > incoming.stamp) return space
      if (local.stamp === incoming.stamp && local.deleted && !incoming.deleted)
        return space
    }
    const nextPending = pending
      ? space.pending.filter((id) => id !== recordId)
      : space.pending
    const hidden =
      !owner &&
      deps.privacy() &&
      incoming.kind === 'door' &&
      incoming.data?.outcome !== 'doNotCall'
    if (hidden) {
      if (!local) return { ...space, pending: nextPending }
      const { [recordId]: _dropped, ...records } = space.records
      return { ...space, records, pending: nextPending }
    }
    return {
      ...space,
      records: { ...space.records, [recordId]: incoming },
      pending: nextPending,
    }
  }

  function openRecords(
    space: TerritorySpace,
    incoming: readonly SealedSpaceRecord[],
    member: SpaceMemberKeys,
    links: Map<string, Uint8Array>
  ): TerritorySpace {
    const { spaceId } = space
    const ownId = memberRecordId(member.memberId)
    const candidates = new Map<string, SealedSpaceRecord>()
    const consider = (record: SealedSpaceRecord) => {
      const known = candidates.get(record.recordId)
      if (!known || record.seq >= known.seq)
        candidates.set(record.recordId, record)
    }
    for (const record of space.sealed) consider(record)
    for (const record of space.unread) {
      const { problem: _problem, ...sealed } = record
      consider(sealed)
    }
    for (const record of incoming) consider(record)

    let next: TerritorySpace = { ...space, unread: [] }
    const owner = next.ownerId === member.memberId
    const chain = new Map(next.keyChain.map((r) => [r.recordId, r]))
    let sealedOwnRecord = next.sealedOwnRecord
    let ownRecordChecked = next.ownRecordChecked
    const unread: UnreadSpaceRecord[] = []
    let waiting: SealedSpaceRecord[] = []

    for (const record of candidates.values()) {
      const parsed = parseScopedRecordId(record.recordId)
      if (parsed?.class !== 'linkKeys') {
        waiting.push(record)
        continue
      }
      const linkKey = links.get(parsed.linkId)
      if (!linkKey || record.deleted) continue
      try {
        const opened = openRecordWithKey(
          linkKey,
          {
            spaceId,
            epoch: record.epoch,
            recordId: record.recordId,
            deleted: false,
            stamp: record.stamp,
          },
          record.blob
        )
        const scopes = opened.data?.scopes as
          | Record<string, Record<string, string>>
          | undefined
        const newest = Object.values(scopes ?? {}).map((byEpoch) =>
          Math.max(0, ...Object.keys(byEpoch).map(Number))
        )
        next = {
          ...next,
          guestKeyEpochs: {
            ...next.guestKeyEpochs,
            [parsed.linkId]: newest.length > 0 ? Math.min(...newest) : 0,
          },
        }
      } catch (error) {
        ctx.report(error, 'open')
      }
    }

    const openTrusted = () => {
      for (let learned = true; learned && waiting.length > 0; ) {
        learned = false
        const still: SealedSpaceRecord[] = []
        for (const record of waiting.sort(keysFirst)) {
          const key = keyring.key(spaceId, record.epoch)
          if (!key) {
            still.push(record)
            continue
          }
          let plaintext
          try {
            plaintext = openRecordWithKey(
              scopedRecordKey(key, record.recordId),
              {
                spaceId,
                epoch: record.epoch,
                recordId: record.recordId,
                deleted: record.deleted,
                stamp: record.stamp,
              },
              record.blob
            )
          } catch (error) {
            ctx.report(error, 'open')
            unread.push({ ...record, problem: problemOf(error) })
            continue
          }
          if (epochOfKeysRecord(record.recordId) !== null) {
            const change = keys().learnLink(spaceId, record, plaintext.data)
            if (change === null || change === 'mismatch') {
              unread.push({ ...record, problem: 'unknown' })
              continue
            }
            if (change === 'new') learned = true
            const held = chain.get(record.recordId)
            if (!held || record.seq >= held.seq)
              chain.set(record.recordId, record)
            continue
          }
          if (record.recordId === ownId) {
            const matches =
              !record.deleted &&
              plaintext.data !== undefined &&
              checkMatches(
                spaceId,
                record.epoch,
                key,
                plaintext.data,
                member.checkKey
              )
            if (
              matches &&
              (!sealedOwnRecord || record.seq >= sealedOwnRecord.seq)
            )
              sealedOwnRecord = record
            ownRecordChecked = matches
          }
          next = mergeIncoming(
            next,
            record.recordId,
            {
              kind: plaintext.kind,
              ...(plaintext.data && { data: plaintext.data }),
              stamp: record.stamp,
              deleted: record.deleted,
            },
            owner
          )
        }
        waiting = still
      }
    }
    for (;;) {
      keys().rebuildFromChain(spaceId, [...chain.values()])
      openTrusted()
      const links = [
        ...chain.values(),
        ...waiting.filter((r) => epochOfKeysRecord(r.recordId) !== null),
      ]
      const own = [
        ...(sealedOwnRecord ? [sealedOwnRecord] : []),
        ...waiting.filter((r) => r.recordId === ownId),
      ]
      if (!keys().settle(spaceId, links, own, member)) break
    }
    return {
      ...next,
      sealed: waiting,
      unread,
      keyChain: [...chain.values()],
      ...(sealedOwnRecord && { sealedOwnRecord }),
      ownRecordChecked,
    }
  }

  function applyPage(
    space: TerritorySpace,
    page: SpaceSyncPage,
    member: SpaceMemberKeys,
    links: Map<string, Uint8Array>
  ): TerritorySpace {
    keys().openOwnWrap(space.spaceId, page.epoch, page.wrap, member)
    const scoped = page.scoped
    const open = new Set((scoped?.invites ?? []).map((i) => i.inviteId))
    const settled = !page.rekeyNeeded && page.epoch === space.epoch
    const sentInvites = settled
      ? Object.fromEntries(
          Object.entries(space.sentInvites).filter(([inviteId]) =>
            open.has(inviteId)
          )
        )
      : space.sentInvites
    const next: TerritorySpace = {
      ...space,
      myMemberId: member.memberId,
      ownerId: page.ownerId,
      epoch: page.epoch,
      rekeyNeeded: page.rekeyNeeded,
      ...(scoped && {
        members: scoped.members,
        invites: scoped.invites,
        holders: scoped.holders,
        links: scoped.links,
      }),
      hadOthers:
        space.hadOthers ||
        page.members.some((m) => m.memberId !== member.memberId),
      seq: page.cursor,
      sentInvites,
    }
    return openRecords(next, page.records, member, links)
  }

  const scopesOf = (space: TerritorySpace | undefined, me: string) =>
    space?.members.find((m) => m.memberId === me)?.scopes

  function widened(
    before: string[] | null | undefined,
    after: string[] | null | undefined
  ) {
    if (before === undefined || after === undefined) return false
    if (after === null) return before !== null
    return before !== null && after.some((scopeId) => !before.includes(scopeId))
  }

  async function pull(spaceId: string, member: SpaceMemberKeys) {
    const before = scopesOf(ctx.space(spaceId), member.memberId)
    await pullFrom(spaceId, member)
    const after = ctx.space(spaceId)
    if (widened(before, scopesOf(after, member.memberId))) {
      ctx.update(spaceId, (s) => ({ ...s, seq: 0 }))
      await pullFrom(spaceId, member)
    }
    dropUnreadable(spaceId, member.memberId)
  }

  function dropUnreadable(spaceId: string, memberId: string) {
    const space = ctx.space(spaceId)
    if (!space || !space.members.some((m) => m.memberId === memberId)) return
    const view = scopedView(space)
    const gone = Object.keys(space.records).filter((recordId) => {
      const parsed = parseScopedRecordId(recordId)
      return (
        parsed !== null &&
        ('scopeId' in parsed || parsed.class === 'territoryWide') &&
        !mayReadRecord(view, { memberId }, recordId)
      )
    })
    if (gone.length === 0) return
    ctx.update(spaceId, (s) => ({
      ...s,
      records: Object.fromEntries(
        Object.entries(s.records).filter(([id]) => !gone.includes(id))
      ),
    }))
  }

  async function pullFrom(spaceId: string, member: SpaceMemberKeys) {
    const space = ctx.space(spaceId)
    if (!space) return
    const mine = space.links
      .filter((link) => link.createdBy === member.memberId)
      .map((link) => link.linkId)
    let links = await linkKeys(spaceId, mine)
    await client.syncFrom(
      ctx.auth(member),
      space.seq,
      async (page) => {
        const created = (page.scoped?.links ?? [])
          .filter(
            (link) =>
              link.createdBy === member.memberId && !links.has(link.linkId)
          )
          .map((link) => link.linkId)
        if (created.length > 0)
          links = new Map([...links, ...(await linkKeys(spaceId, created))])
        ctx.update(spaceId, (current) =>
          applyPage(current, page, member, links)
        )
      },
      ctx.call()
    )
  }

  function withCheck(
    member: SpaceMemberKeys,
    epoch: number,
    key: Uint8Array,
    data: Record<string, unknown>
  ) {
    const fields = readMemberData(data)
    if (!fields) return data
    return {
      ...data,
      ...fields,
      check: memberCheck(member.checkKey, {
        spaceId: member.spaceId,
        epoch,
        spaceKey: key,
        ...fields,
      }),
    }
  }

  type Batch = { records: SpacePutRecord[]; stamps: Map<string, number> }

  function mayPut(space: TerritorySpace, recordId: string, me: string) {
    if (recordId.startsWith('k.')) return space.ownerId === me
    if (
      recordId.startsWith('i.') &&
      space.records[recordId]?.data?.invitedBy === me
    )
      return true
    return mayWriteRecord(scopedView(space), { memberId: me }, recordId)
  }

  function seal(
    space: TerritorySpace,
    member: SpaceMemberKeys,
    key: Uint8Array
  ) {
    const batches: Batch[] = []
    const dropped: string[] = []
    const refused: string[] = []
    const latest = deps.syncNow() + SPACE_LIMITS.stampAheadMs - STAMP_MARGIN_MS
    let current: Batch = { records: [], stamps: new Map() }
    let bytes = 0
    const ownId = memberRecordId(member.memberId)
    for (const recordId of space.pending) {
      if (!mayPut(space, recordId, member.memberId)) {
        refused.push(recordId)
        continue
      }
      let kind: string
      let data: Record<string, unknown> | undefined
      let stamp: number
      let deleted = false
      const epoch = epochOfKeysRecord(recordId)
      if (epoch !== null) {
        const previous = keyring.key(space.spaceId, epoch - 1)
        if (!previous) {
          dropped.push(recordId)
          continue
        }
        kind = 'keys'
        data = keysRecordData(previous)
        stamp = space.keyStamps[String(epoch)] ?? deps.stamp()
      } else {
        const record = space.records[recordId]
        if (!record) {
          dropped.push(recordId)
          continue
        }
        kind = record.kind
        deleted = record.deleted
        stamp = record.stamp
        data = deleted
          ? undefined
          : recordId === ownId
            ? withCheck(member, space.epoch, key, record.data ?? {})
            : record.data
      }
      if (stamp > latest) continue
      let blob: string
      try {
        blob = sealRecordWithKey(
          scopedRecordKey(key, recordId),
          {
            spaceId: space.spaceId,
            epoch: space.epoch,
            recordId,
            deleted,
            stamp,
          },
          { kind, data },
          deps.randomBytes(24)
        )
      } catch (error) {
        ctx.report(error, 'seal')
        dropped.push(recordId)
        continue
      }
      const record: SpacePutRecord = {
        recordId,
        epoch: space.epoch,
        stamp,
        ...(deleted && { deleted: true }),
        blob,
      }
      const size = putRecordBytes(record)
      if (
        current.records.length >= SPACE_LIMITS.putRecords ||
        (current.records.length > 0 && bytes + size > PUT_BYTES_BUDGET)
      ) {
        batches.push(current)
        current = { records: [], stamps: new Map() }
        bytes = 0
      }
      current.records.push(record)
      current.stamps.set(recordId, stamp)
      bytes += size
    }
    if (current.records.length > 0) batches.push(current)
    return { batches, dropped, refused }
  }

  function settle(
    spaceId: string,
    sent: Map<string, number>,
    stored: string[]
  ) {
    ctx.update(spaceId, (space) => {
      const done = new Set(
        stored.filter((recordId) => {
          const epoch = epochOfKeysRecord(recordId)
          if (epoch !== null) return true
          return space.records[recordId]?.stamp === sent.get(recordId)
        })
      )
      return done.size === 0
        ? space
        : { ...space, pending: space.pending.filter((id) => !done.has(id)) }
    })
  }

  function forget(spaceId: string, recordIds: readonly string[]) {
    if (recordIds.length === 0) return
    const gone = new Set(recordIds)
    ctx.update(spaceId, (space) => ({
      ...space,
      pending: space.pending.filter((id) => !gone.has(id)),
    }))
  }

  function dropRefused(spaceId: string, recordIds: readonly string[]) {
    if (recordIds.length === 0) return
    const gone = new Set(recordIds)
    ctx.update(spaceId, (space) => ({
      ...space,
      seq: 0,
      pending: space.pending.filter((id) => !gone.has(id)),
      records: Object.fromEntries(
        Object.entries(space.records).filter(([id]) => !gone.has(id))
      ),
    }))
    deps.onRefused?.({ spaceId, title: viewTitle(spaceId) })
  }

  async function restamp(spaceId: string) {
    await ctx.refreshClock()
    ctx.update(spaceId, (space) => ({
      ...space,
      records: Object.fromEntries(
        Object.entries(space.records).map(([id, record]) => [
          id,
          space.pending.includes(id)
            ? { ...record, stamp: deps.stamp(record.stamp) }
            : record,
        ])
      ),
    }))
  }

  async function push(
    spaceId: string,
    member: SpaceMemberKeys,
    tried = { resealed: false, restamped: false, refused: false }
  ): Promise<void> {
    if (ctx.puts.held()) return
    for (let round = 0; round < 4; round++) {
      const space = ctx.space(spaceId)
      if (!space || space.pending.length === 0) return
      const key = keys().sealingKey(space)
      if (!key) return
      const { batches, dropped, refused } = seal(space, member, key)
      forget(spaceId, dropped)
      if (refused.length > 0) dropRefused(spaceId, refused)
      if (batches.length === 0) return
      for (const batch of batches) {
        let result
        try {
          result = await client.put(ctx.auth(member), batch.records, ctx.call())
        } catch (error) {
          if (isSpaceError(error, 'stale_key') && !tried.resealed) {
            await pull(spaceId, member)
            return push(spaceId, member, { ...tried, resealed: true })
          }
          if (isSpaceError(error, 'bad_request') && !tried.restamped) {
            await restamp(spaceId)
            return push(spaceId, member, { ...tried, restamped: true })
          }
          if (isSpaceError(error, 'forbidden') && !tried.refused) {
            await pull(spaceId, member)
            return push(spaceId, member, { ...tried, refused: true })
          }
          if (isSpaceError(error, 'suspended')) {
            ctx.puts.suspend(SUSPENDED_WAIT_MS)
            return
          }
          throw error
        }
        settle(
          spaceId,
          batch.stamps,
          result.results.map((r) => r.recordId)
        )
      }
    }
  }

  function guestKeysData(
    space: TerritorySpace,
    scopes: readonly string[],
    expiresAt: number,
    from: string
  ) {
    const view = store
      .getState()
      .territories.find((t) => t.shared?.spaceId === space.spaceId)
    const byScope: Record<string, Record<string, string>> = {}
    for (const scopeId of scopes) {
      const epochs: Record<string, string> = {}
      for (let epoch = 1; epoch <= space.epoch; epoch++) {
        const key = keyring.key(space.spaceId, epoch)
        if (key) epochs[String(epoch)] = toB64u(deriveScopeKey(key, scopeId))
      }
      byScope[scopeId] = epochs
    }
    return {
      title: view ? plainTitle(view) : '',
      from: from.slice(0, 40),
      houseRecords: view?.shared?.houseRecords ?? true,
      scopes: byScope,
      expiresAt,
    }
  }

  async function putGuestKeys(
    spaceId: string,
    member: SpaceMemberKeys,
    linkId: string
  ) {
    const space = ctx.space(spaceId)
    const link = space?.links.find((entry) => entry.linkId === linkId)
    if (!space || !link) return
    const key = keys().sealingKey(space)
    if (!key) return
    const seed = await ctx.seed()
    const { linkKey } = deriveLinkCredentials(
      deriveLinkSecret(seed, spaceId, linkId)
    )
    const profile = await ctx.profile()
    const recordId = guestKeysRecordId(linkId)
    const stamp = deps.stamp()
    const blob = sealRecordWithKey(
      linkKey,
      { spaceId, epoch: space.epoch, recordId, deleted: false, stamp },
      {
        kind: 'guestKeys',
        data: guestKeysData(space, link.scopes, link.expiresAt, profile.name),
      },
      deps.randomBytes(24)
    )
    await client.put(
      ctx.auth(member),
      [{ recordId, epoch: space.epoch, stamp, blob }],
      ctx.call()
    )
    ctx.update(spaceId, (s) => ({
      ...s,
      guestKeyEpochs: { ...s.guestKeyEpochs, [linkId]: s.epoch },
    }))
  }

  async function refreshGuestKeys(spaceId: string, member: SpaceMemberKeys) {
    const space = ctx.space(spaceId)
    if (!space) return
    const now = deps.syncNow()
    for (const link of space.links) {
      if (
        link.createdBy !== member.memberId ||
        link.endedAt !== null ||
        link.expiresAt <= now ||
        (space.guestKeyEpochs[link.linkId] ?? 0) >= space.epoch
      )
        continue
      try {
        await putGuestKeys(spaceId, member, link.linkId)
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) throw error
        ctx.report(error, 'guestKeys')
      }
    }
  }

  async function tidy(spaceId: string, member: SpaceMemberKeys) {
    const profile = await ctx.profile()
    const space = ctx.space(spaceId)
    if (!space) return
    const me = member.memberId
    const ownId = memberRecordId(me)
    const joinedAt =
      space.members.find((m) => m.memberId === me)?.joinedAt ?? deps.syncNow()
    const expected = memberRecordData(profile, spaceId, joinedAt)
    const mine = space.records[ownId]
    const current =
      mine && !mine.deleted && mine.data ? readMemberData(mine.data) : null
    const updates: Record<string, TerritorySpaceRecord> = {}
    if (
      !current ||
      !space.ownRecordChecked ||
      !sameMemberData(current, expected)
    )
      updates[ownId] = {
        kind: 'member',
        data: { ...expected },
        stamp: deps.stamp(mine?.stamp),
        deleted: false,
      }

    const open = new Set(space.invites.map((invite) => invite.inviteId))
    const now = deps.syncNow()
    for (const [recordId, record] of Object.entries(space.records)) {
      if (!recordId.startsWith('i.') || record.deleted) continue
      const inviteId = recordId.slice(2)
      const expiresAt = record.data?.expiresAt
      const closed =
        !open.has(inviteId) ||
        (typeof expiresAt === 'number' && expiresAt <= now)
      if (!closed) continue
      if (space.ownerId !== me && record.data?.invitedBy !== me) continue
      if (space.sentInvites[inviteId]) continue
      updates[recordId] = {
        kind: 'invite',
        stamp: deps.stamp(record.stamp),
        deleted: true,
      }
    }

    const owed: string[] = []
    if (space.ownerId === me)
      for (let epoch = 2; epoch <= space.epoch; epoch++)
        if (keys().linkOwed(space, epoch)) owed.push(keysRecordId(epoch))

    const ids = [...Object.keys(updates), ...owed]
    ctx.update(spaceId, (s) => ({
      ...s,
      ownRecordChecked: true,
      writtenName: expected.name,
      records: { ...s.records, ...updates },
      pending: withPending(s.pending, ids),
    }))

    const after = ctx.space(spaceId)
    if (
      after &&
      myRole(after) === 'owner' &&
      after.records.h &&
      after.records.h.data?.houseRecords !== !deps.privacy()
    ) {
      store.getState().setHouseRecords(spaceId, !deps.privacy())
    }
  }

  async function runSteps(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<TerritorySyncOutcome> {
    try {
      await pull(spaceId, member)
      const pulled = ctx.space(spaceId)
      if (!pulled) return 'missing'
      if (!keys().sealingKey(pulled)) return 'waiting'
      await keys().rekeyIfNeeded(spaceId, member)
      await hooks().reissueInvites(spaceId, member)
      await tidy(spaceId, member)
      if (!ctx.space(spaceId)) return 'missing'
      await refreshGuestKeys(spaceId, member)
      await push(spaceId, member)
      ctx.update(spaceId, (s) => ({ ...s, lastSyncedAt: deps.now() }))
      return 'synced'
    } catch (error) {
      if (isSpaceError(error, 'gone')) {
        hooks().endLocally(spaceId, 'gone')
        return 'ended'
      }
      throw error
    }
  }

  const queued = new Map<string, Promise<TerritorySyncOutcome>>()

  function syncSpace(
    spaceId: string,
    options: { automatic?: boolean } = {}
  ): Promise<TerritorySyncOutcome> {
    if (
      options.automatic &&
      (ctx.backPressure.coolingDown() || deps.canSync?.() === false)
    )
      return Promise.resolve('skipped')
    const waiting = queued.get(spaceId)
    if (waiting) return waiting
    const run = ctx.serial(spaceId, async () => {
      queued.delete(spaceId)
      if (!ctx.space(spaceId)) return 'missing' as const
      try {
        return await runSteps(spaceId, await ctx.memberFor(spaceId))
      } catch (error) {
        ctx.noteFailure(error)
        ctx.noteSyncFailed(error)
        throw error
      }
    })
    queued.set(spaceId, run)
    const clear = () => {
      if (queued.get(spaceId) === run) queued.delete(spaceId)
    }
    run.then(clear, clear)
    return run
  }

  return {
    pull,
    push,
    seal,
    tidy,
    runSteps,
    syncSpace,
    putGuestKeys,
    forgetAll: () => queued.clear(),
  }
}
