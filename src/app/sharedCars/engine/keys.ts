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

/**
 * The space keys (docs/shared-cars-protocol.md, "Keys"). The keyring holds only
 * keys this device trusts, and never replaces one (`keyTrust`):
 *
 * - **Own wrap.** It gives a candidate for the current epoch. The key already
 *   trusted for it: nothing to do. Another: this device keeps its own and
 *   reports it. None yet: the car waits until the key chain ties the candidate
 *   to a trusted key, or the User's key check vouches for it.
 * - **Invitation.** Its key is trusted once `join` took it. After `conflict`, or
 *   a sync that found the join landed, only when the own wrap for its epoch
 *   holds the same key.
 * - **The car's epoch** is the server's as of the last sync. The car seals only
 *   under that epoch's trusted key, and never at an epoch older than the newest
 *   this device trusts: otherwise it waits.
 * - **Key chain.** `k.<x>` holds `K_{x-1}`, and counts only when it's sealed
 *   under epoch `x` or later. One opened with a trusted key teaches the key it
 *   holds. The last version of each that counted is kept sealed, with the last
 *   version of the User's own member record whose check matched, so a keyring
 *   this device lost is trusted again from them.
 * - **Rekey.** After someone goes, the owner's device makes `K_{e+1}` and wraps
 *   it only to members it can vouch for, with `k.<e+1>` in the same request.
 */

/** How many times a rekey syncs and tries again when membership changed. */
const REKEY_ATTEMPTS = 3

export function createKeyManagement(
  ctx: EngineContext,
  parts: EngineParts
): KeyManagement {
  const { deps, client, keyring } = ctx
  /**
   * Each space's own wrap as last opened, and the key it held: opened again
   * only once the wrap changed. Until the key is trusted, it's the candidate.
   */
  const ownWraps = new Map<
    string,
    { memberId: string; epoch: number; wrap: string; key: Uint8Array | null }
  >()
  /** What was last reported of each kind on each space: each state once. */
  const reported = new Map<string, string>()

  /** Runs `report` unless it already ran for `state` of `kind` on the space. */
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

  /** A failure the car works around, for Sentry and analytics: no ids. */
  function noteProblem(error: SharedCarsError, context: string) {
    ctx.report(error, context)
    ctx.noteSyncFailed(error)
  }

  /** Something offered another key for an epoch this device trusts. */
  const noteMismatch = (spaceId: string, epoch: number) =>
    once(spaceId, 'mismatch', String(epoch), () =>
      noteProblem(new SharedCarsError('key_mismatch'), 'keys')
    )

  /**
   * Trusts `key` for its epoch: one made here, an invitation's, or one the key
   * chain or key check vouched for. Another key already trusted for the epoch
   * stays, and the mismatch is reported.
   */
  function trust(spaceId: string, { epoch, key }: EpochKey): KeyringChange {
    const change = keyring.trust(spaceId, epoch, key)
    if (change === 'mismatch') noteMismatch(spaceId, epoch)
    return change
  }

  /** Opens this device's own wrap of epoch `epoch`'s key, against the keyring. */
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

  /**
   * Learns the key a key chain link opened with a trusted key holds: what the
   * keyring did with it, or null when the link doesn't count. One sealed below
   * its own epoch is someone's attempt to plant a key, and is reported.
   */
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

  /**
   * Trusts again the keys the kept key chain links to a trusted one, newest
   * first: a keyring this device lost, or one an earlier sync couldn't reach.
   * True when it learned one.
   */
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

  /**
   * Trusts the own wrap's candidate once the key chain ties it to a trusted
   * key, or the User's key check vouches for it, with every key on the way
   * (`verifyCandidate`). `links` are the space's key chain links as sealed, and
   * `own` versions of the User's own member record (the last whose check
   * matched here, and any newer). True when it trusted the candidate.
   */
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
    // Reported at the epoch where the chain met the key trusted for it.
    if (verdict.status === 'mismatch') noteMismatch(spaceId, verdict.epoch)
    if (verdict.status !== 'trusted') return false
    for (const key of verdict.keys) trust(spaceId, key)
    return true
  }

  /**
   * A join answered `conflict`, or one a sync found had landed, doesn't by
   * itself make its invitation's key trusted, since the User may have been on
   * the car already: only when the User's own wrap for the invitation's epoch
   * (`own`, as that sync gave it) opens to the same key. True when it trusted
   * it. Otherwise the wrap is a candidate like any other, on the next sync.
   */
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

  /**
   * The key this device seals under on `car` now: the one it trusts for the
   * car's epoch, the server's as of the last sync. None for a key nothing
   * vouches for yet, or for an epoch older than the newest one this device
   * trusts, so a server can't roll the car back to a key someone who left still
   * holds (docs/shared-cars-protocol.md, "The car's epoch").
   */
  function sealingKey(car: SharedCar): Uint8Array | null {
    const key = keyring.key(car.spaceId, car.epoch)
    if (!key) return null
    const [newest] = keyring.epochs(car.spaceId)
    return car.epoch < newest ? null : key
  }

  /** Nothing this device may seal under on `car` yet: the car waits. */
  const waiting = (car: SharedCar) => !sealingKey(car)

  /** The car waits for its key: reported once for each epoch. */
  const noteWaiting = (car: SharedCar) =>
    once(car.spaceId, 'waiting', String(car.epoch), () =>
      noteProblem(new SharedCarsError('key_unverified'), 'keys')
    )

  /**
   * A new stamp for `k.<epoch>`, past every version of it this device has seen,
   * ones that don't open or count included: a planted, broken or deleted link
   * with a later stamp would otherwise hide the owner's.
   */
  const linkStamp = (car: SharedCar, epoch: number): number =>
    deps.stamp(seenRecordStamp(car, keysRecordId(epoch)))

  /**
   * Whether the owner's device owes `k.<epoch>` again (docs/shared-cars-
   * protocol.md, "Links"): it trusts both keys, and the space's newest version
   * of the link is missing, doesn't open, doesn't count, or holds another key
   * than `K_{epoch-1}`. One from a newer app is left to it. The link goes again
   * stamped past every version seen, sealed under the current key.
   */
  function linkOwed(car: SharedCar, epoch: number): boolean {
    const previous = keyring.key(car.spaceId, epoch - 1)
    if (epoch < 2 || !previous || !keyring.key(car.spaceId, epoch)) return false
    const id = keysRecordId(epoch)
    if (car.pendingPuts.includes(id)) return false
    // The last version that counted, unless a newer one came since: kept
    // sealed under a key this device doesn't trust, or unread.
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

  /**
   * Whether this device can vouch for `listed` as a member to wrap a new key
   * to: their member record opened under a trusted key (every key in the
   * keyring is), and a `dhPub` their `memberId` commits to.
   */
  const vouchedFor = (car: SharedCar, listed: SharedCarSpaceMember) =>
    car.memberRecords.some((m) => m.memberId === listed.memberId) &&
    memberOwnsKey(car.spaceId, listed.memberId, listed.dhPub)

  /**
   * The owner's device makes a new key after someone went, wrapped to every
   * member it can vouch for (its own derived key for itself), with `k.<e+1>`
   * holding the current key in the same request. A member it can't vouch for
   * (no member record, or a key their id doesn't commit to) means no rekey yet,
   * reported once. The new key is trusted only once the server took it: after a
   * lost answer, the next sync trusts it through the link. `conflict`
   * (membership changed meanwhile) and `stale_key` (another of the owner's
   * devices rekeyed) sync and try again; anything else waits for the next
   * sync.
   */
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
          // The server's now.
          epoch,
          rekeyNeeded: false,
          // A rekey closes every open invite.
          spaceInvites: [],
          keyRecords: [
            ...c.keyRecords.filter((k) => k.epoch !== epoch),
            { epoch, stamp },
          ],
          // The server stored the link as sent, in place of any other.
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
    /** Forgets what this device opened and reported for `spaceId`. */
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
