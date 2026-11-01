import { sameBytes } from '@/lib/bytes'
import { seenRecordStamp, withDerivedPeople } from '@/lib/mileage/sharedCar'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import {
  memberOwnsKey,
  newSpaceKey,
  SpaceOpenError,
  type SpaceMemberKeys,
  unwrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import type { KeyringChange } from '@/lib/sharedSpaces/keyring'
import {
  type EpochKey,
  linkedKey,
  openLink,
  verifyCandidate,
} from '@/lib/sharedSpaces/keyTrust'
import {
  epochOfKeysRecord,
  keysRecordData,
  keysRecordId,
  sealRecord,
} from '@/lib/sharedSpaces/records'
import type { EngineContext } from '@/app/sharedCars/engine/context'
import type {
  EngineParts,
  KeyManagement,
  OwnWrap,
} from '@/app/sharedCars/engine/parts'
import { SharedCarsError } from '@/app/sharedCars/engine/types'
import type {
  SealedSpaceRecord,
  SharedCar,
  SharedCarSpaceMember,
  UnreadSpaceRecord,
} from '@/types/sharedCars'

const REKEY_ATTEMPTS = 3

export function createKeyManagement(
  ctx: EngineContext,
  parts: EngineParts
): KeyManagement {
  const { deps, client, keyring } = ctx

  const ownWraps = new Map<
    string,
    { memberId: string; epoch: number; wrap: string; key: Uint8Array | null }
  >()

  const reported = new Map<string, string>()

  function once(
    spaceId: string,
    kind: 'mismatch' | 'waiting' | 'unvouched',
    state: string,
    report: () => void
  ) {
    const name = `${kind}|${spaceId}`
    if (reported.get(name) === state) return
    reported.set(name, state)
    report()
  }

  function noteProblem(error: SharedCarsError, context: string) {
    ctx.report(error, context)
    ctx.noteSyncFailed(error)
  }

  const noteMismatch = (spaceId: string, epoch: number) =>
    once(spaceId, 'mismatch', String(epoch), () =>
      noteProblem(new SharedCarsError('key_mismatch'), 'keys')
    )

  function trust(spaceId: string, { epoch, key }: EpochKey): KeyringChange {
    const change = keyring.trust(spaceId, epoch, key)
    if (change === 'mismatch') noteMismatch(spaceId, epoch)
    return change
  }

  function openOwnWrap(
    spaceId: string,
    epoch: number,
    wrap: string,
    member: SpaceMemberKeys
  ): OwnWrap {
    let opened = ownWraps.get(spaceId)
    if (
      opened?.memberId !== member.memberId ||
      opened.epoch !== epoch ||
      opened.wrap !== wrap
    ) {
      let key: Uint8Array | null = null
      try {
        key = unwrapSpaceKey(wrap, member, {
          spaceId,
          epoch,
          memberId: member.memberId,
        })
      } catch (error) {
        ctx.report(error, 'unwrap')
      }
      opened = { memberId: member.memberId, epoch, wrap, key }
      ownWraps.set(spaceId, opened)
    }
    if (!opened.key) return 'unopened'
    const held = keyring.key(spaceId, epoch)
    if (!held) return 'candidate'
    if (sameBytes(held, opened.key)) return 'trusted'
    noteMismatch(spaceId, epoch)
    return 'mismatch'
  }

  function learnLink(
    spaceId: string,
    record: Pick<SealedSpaceRecord, 'recordId' | 'epoch' | 'deleted'>,
    data: Record<string, unknown> | undefined
  ): KeyringChange | null {
    const link = linkedKey(record, data)
    if (link) return trust(spaceId, link)
    const epoch = epochOfKeysRecord(record.recordId)
    if (epoch !== null && !record.deleted && record.epoch < epoch)
      ctx.report(new SpaceOpenError('contents'), 'keys')
    return null
  }

  function rebuildFromChain(
    spaceId: string,
    links: readonly SealedSpaceRecord[]
  ): boolean {
    let learnedAny = false
    for (let learned = true; learned; ) {
      learned = false
      for (const record of links) {
        const epoch = epochOfKeysRecord(record.recordId)
        if (epoch === null || keyring.key(spaceId, epoch - 1)) continue
        const key = keyring.key(spaceId, record.epoch)
        const link = key && openLink(spaceId, record, key)
        if (link && trust(spaceId, link) === 'new') learned = learnedAny = true
      }
    }
    return learnedAny
  }

  function settle(
    spaceId: string,
    links: readonly SealedSpaceRecord[],
    own: readonly SealedSpaceRecord[],
    member: SpaceMemberKeys
  ): boolean {
    const opened = ownWraps.get(spaceId)
    if (
      !opened?.key ||
      opened.memberId !== member.memberId ||
      keyring.key(spaceId, opened.epoch)
    )
      return false
    const verdict = verifyCandidate({
      spaceId,
      candidate: { epoch: opened.epoch, key: opened.key },
      trusted: (epoch) => keyring.key(spaceId, epoch),
      links,
      own,
      member,
    })

    if (verdict.status === 'mismatch') noteMismatch(spaceId, verdict.epoch)
    if (verdict.status !== 'trusted') return false
    for (const key of verdict.keys) trust(spaceId, key)
    return true
  }

  function trustInvited(
    spaceId: string,
    invited: EpochKey,
    own: { epoch: number; wrap: string },
    member: SpaceMemberKeys
  ): boolean {
    if (own.epoch !== invited.epoch) return false
    if (openOwnWrap(spaceId, own.epoch, own.wrap, member) === 'unopened')
      return false
    const opened = ownWraps.get(spaceId)?.key
    if (!opened || !sameBytes(opened, invited.key)) return false
    return trust(spaceId, invited) !== 'mismatch'
  }

  function sealingKey(car: SharedCar): Uint8Array | null {
    const key = keyring.key(car.spaceId, car.epoch)
    if (!key) return null
    const [newest] = keyring.epochs(car.spaceId)
    return car.epoch < newest ? null : key
  }

  const waiting = (car: SharedCar) => !sealingKey(car)

  const noteWaiting = (car: SharedCar) =>
    once(car.spaceId, 'waiting', String(car.epoch), () =>
      noteProblem(new SharedCarsError('key_unverified'), 'keys')
    )

  const linkStamp = (car: SharedCar, epoch: number): number =>
    deps.stamp(seenRecordStamp(car, keysRecordId(epoch)))

  function linkOwed(car: SharedCar, epoch: number): boolean {
    const previous = keyring.key(car.spaceId, epoch - 1)
    if (epoch < 2 || !previous || !keyring.key(car.spaceId, epoch)) return false
    const id = keysRecordId(epoch)
    if (car.pendingPuts.includes(id)) return false

    const counted = car.keyChain.find((r) => r.recordId === id)
    let newest: SealedSpaceRecord | UnreadSpaceRecord | undefined = counted
    for (const record of [...car.sealedRecords, ...car.unreadRecords])
      if (record.recordId === id && (!newest || record.seq > newest.seq))
        newest = record
    if (!newest) return true
    if (newest !== counted)
      return !('problem' in newest && newest.problem === 'newer')
    const key = keyring.key(car.spaceId, newest.epoch)
    if (!key) return false
    const link = openLink(car.spaceId, newest, key)
    return !link || !sameBytes(link.key, previous)
  }

  const vouchedFor = (car: SharedCar, listed: SharedCarSpaceMember) =>
    car.memberRecords.some((m) => m.memberId === listed.memberId) &&
    memberOwnsKey(car.spaceId, listed.memberId, listed.dhPub)

  async function rekeyIfNeeded(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<void> {
    for (let attempt = 0; attempt < REKEY_ATTEMPTS; attempt++) {
      const car = ctx.cars()[spaceId]
      if (!car?.rekeyNeeded || car.ownerId !== member.memberId) return
      const current = sealingKey(car)
      if (!current) return
      const unvouched = car.spaceMembers
        .filter((m) => m.memberId !== member.memberId && !vouchedFor(car, m))
        .map((m) => m.memberId)
        .sort()
      if (unvouched.length > 0) {
        once(spaceId, 'unvouched', `${car.epoch}|${unvouched.join(',')}`, () =>
          noteProblem(new SharedCarsError('member_unverified'), 'rekey')
        )
        return
      }
      const epoch = car.epoch + 1
      const recordId = keysRecordId(epoch)
      const key = newSpaceKey(deps.randomBytes)
      const stamp = linkStamp(car, epoch)
      let wraps: { memberId: string; wrap: string }[]
      let blob: string
      try {
        wraps = car.spaceMembers.map(({ memberId, dhPub }) => ({
          memberId,
          wrap: ctx.wrapTo(
            key,
            memberId === member.memberId ? member.dhPub : dhPub,
            { spaceId, epoch, memberId }
          ),
        }))
        blob = sealRecord(
          key,
          { spaceId, epoch, recordId, deleted: false, stamp },
          { kind: 'keys', data: keysRecordData(current) },
          deps.randomBytes(24)
        )
      } catch (error) {
        ctx.report(error, 'rekey')
        return
      }
      let answer: { seq: number }
      try {
        answer = await client.rekey(
          ctx.auth(member),
          { epoch, wraps, link: { stamp, blob } },
          ctx.call()
        )
      } catch (error) {
        ctx.rethrowReset(error)
        if (isSpaceError(error, 'gone')) throw error
        if (
          isSpaceError(error, 'conflict') ||
          isSpaceError(error, 'stale_key')
        ) {
          await parts.sync.pull(spaceId, member)
          continue
        }
        ctx.noteFailure(error)
        ctx.report(error, 'rekey')
        return
      }
      ctx.noteAnswered()
      trust(spaceId, { epoch, key })
      ctx.update(spaceId, (c) =>
        withDerivedPeople({
          ...c,

          epoch,
          rekeyNeeded: false,

          spaceInvites: [],
          keyRecords: [
            ...c.keyRecords.filter((k) => k.epoch !== epoch),
            { epoch, stamp },
          ],

          keyChain: [
            ...c.keyChain.filter((r) => r.recordId !== recordId),
            { recordId, epoch, stamp, deleted: false, blob, seq: answer.seq },
          ],
        })
      )
      deps.onOutcome?.({ type: 'rekeyed' })
      return
    }
  }

  return {
    trust,
    openOwnWrap,
    learnLink,
    rebuildFromChain,
    settle,
    trustInvited,
    sealingKey,
    waiting,
    noteWaiting,
    rekeyIfNeeded,
    linkStamp,
    linkOwed,

    forget(spaceId: string) {
      ownWraps.delete(spaceId)
      for (const name of reported.keys())
        if (name.endsWith(`|${spaceId}`)) reported.delete(name)
    },
    forgetAll() {
      ownWraps.clear()
      reported.clear()
    },
  }
}
