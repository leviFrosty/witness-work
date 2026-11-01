import {
  matchVehicle,
  type MileageRecord,
  tombstonesPast,
} from '@/lib/mileage/records'
import {
  emptySharedCar,
  KIND_OF_COLLECTION,
  mileageRecordData,
  withDerivedPeople,
} from '@/lib/mileage/sharedCar'
import {
  isSpaceError,
  SpaceError,
  type SpaceSyncPage,
} from '@/lib/sharedSpaces/client'
import {
  newSpaceId,
  newSpaceKey,
  type SpaceMemberKeys,
  unwrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  type MemberRecordData,
  memberRecordId,
} from '@/lib/sharedSpaces/records'
import { isSharedCarKind } from '@/app/sharedCars/carRecords'
import { memberRecordData, sameMemberData } from '@/app/sharedCars/profile'
import { buildSeed } from '@/app/sharedCars/seeding'
import type { EngineContext } from '@/app/sharedCars/engine/context'
import type {
  EngineParts,
  PutBatch,
  Sharing,
  WireRecord,
} from '@/app/sharedCars/engine/parts'
import {
  SharedCarsError,
  SUSPENDED_PUT_WAIT_MS,
} from '@/app/sharedCars/engine/types'
import type { MileageCollections } from '@/types/mileage'
import type {
  SharedCarMember,
  SharedCarRecordKind,
  SharedCarSeeding,
} from '@/types/sharedCars'

const MAX_ROUNDS = 4

const GIVE_UP = new Set<string>(['too_large', 'limit', 'bad_request'])

const CREATE_REFUSED = new Set<string>([
  'bad_request',
  'forbidden',
  'gone',
  'too_large',
  'limit',
])

export function createSharing(ctx: EngineContext, parts: EngineParts): Sharing {
  const { deps, client, store, keyring } = ctx

  function current(spaceId: string): SharedCarSeeding {
    const seeding = store.getState().seeding[spaceId]
    if (!seeding) throw new SpaceError('cancelled')
    return seeding
  }

  const save = (seeding: SharedCarSeeding) =>
    ctx.engineWrite(() => store.getState().saveSeeding(seeding))

  async function abandonSeeding(spaceId: string, deleteSpace: boolean) {
    if (deleteSpace && store.getState().seeding[spaceId]?.created) {
      ctx.engineWrite(() => store.getState().setPendingEnd(spaceId, 'delete'))
      await parts.endings.finishEnd(spaceId)
    }
    ctx.engineWrite(() => store.getState().clearSeeding(spaceId))
    keyring.forget(spaceId)
    ctx.forgetMember(spaceId)
    parts.keys.forget(spaceId)
  }

  async function giveUp(
    spaceId: string,
    reason: string,
    background: boolean
  ): Promise<void> {
    const seeding = store.getState().seeding[spaceId]
    await abandonSeeding(spaceId, true)
    if (!background || !seeding) return
    deps.onOutcome?.({ type: 'share_failed', reason })
    deps.onShareFailed?.({
      vehicleId: seeding.vehicleId,
      name:
        deps.personal
          .snapshot()
          .vehicles.find((v) => v.id === seeding.vehicleId)?.name ?? '',
      reason,
    })
  }

  function firstKey(
    seeding: SharedCarSeeding,
    member: SpaceMemberKeys
  ): Uint8Array | null {
    const held = keyring.key(seeding.spaceId, 1)
    if (held || !seeding.createWrap) return held
    try {
      const key = unwrapSpaceKey(seeding.createWrap, member, {
        spaceId: seeding.spaceId,
        epoch: 1,
        memberId: member.memberId,
      })
      parts.keys.trust(seeding.spaceId, { epoch: 1, key })
      return key
    } catch (error) {
      ctx.report(error, 'share')
      return null
    }
  }

  async function createSpace(
    spaceId: string,
    member: SpaceMemberKeys,
    key: Uint8Array
  ) {
    let seeding = current(spaceId)
    if (!seeding.createWrap) {
      seeding = {
        ...seeding,
        createWrap: ctx.wrapTo(key, member.dhPub, {
          spaceId,
          epoch: 1,
          memberId: member.memberId,
        }),
      }
      save(seeding)
    }
    let joinedAt: number | undefined
    try {
      const answer = await client.create(
        {
          spaceId,
          memberId: member.memberId,
          dhPub: member.dhPub,
          tokenHash: member.tokenHash,
          wrap: seeding.createWrap!,
        },
        ctx.call()
      )
      joinedAt = answer.joinedAt
    } catch (error) {
      if (!isSpaceError(error, 'conflict')) {
        if (isSpaceError(error) && CREATE_REFUSED.has(error.code))
          await abandonSeeding(spaceId, false)
        throw error
      }
    }
    ctx.noteAnswered()
    save({
      ...current(spaceId),
      created: true,
      ...(joinedAt !== undefined && { joinedAt }),
    })
  }

  function buildWires(
    spaceId: string,
    memberId: string,
    memberWire: WireRecord
  ) {
    const seeding = current(spaceId)
    const built = buildSeed(
      deps.personal.snapshot(),
      seeding,
      memberId,
      deps.randomUUID
    )
    if (!built) return null

    if (
      Object.keys(built.fuelCopies).length !==
        Object.keys(seeding.fuelCopies).length ||
      Object.keys(built.priceCopies).length !==
        Object.keys(seeding.priceCopies).length
    )
      save({
        ...seeding,
        fuelCopies: built.fuelCopies,
        priceCopies: built.priceCopies,
      })
    const correct = deps.correctStamp ?? ((stamp: number) => stamp)
    const collections = {} as MileageCollections
    const wires: WireRecord[] = []
    for (const key of Object.keys(
      built.collections
    ) as (keyof MileageCollections)[]) {
      const kind = KIND_OF_COLLECTION[key]
      const records = (built.collections[key] as MileageRecord[]).map(
        (record) =>
          record.updatedAt === undefined
            ? record
            : { ...record, updatedAt: correct(record.updatedAt) }
      )
      Object.assign(collections, { [key]: records })
      for (const record of records)
        wires.push({
          recordId: record.id,
          kind,
          data: mileageRecordData(record),
          deleted: false,
          stamp: record.updatedAt ?? 0,
        })
    }
    wires.push(memberWire)
    return { collections, wires }
  }

  async function head(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<SpaceSyncPage> {
    let page: SpaceSyncPage
    try {
      page = await client.sync(
        ctx.auth(member),
        { since: 0, limit: 1 },
        ctx.call()
      )
    } catch (error) {
      if (isSpaceError(error, 'gone') || isSpaceError(error, 'forbidden'))
        await abandonSeeding(spaceId, false)
      throw error
    }
    ctx.noteAnswered()
    current(spaceId)
    if (page.ownerId !== member.memberId) {
      await abandonSeeding(spaceId, false)
      throw new SpaceError('conflict')
    }
    parts.keys.openOwnWrap(spaceId, page.epoch, page.wrap, member)
    return page
  }

  async function putBatch(
    spaceId: string,
    member: SpaceMemberKeys,
    batch: PutBatch
  ) {
    let result
    try {
      result = await client.put(ctx.auth(member), batch.records, ctx.call())
    } catch (error) {
      if (isSpaceError(error, 'gone')) await abandonSeeding(spaceId, false)
      if (isSpaceError(error, 'suspended'))
        ctx.puts.suspended(SUSPENDED_PUT_WAIT_MS)
      throw error
    }
    ctx.noteAnswered()
    ctx.puts.stored()
    const seeding = current(spaceId)
    const landed = { ...seeding.landed }
    for (const { recordId } of result.results) {
      const stamp = batch.stamps.get(recordId)
      const kind = batch.kinds.get(recordId)
      if (stamp !== undefined && kind !== undefined)
        landed[recordId] = { stamp, kind }
    }
    save({ ...seeding, landed, seq: Math.max(seeding.seq, result.seq) })
  }

  async function putRounds(
    spaceId: string,
    member: SpaceMemberKeys,
    epoch: number,
    key: Uint8Array,
    memberWire: WireRecord,
    background: boolean
  ): Promise<void> {
    let restamped = false
    for (let round = 0; round < MAX_ROUNDS; ) {
      const next = buildWires(spaceId, member.memberId, memberWire)
      if (!next) {
        await abandonSeeding(spaceId, true)
        throw new SharedCarsError('not_found')
      }
      const { landed } = current(spaceId)
      const toPut = next.wires.filter(
        (wire) => landed[wire.recordId]?.stamp !== wire.stamp
      )
      const { batches, tooLarge } = parts.sync.seal(member, epoch, key, toPut)
      if (tooLarge.length > 0) {
        await giveUp(spaceId, 'too_large', background)
        throw new SpaceError('too_large')
      }
      if (batches.length === 0) return
      if (ctx.puts.held()) throw new SpaceError('suspended', 403)
      try {
        for (const batch of batches) await putBatch(spaceId, member, batch)
        round++
      } catch (error) {
        if (isSpaceError(error, 'bad_request') && !restamped) {
          restamped = true
          await ctx.refreshClock()
          continue
        }
        if (isSpaceError(error) && GIVE_UP.has(error.code))
          await giveUp(spaceId, error.code, background)
        throw error
      }
    }
  }

  async function seed(
    spaceId: string,
    member: SpaceMemberKeys,
    options: { resumed: boolean; background: boolean }
  ) {
    const started = store.getState().seeding[spaceId]
    if (!started) return
    if (
      !deps.personal.snapshot().vehicles.some((v) => v.id === started.vehicleId)
    ) {
      await abandonSeeding(spaceId, true)
      throw new SharedCarsError('not_found')
    }
    const first = firstKey(started, member)
    if (!first) {
      await abandonSeeding(spaceId, started.created)
      throw new SharedCarsError('not_ready')
    }
    if (!started.created) await createSpace(spaceId, member, first)

    const page = await head(spaceId, member)

    const key = keyring.key(spaceId, page.epoch)
    if (!key) throw new SharedCarsError('key_unverified')
    const joinedAt =
      current(spaceId).joinedAt ??
      page.members.find((m) => m.memberId === member.memberId)?.joinedAt ??
      deps.syncNow()
    const own = ownRecord(
      spaceId,
      member,
      memberRecordData(await ctx.profile(), spaceId, joinedAt)
    )
    const { memberId: _id, updatedAt: _stamp, ...memberData } = own
    const memberWire: WireRecord = {
      recordId: memberRecordId(member.memberId),
      kind: 'member',
      data: { ...memberData },
      deleted: false,
      stamp: own.updatedAt ?? 0,
    }

    await putRounds(
      spaceId,
      member,
      page.epoch,
      key,
      memberWire,
      options.background
    )

    const final = buildWires(spaceId, member.memberId, memberWire)
    if (!final) {
      await abandonSeeding(spaceId, true)
      throw new SharedCarsError('not_found')
    }
    const done = current(spaceId)
    const unsent = final.wires
      .filter((wire) => done.landed[wire.recordId]?.stamp !== wire.stamp)
      .map((wire) => wire.recordId)

    const present = new Set(final.wires.map((wire) => wire.recordId))
    const personalTombstones = new Map(
      deps.personal
        .snapshot()
        .deletedMileageRecords.map((t) => [t.id, t.deletedAt])
    )
    const tombstones = Object.entries(done.landed)
      .filter(
        ([recordId, { kind }]) =>
          !present.has(recordId) && isSharedCarKind(kind)
      )
      .map(([id, { stamp, kind }]) => ({
        id,
        deletedAt: Math.max(personalTombstones.get(id) ?? 0, deps.stamp(stamp)),
        kind: kind as SharedCarRecordKind,
      }))
    const car = withDerivedPeople(
      emptySharedCar(spaceId, {
        ...final.collections,
        deletedMileageRecords: tombstones,
        myMemberId: member.memberId,
        ownerId: page.ownerId,
        epoch: page.epoch,

        seq: done.seq,
        spaceMembers: page.members,
        spaceInvites: page.invites,
        memberRecords: [own],

        ownRecordChecked: true,
        writtenName: memberData.name,
        writtenAvatar: memberData.avatar ?? null,
        pendingPuts: [...unsent, ...tombstones.map((t) => t.id)],
      })
    )

    const moved = tombstonesPast(
      deps.personal.snapshot(),
      matchVehicle(done.vehicleId)
    )
    ctx.engineWrite(() => {
      const state = store.getState()
      state.saveSharedCar(car)
      deps.personal.mergeRecords({ deletedMileageRecords: moved })
      state.noteJoined(spaceId, ctx.joinTime(spaceId))
      state.clearSeeding(spaceId)
    })
    deps.onOutcome?.({ type: 'shared', resumed: options.resumed })

    try {
      await parts.sync.push(spaceId, member)
    } catch (error) {
      ctx.rethrowReset(error)
      ctx.noteFailure(error)
      ctx.report(error, 'put')
    }
  }

  function ownRecord(
    spaceId: string,
    member: SpaceMemberKeys,
    data: MemberRecordData
  ): SharedCarMember {
    const seeding = current(spaceId)
    const saved = seeding.member
    if (saved && sameMemberData(saved, data)) return saved
    const own: SharedCarMember = {
      memberId: member.memberId,
      ...data,
      updatedAt: deps.stamp(saved?.updatedAt),
    }
    save({ ...seeding, member: own })
    return own
  }

  function resumeShare(
    spaceId: string,
    options: { resumed: boolean; background: boolean }
  ): Promise<{ spaceId: string }> {
    return ctx.serial(spaceId, async () => {
      const member = await ctx.memberFor(spaceId)
      await seed(spaceId, member, options)
      return { spaceId }
    })
  }

  async function shareCar(vehicleId: string): Promise<{ spaceId: string }> {
    const seeding = Object.values(store.getState().seeding).find(
      (s) => s.vehicleId === vehicleId
    )
    if (seeding)
      return resumeShare(seeding.spaceId, { resumed: true, background: false })
    if (!deps.personal.snapshot().vehicles.some((v) => v.id === vehicleId))
      throw new SharedCarsError('not_found')
    if (!(await ctx.rootSeed())) throw new SharedCarsError('no_account_key')
    const spaceId = newSpaceId(deps.randomBytes)
    parts.keys.trust(spaceId, { epoch: 1, key: newSpaceKey(deps.randomBytes) })
    save({
      spaceId,
      vehicleId,
      startedAt: deps.stamp(),
      created: false,
      fuelCopies: {},
      priceCopies: {},
      landed: {},
      seq: 0,
    })
    return resumeShare(spaceId, { resumed: false, background: false })
  }

  async function resumeShares(): Promise<void> {
    await Promise.all(
      Object.keys(store.getState().seeding).map((spaceId) =>
        resumeShare(spaceId, { resumed: true, background: true }).catch(
          (error: unknown) => {
            ctx.noteFailure(error)
            ctx.noteSyncFailed(error)
            ctx.report(error, 'share')
          }
        )
      )
    )
  }

  async function abandonShares(): Promise<void> {
    await Promise.all(
      Object.keys(store.getState().seeding).map((spaceId) =>
        ctx
          .serial(spaceId, () => abandonSeeding(spaceId, true))
          .catch((error: unknown) => ctx.report(error, 'share'))
      )
    )
  }

  return { shareCar, resumeShares, abandonShares }
}
