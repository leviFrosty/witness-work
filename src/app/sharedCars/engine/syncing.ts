import { MILEAGE_COLLECTIONS } from '@/lib/mileage/records'
import {
  KIND_OF_COLLECTION,
  collectionHolding,
  mileageRecordData,
  mileageRecordOn,
  seenRecordStamp,
  sharedRecordFits,
  withDerivedPeople,
  withPending,
} from '@/lib/mileage/sharedCar'
import {
  isSpaceError,
  putRecordBytes,
  SPACE_LIMITS,
  SpaceError,
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
  idInRecordId,
  inviteRecordId,
  keysRecordData,
  keysRecordId,
  mayPutRecord,
  memberRecordId,
  openRecord,
  readMemberData,
  sealRecord,
  spaceKindOf,
} from '@/lib/sharedSpaces/records'
import { createCarMerge } from '@/app/sharedCars/mergeRecords'
import { movePersonalRecords } from '@/app/sharedCars/movedRecords'
import {
  memberRecordData,
  sameMemberData,
  type SharedCarProfile,
  wantedMemberData,
} from '@/app/sharedCars/profile'
import type { EngineContext } from '@/app/sharedCars/engine/context'
import type {
  CarSync,
  EngineParts,
  PutBatch,
  WireRecord,
} from '@/app/sharedCars/engine/parts'
import {
  type CarSyncOptions,
  type CarSyncOutcome,
  SUSPENDED_PUT_WAIT_MS,
} from '@/app/sharedCars/engine/types'
import type {
  SealedSpaceRecord,
  SharedCar,
  SharedCarTombstone,
  UnreadSpaceRecord,
} from '@/types/sharedCars'

const PUT_BYTES_BUDGET = SPACE_LIMITS.putBytes - 64 * 1024

const MAX_ROUNDS = 4

const STAMP_MARGIN_MS = 60 * 60 * 1000

const keysFirst = (a: SealedSpaceRecord, b: SealedSpaceRecord) =>
  Number(b.recordId.startsWith('k.')) - Number(a.recordId.startsWith('k.')) ||
  a.seq - b.seq

const sealedOf = ({ problem: _problem, ...record }: UnreadSpaceRecord) =>
  record as SealedSpaceRecord

const unreadProblem = (error: unknown): UnreadSpaceRecord['problem'] => {
  if (!(error instanceof SpaceOpenError)) return 'unknown'
  switch (error.problem) {
    case 'newer':
    case 'decrypt':
    case 'format':
      return error.problem
    default:
      return 'unknown'
  }
}

function spaceRecordData(
  car: SharedCar,
  kind: 'member' | 'invite',
  recordId: string
): { data: Record<string, unknown>; stamp: number } | null {
  const id = idInRecordId(recordId)
  if (kind === 'member') {
    const record = car.memberRecords.find((m) => m.memberId === id)
    if (!record) return null

    const { memberId: _id, updatedAt, ...data } = record
    return { data: mileageRecordData(data), stamp: updatedAt ?? 0 }
  }
  const record = car.inviteRecords.find((i) => i.inviteId === id)
  if (!record) return null
  const { inviteId: _id, updatedAt, ...data } = record
  return { data: mileageRecordData(data), stamp: updatedAt ?? 0 }
}

function withCheck(
  member: SpaceMemberKeys,
  epoch: number,
  key: Uint8Array,
  data: Record<string, unknown>
): Record<string, unknown> {
  const fields = readMemberData(data)
  if (!fields) return data
  const {
    name: _name,
    avatar: _avatar,
    tag: _tag,
    joinedAt: _joinedAt,
    check: _check,
    ...extra
  } = data
  return {
    ...extra,
    ...fields,
    check: memberCheck(member.checkKey, {
      spaceId: member.spaceId,
      epoch,
      spaceKey: key,
      ...fields,
    }),
  }
}

export function createCarSync(ctx: EngineContext, parts: EngineParts): CarSync {
  const { deps, client, store, keyring } = ctx

  const reread = new Set<string>()

  function openRecords(
    car: SharedCar,
    incoming: readonly SealedSpaceRecord[],
    rereadAll: boolean,
    member: SpaceMemberKeys
  ): SharedCar {
    const { spaceId } = car
    const ownId = memberRecordId(member.memberId)
    const candidates = new Map<string, SealedSpaceRecord>()
    const consider = (record: SealedSpaceRecord) => {
      const known = candidates.get(record.recordId)
      if (!known || record.seq >= known.seq)
        candidates.set(record.recordId, record)
    }
    for (const record of car.sealedRecords) consider(record)
    const stillUnread: UnreadSpaceRecord[] = []
    for (const record of car.unreadRecords)
      if (rereadAll) consider(sealedOf(record))
      else stillUnread.push(record)
    for (const record of incoming) consider(record)

    const unread: UnreadSpaceRecord[] = []
    for (const record of stillUnread) {
      const newer = candidates.get(record.recordId)
      if (newer && newer.seq >= record.seq) continue
      if (newer) candidates.delete(record.recordId)
      unread.push(record)
    }

    const merge = createCarMerge(car)
    const chain = new Map(car.keyChain.map((r) => [r.recordId, r]))
    let sealedOwnRecord = car.sealedOwnRecord
    let ownRecordChecked = car.ownRecordChecked

    const keepUnread = (
      record: SealedSpaceRecord,
      problem: UnreadSpaceRecord['problem']
    ) => {
      unread.push({ ...record, problem })
      if (record.recordId === ownId && problem !== 'newer')
        ownRecordChecked = false
    }
    let waiting = [...candidates.values()].sort(keysFirst)
    const openTrusted = () => {
      for (let learned = true; learned && waiting.length > 0; ) {
        learned = false
        const still: SealedSpaceRecord[] = []
        for (const record of waiting) {
          const key = keyring.key(spaceId, record.epoch)
          if (!key) {
            still.push(record)
            continue
          }
          let plaintext
          try {
            plaintext = openRecord(
              key,
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
            keepUnread(record, unreadProblem(error))
            continue
          }
          if (epochOfKeysRecord(record.recordId) !== null) {
            const change = parts.keys.learnLink(spaceId, record, plaintext.data)
            if (change === null || change === 'mismatch') {
              keepUnread(record, 'unknown')
              continue
            }
            if (change === 'new') learned = true
            const held = chain.get(record.recordId)
            if (!held || record.seq >= held.seq)
              chain.set(record.recordId, record)
          }

          if (record.recordId === ownId && plaintext.kind !== 'member') {
            keepUnread(record, 'unknown')
            continue
          }
          const verdict = merge.apply({
            recordId: record.recordId,
            stamp: record.stamp,
            deleted: record.deleted,
            kind: plaintext.kind,
            data: plaintext.data,
          })
          if (verdict === 'unusable') {
            keepUnread(record, 'unknown')
            continue
          }
          if (record.recordId !== ownId) continue
          const matches =
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

          if (verdict === 'applied') ownRecordChecked = matches
        }
        waiting = still.sort(keysFirst)
      }
    }
    for (;;) {
      parts.keys.rebuildFromChain(spaceId, [...chain.values()])
      openTrusted()
      const links = [
        ...chain.values(),
        ...waiting.filter((r) => epochOfKeysRecord(r.recordId) !== null),
      ]
      const own = [
        ...(sealedOwnRecord ? [sealedOwnRecord] : []),
        ...waiting.filter((r) => r.recordId === ownId),
      ]
      if (!parts.keys.settle(spaceId, links, own, member)) break
    }

    if (waiting.some((r) => r.recordId === ownId)) ownRecordChecked = false
    return {
      ...merge.finish(),
      sealedRecords: waiting,
      unreadRecords: unread,
      keyChain: [...chain.values()],
      ...(sealedOwnRecord && { sealedOwnRecord }),
      ownRecordChecked,
    }
  }

  function applyPage(
    car: SharedCar,
    page: SpaceSyncPage,
    member: SpaceMemberKeys,
    rereadAll: boolean
  ): SharedCar {
    parts.keys.openOwnWrap(car.spaceId, page.epoch, page.wrap, member)
    const next: SharedCar = {
      ...car,
      myMemberId: member.memberId,
      ownerId: page.ownerId,

      epoch: page.epoch,
      spaceMembers: page.members,
      spaceInvites: page.invites,
      rekeyNeeded: page.rekeyNeeded,
      hadOthers:
        car.hadOthers ||
        page.members.some((m) => m.memberId !== member.memberId),
      seq: page.cursor,
    }
    return withDerivedPeople(openRecords(next, page.records, rereadAll, member))
  }

  async function pull(spaceId: string, member: SpaceMemberKeys) {
    const car = ctx.cars()[spaceId]
    if (!car) return
    let first = !reread.has(spaceId)
    await client.syncFrom(
      ctx.auth(member),
      car.seq,
      (page) => {
        ctx.update(spaceId, (current) =>
          applyPage(current, page, member, first)
        )
        if (first) reread.add(spaceId)
        first = false
      },
      ctx.call()
    )
    ctx.noteAnswered()
  }

  function wireRecords(car: SharedCar, ids: Iterable<string>, me: string) {
    const wires: WireRecord[] = []
    const nothing: string[] = []
    let mileageTombstones: Map<string, SharedCarTombstone> | null = null
    let spaceTombstones: Map<string, number> | null = null
    const extra = (id: string) => car.extraFields[id] ?? {}
    const isOwner = car.ownerId === me
    for (const id of ids) {
      if (!mayPutRecord(id, me, isOwner)) {
        nothing.push(id)
        continue
      }
      const keysEpoch = epochOfKeysRecord(id)
      if (keysEpoch !== null) {
        const entry = car.keyRecords.find((k) => k.epoch === keysEpoch)
        const previous = keyring.key(car.spaceId, keysEpoch - 1)
        if (entry && previous)
          wires.push({
            recordId: id,
            kind: 'keys',
            data: keysRecordData(previous),
            deleted: false,
            stamp: entry.stamp,
          })
        else nothing.push(id)
        continue
      }
      const spaceKind = spaceKindOf(id)
      if (spaceKind === 'member' || spaceKind === 'invite') {
        const live = spaceRecordData(car, spaceKind, id)
        if (live) {
          wires.push({
            recordId: id,
            kind: spaceKind,
            data: { ...extra(id), ...live.data },
            deleted: false,
            stamp: live.stamp,
          })
          continue
        }
        spaceTombstones ??= new Map(
          car.deletedSpaceRecords.map((t) => [t.id, t.deletedAt])
        )
        const deletedAt = spaceTombstones.get(id)
        if (deletedAt === undefined) nothing.push(id)
        else
          wires.push({
            recordId: id,
            kind: spaceKind,
            deleted: true,
            stamp: deletedAt,
          })
        continue
      }
      const record = mileageRecordOn(car, id)
      if (record) {
        const kind = KIND_OF_COLLECTION[collectionHolding(car, id)!]
        wires.push({
          recordId: id,
          kind,
          data: { ...extra(id), ...mileageRecordData(record) },
          deleted: false,
          stamp: record.updatedAt ?? 0,
        })
        continue
      }
      mileageTombstones ??= new Map(
        car.deletedMileageRecords.map((t) => [t.id, t])
      )
      const tombstone = mileageTombstones.get(id)
      if (tombstone?.kind)
        wires.push({
          recordId: id,
          kind: tombstone.kind,
          deleted: true,
          stamp: tombstone.deletedAt,
        })
      else nothing.push(id)
    }
    return { wires, nothing }
  }

  function seal(
    member: SpaceMemberKeys,
    epoch: number,
    key: Uint8Array,
    wires: readonly WireRecord[]
  ): { batches: PutBatch[]; tooLarge: string[]; held: string[] } {
    const { spaceId } = member
    const ownId = memberRecordId(member.memberId)
    const batches: PutBatch[] = []
    const tooLarge: string[] = []
    const held: string[] = []
    const latest = deps.syncNow() + SPACE_LIMITS.stampAheadMs - STAMP_MARGIN_MS
    const fresh = (): PutBatch => ({
      records: [],
      stamps: new Map(),
      kinds: new Map(),
    })
    let current = fresh()
    let bytes = 0
    for (const wire of wires) {
      if (wire.stamp > latest) {
        held.push(wire.recordId)
        continue
      }
      const data = wire.deleted
        ? undefined
        : wire.recordId === ownId
          ? withCheck(member, epoch, key, wire.data ?? {})
          : wire.data
      if (data && !sharedRecordFits(wire.kind, data)) {
        tooLarge.push(wire.recordId)
        continue
      }
      const record: SpacePutRecord = {
        recordId: wire.recordId,
        epoch,
        stamp: wire.stamp,
        ...(wire.deleted && { deleted: true }),
        blob: sealRecord(
          key,
          {
            spaceId,
            epoch,
            recordId: wire.recordId,
            deleted: wire.deleted,
            stamp: wire.stamp,
          },
          { kind: wire.kind, data },
          deps.randomBytes(24)
        ),
      }
      const size = putRecordBytes(record)
      if (
        current.records.length >= SPACE_LIMITS.putRecords ||
        (current.records.length > 0 && bytes + size > PUT_BYTES_BUDGET)
      ) {
        batches.push(current)
        current = fresh()
        bytes = 0
      }
      current.records.push(record)
      current.stamps.set(wire.recordId, wire.stamp)
      current.kinds.set(wire.recordId, wire.kind)
      bytes += size
    }
    if (current.records.length > 0) batches.push(current)
    if (tooLarge.length > 0) ctx.report(new SpaceError('too_large'), 'seal')
    return { batches, tooLarge, held }
  }

  async function restamp(spaceId: string) {
    await ctx.refreshClock()
    const correct = deps.correctStamp
    if (!correct) return
    ctx.update(spaceId, (car) => restamped(car, correct))
  }

  function restamped(car: SharedCar, correct: (stamp: number) => number) {
    const pending = new Set(car.pendingPuts)
    let changed = false
    const fix = <T>(item: T, id: string, field: keyof T): T => {
      const value = item[field] as unknown
      if (!pending.has(id) || typeof value !== 'number') return item
      const next = correct(value)
      if (next === value) return item
      changed = true
      return { ...item, [field]: next }
    }
    const next: SharedCar = { ...car }
    for (const key of MILEAGE_COLLECTIONS)
      Object.assign(next, {
        [key]: (car[key] as { id: string; updatedAt?: number }[]).map((r) =>
          fix(r, r.id, 'updatedAt')
        ),
      })
    next.deletedMileageRecords = car.deletedMileageRecords.map((t) =>
      fix(t, t.id, 'deletedAt')
    )
    next.memberRecords = car.memberRecords.map((m) =>
      fix(m, memberRecordId(m.memberId), 'updatedAt')
    )
    next.inviteRecords = car.inviteRecords.map((i) =>
      fix(i, inviteRecordId(i.inviteId), 'updatedAt')
    )
    next.deletedSpaceRecords = car.deletedSpaceRecords.map((t) =>
      fix(t, t.id, 'deletedAt')
    )
    next.keyRecords = car.keyRecords.map((k) =>
      fix(k, keysRecordId(k.epoch), 'stamp')
    )
    return changed ? next : car
  }

  async function push(
    spaceId: string,
    member: SpaceMemberKeys,
    tried = { resealed: false, restamped: false, refused: false }
  ): Promise<void> {
    if (ctx.puts.held()) return
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const car = ctx.cars()[spaceId]
      if (!car) return
      if (car.pendingPuts.length === 0) {
        ctx.setCarStatus(spaceId, { held: 0, tooLarge: 0 })
        return
      }

      const key = parts.keys.sealingKey(car)
      if (!key) return
      const { wires, nothing } = wireRecords(
        car,
        car.pendingPuts,
        member.memberId
      )
      const { batches, tooLarge, held } = seal(member, car.epoch, key, wires)
      if (nothing.length > 0) {
        const none = new Set(nothing)
        ctx.update(spaceId, (c) => ({
          ...c,
          pendingPuts: c.pendingPuts.filter((id) => !none.has(id)),
        }))
      }
      ctx.setCarStatus(spaceId, {
        held: held.length,
        tooLarge: tooLarge.length,
      })
      if (batches.length === 0) return
      for (const batch of batches) {
        const before = ctx.cars()[spaceId]?.seq
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
            const refused = new Set(
              batch.records
                .map((record) => record.recordId)
                .filter((id) => !mayPutRecord(id, member.memberId, false))
            )
            if (refused.size === 0) throw error
            ctx.update(spaceId, (c) => ({
              ...c,
              pendingPuts: c.pendingPuts.filter((id) => !refused.has(id)),
            }))
            return push(spaceId, member, { ...tried, refused: true })
          }
          if (isSpaceError(error, 'suspended')) {
            ctx.puts.suspended(SUSPENDED_PUT_WAIT_MS)
            return
          }
          throw error
        }
        ctx.noteAnswered()
        ctx.puts.stored()
        ctx.engineWrite(() =>
          store.getState().settlePendingPuts(
            spaceId,
            result.results.flatMap(({ recordId }) => {
              const stamp = batch.stamps.get(recordId)
              return stamp === undefined ? [] : [{ recordId, stamp }]
            })
          )
        )

        const stored = result.results.filter((r) => r.stored).length
        ctx.update(spaceId, (c) =>
          c.seq === before && c.seq + stored === result.seq
            ? keepSealed(c, batch, result, memberRecordId(member.memberId))
            : c
        )
      }
    }
  }

  function keepSealed(
    car: SharedCar,
    batch: PutBatch,
    result: { seq: number; results: { recordId: string; stored: boolean }[] },
    ownId: string
  ): SharedCar {
    const { seq } = result
    const stored = new Set(
      result.results.filter((r) => r.stored).map((r) => r.recordId)
    )
    const sealed = (record: SpacePutRecord): SealedSpaceRecord => ({
      recordId: record.recordId,
      epoch: record.epoch,
      stamp: record.stamp,
      deleted: record.deleted === true,
      blob: record.blob,
      seq,
    })
    const kept = batch.records.filter((record) => stored.has(record.recordId))
    const links = kept.filter(
      (record) => epochOfKeysRecord(record.recordId) !== null
    )
    const own = kept.find((record) => record.recordId === ownId)
    const chain = new Map(car.keyChain.map((r) => [r.recordId, r]))
    for (const link of links) chain.set(link.recordId, sealed(link))
    const current = (record: SealedSpaceRecord) => !stored.has(record.recordId)
    const sealedRecords = car.sealedRecords.filter(current)
    const unreadRecords = car.unreadRecords.filter(current)
    return {
      ...car,
      seq,
      ...(links.length > 0 && { keyChain: [...chain.values()] }),
      ...(own && { sealedOwnRecord: sealed(own) }),
      ...(sealedRecords.length !== car.sealedRecords.length && {
        sealedRecords,
      }),
      ...(unreadRecords.length !== car.unreadRecords.length && {
        unreadRecords,
      }),
    }
  }

  function tidy(
    car: SharedCar,
    member: SpaceMemberKeys,
    profile: SharedCarProfile
  ): { car: SharedCar; stillOpen: string[] } {
    const now = deps.syncNow()
    const me = member.memberId
    const myId = memberRecordId(me)
    let next = car
    const mine = car.memberRecords.find((m) => m.memberId === me)
    const expected = memberRecordData(
      profile,
      car.spaceId,
      car.spaceMembers.find((m) => m.memberId === me)?.joinedAt ??
        mine?.joinedAt ??
        now
    )

    const wanted =
      mine && car.ownRecordChecked
        ? wantedMemberData(expected, mine, {
            name: car.writtenName,
            avatar: car.writtenAvatar,
          })
        : expected
    if (
      car.writtenName !== expected.name ||
      car.writtenAvatar !== (expected.avatar ?? null)
    )
      next = {
        ...next,
        writtenName: expected.name,
        writtenAvatar: expected.avatar ?? null,
      }
    if (!mine || !car.ownRecordChecked || !sameMemberData(mine, wanted)) {
      next = {
        ...next,
        ownRecordChecked: true,
        memberRecords: [
          ...next.memberRecords.filter((m) => m.memberId !== me),
          {
            memberId: me,
            ...wanted,
            updatedAt: deps.stamp(seenRecordStamp(car, myId)),
          },
        ],
        deletedSpaceRecords: next.deletedSpaceRecords.filter(
          (t) => t.id !== myId
        ),
        pendingPuts: withPending(next.pendingPuts, [myId]),
      }
    }

    const onCar = new Set(next.spaceMembers.map((m) => m.memberId))
    const tags = new Set(
      next.memberRecords.filter((m) => onCar.has(m.memberId)).map((m) => m.tag)
    )
    const open = new Map(next.spaceInvites.map((i) => [i.inviteId, i]))
    const stillOpen: string[] = []
    const closed = next.inviteRecords.filter((invite) => {
      if (invite.expiresAt <= now) return true

      if (onCar.size > 0 && !onCar.has(invite.invitedBy)) return true
      if (!tags.has(invite.tag)) return false
      if (open.get(invite.inviteId)?.invitedBy === me)
        stillOpen.push(invite.inviteId)
      return true
    })
    if (closed.length > 0) {
      const ids = new Set(
        closed.map((invite) => inviteRecordId(invite.inviteId))
      )
      next = {
        ...next,
        inviteRecords: next.inviteRecords.filter((i) => !closed.includes(i)),
        deletedSpaceRecords: [
          ...next.deletedSpaceRecords.filter((t) => !ids.has(t.id)),
          ...closed.map((invite) => ({
            id: inviteRecordId(invite.inviteId),
            deletedAt: deps.stamp(invite.updatedAt),
          })),
        ],
        pendingPuts: withPending(next.pendingPuts, ids),
      }
    }

    const live = new Set(next.inviteRecords.map((invite) => invite.inviteId))
    const openNow = new Set(next.spaceInvites.map((invite) => invite.inviteId))
    const owed = ([inviteId, sent]: [
      string,
      SharedCar['sentInvites'][string],
    ]) =>
      live.has(inviteId) &&
      (openNow.has(inviteId) ||
        sent.owed === true ||
        sent.epoch < next.epoch ||
        next.rekeyNeeded)
    if (!Object.entries(next.sentInvites).every(owed))
      next = {
        ...next,
        sentInvites: Object.fromEntries(
          Object.entries(next.sentInvites).filter(owed)
        ),
      }

    if (!next.hadOthers && next.memberRecords.some((m) => m.memberId !== me))
      next = { ...next, hadOthers: true }

    if (next.ownerId === me) {
      const owed: number[] = []
      for (let epoch = 2; epoch <= next.epoch; epoch++)
        if (parts.keys.linkOwed(next, epoch)) owed.push(epoch)
      if (owed.length > 0) {
        const before = next
        next = {
          ...next,
          keyRecords: [
            ...next.keyRecords.filter((k) => !owed.includes(k.epoch)),
            ...owed.map((epoch) => ({
              epoch,
              stamp: parts.keys.linkStamp(before, epoch),
            })),
          ],
          pendingPuts: withPending(next.pendingPuts, owed.map(keysRecordId)),
        }
      }
    }
    return { car: withDerivedPeople(next), stillOpen }
  }

  function tidyCar(
    spaceId: string,
    member: SpaceMemberKeys,
    profile: SharedCarProfile
  ): string[] {
    let stillOpen: string[] = []
    ctx.update(spaceId, (car) => {
      const tidied = tidy(car, member, profile)
      stillOpen = tidied.stillOpen
      return tidied.car
    })
    for (const inviteId of stillOpen)
      ctx.engineWrite(() =>
        store.getState().addClosingInvite(spaceId, inviteId, {})
      )
    return stillOpen
  }

  function movePersonal(spaceId: string) {
    let tombstones: { id: string; deletedAt: number }[] = []
    ctx.update(spaceId, (car) => {
      const moved = movePersonalRecords(
        car,
        deps.personal.snapshot(),
        deps.stamp
      )
      tombstones = moved.tombstones
      return moved.car
    })
    if (tombstones.length > 0)
      deps.personal.mergeRecords({ deletedMileageRecords: tombstones })
  }

  async function runSteps(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<CarSyncOutcome> {
    try {
      await pull(spaceId, member)
      await parts.invites.closePendingInvites(spaceId, member)
      const pulled = ctx.cars()[spaceId]
      if (!pulled) return 'missing'
      if (parts.keys.waiting(pulled)) {
        parts.keys.noteWaiting(pulled)
        return 'waiting'
      }
      movePersonal(spaceId)
      const profile = await ctx.profile()
      const found = tidyCar(spaceId, member, profile)
      await parts.invites.closePendingInvites(spaceId, member, found)
      const car = ctx.cars()[spaceId]
      if (!car) return 'missing'
      if (parts.endings.isLastOneLeft(car)) {
        await parts.endings.endAndTell(spaceId, 'last_member', 'delete')
        return 'ended'
      }
      await parts.keys.rekeyIfNeeded(spaceId, member)
      tidyCar(spaceId, member, profile)
      await parts.invites.reissueInvites(spaceId, member)
      if (!ctx.cars()[spaceId]) return 'missing'
      await push(spaceId, member)
      ctx.update(spaceId, (c) => ({ ...c, lastSyncedAt: deps.now() }))
      return 'synced'
    } catch (error) {
      if (isSpaceError(error, 'gone')) {
        parts.endings.endLocally(spaceId, 'gone')
        return 'ended'
      }
      throw error
    }
  }

  type QueuedSync = { run: Promise<CarSyncOutcome>; minSeq?: number }
  const queuedSyncs = new Map<string, QueuedSync>()

  function reached(spaceId: string, minSeq: number | undefined) {
    const car = ctx.cars()[spaceId]
    return (
      minSeq !== undefined &&
      car !== undefined &&
      car.seq >= minSeq &&
      car.pendingPuts.length === 0
    )
  }

  function syncCar(
    spaceId: string,
    options: CarSyncOptions = {}
  ): Promise<CarSyncOutcome> {
    const { automatic = false, minSeq } = options
    if (
      automatic &&
      (ctx.backPressure.coolingDown() || deps.canSync?.() === false)
    )
      return Promise.resolve('skipped')
    const queued = queuedSyncs.get(spaceId)
    if (queued) {
      queued.minSeq =
        minSeq === undefined || queued.minSeq === undefined
          ? undefined
          : Math.max(queued.minSeq, minSeq)
      return queued.run
    }
    if (reached(spaceId, minSeq)) return Promise.resolve('skipped')
    const entry: QueuedSync = { minSeq, run: Promise.resolve('skipped') }
    const settled = () => {
      if (queuedSyncs.get(spaceId) === entry) queuedSyncs.delete(spaceId)
    }
    entry.run = ctx.serial(spaceId, async (): Promise<CarSyncOutcome> => {
      settled()
      if (!ctx.cars()[spaceId]) return 'missing'
      if (reached(spaceId, entry.minSeq)) return 'skipped'
      ctx.setCarStatus(spaceId, { syncing: true })
      try {
        const outcome = await runSteps(spaceId, await ctx.memberFor(spaceId))
        if (outcome === 'synced')
          ctx.setCarStatus(spaceId, {
            syncing: false,
            lastSyncAt: deps.now(),
            waitingForKey: false,
          })
        else if (outcome === 'waiting')
          ctx.setCarStatus(spaceId, {
            syncing: false,
            lastError: undefined,
            waitingForKey: true,
          })
        return outcome
      } catch (error) {
        ctx.noteFailure(error)
        ctx.noteSyncFailed(error)
        if (ctx.cars()[spaceId])
          ctx.setCarStatus(spaceId, {
            syncing: false,
            lastError: isSpaceError(error) ? error.code : 'unknown',
          })
        throw error
      }
    })

    entry.run.then(settled, settled)
    queuedSyncs.set(spaceId, entry)
    return entry.run
  }

  return {
    pull,
    push,
    seal,
    movePersonal,
    runSteps,
    syncCar,

    forget: (spaceId: string) => reread.delete(spaceId),
    forgetAll() {
      reread.clear()
      queuedSyncs.clear()
    },
  }
}
