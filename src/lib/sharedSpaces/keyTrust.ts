import { sameBytes, toB64u } from '@/lib/bytes'
import { memberCheck } from '@/lib/sharedSpaces/crypto'
import {
  epochOfKeysRecord,
  memberRecordId,
  openRecord,
  readKeysData,
} from '@/lib/sharedSpaces/records'

/**
 * Which space keys a device may trust (docs/shared-cars-protocol.md, "Trusted
 * keys"). A wrap is made from public values only, so the server could wrap a
 * key of its own to anyone: a device seals and reads only under keys it trusts.
 * Beyond the keys it made and the ones invitations brought, a key is trusted
 * when the key chain ties it to a trusted one, or when the User's own key check
 * vouches for it. The server holds no trusted key and no check key, so it can
 * make neither. Pure; the engine keeps what it trusts in its keyring.
 */

/** A record as the space holds it, still sealed. */
export type SealedRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
}

/** One epoch's key. */
export type EpochKey = { epoch: number; key: Uint8Array }

/**
 * The key a key chain link holds, from its opened `data`: `k.<x>` holds
 * `K_{x-1}`, and counts only when it's live and sealed under epoch `x` or
 * later, so a member at an earlier epoch can't plant one. Null otherwise.
 */
export function linkedKey(
  record: Pick<SealedRecord, 'recordId' | 'epoch' | 'deleted'>,
  data: Record<string, unknown> | undefined
): EpochKey | null {
  const x = epochOfKeysRecord(record.recordId)
  if (x === null || record.deleted || !data || record.epoch < x) return null
  const key = readKeysData(data)
  return key && { epoch: x - 1, key }
}

/**
 * Opens a key chain link with `key`, its epoch's: the key it holds, or null
 * when it doesn't count or doesn't open.
 */
export function openLink(
  spaceId: string,
  record: SealedRecord,
  key: Uint8Array
): EpochKey | null {
  if (epochOfKeysRecord(record.recordId) === null || record.deleted) return null
  try {
    const plaintext = openRecord(
      key,
      {
        spaceId,
        epoch: record.epoch,
        recordId: record.recordId,
        deleted: false,
        stamp: record.stamp,
      },
      record.blob
    )
    return plaintext.kind === 'keys' ? linkedKey(record, plaintext.data) : null
  } catch {
    return null
  }
}

/**
 * Whether a `member` record's `data`, sealed under `key` at `epoch`, carries
 * the key check `checkKey` makes for it (`memberCheck`): one of the User's own
 * devices wrote exactly this, under that key.
 */
export function checkMatches(
  spaceId: string,
  epoch: number,
  key: Uint8Array,
  data: Record<string, unknown>,
  checkKey: Uint8Array
): boolean {
  const { name, avatar, tag, joinedAt, check } = data
  if (
    typeof name !== 'string' ||
    (avatar !== undefined && typeof avatar !== 'string') ||
    typeof tag !== 'string' ||
    typeof joinedAt !== 'number' ||
    !Number.isFinite(joinedAt) ||
    typeof check !== 'string'
  )
    return false
  return (
    memberCheck(checkKey, {
      spaceId,
      epoch,
      spaceKey: key,
      name,
      avatar,
      tag,
      joinedAt,
    }) === check
  )
}

/** The User on a space, as far as their key check goes. */
export type CheckingMember = { memberId: string; checkKey: Uint8Array }

/**
 * Whether the User's own `member` record, opened with `key` (its epoch's),
 * vouches for that key: it opens, and its check matches.
 */
export function ownRecordVouches(
  spaceId: string,
  record: SealedRecord,
  key: Uint8Array,
  member: CheckingMember
): boolean {
  if (record.recordId !== memberRecordId(member.memberId) || record.deleted)
    return false
  try {
    const plaintext = openRecord(
      key,
      {
        spaceId,
        epoch: record.epoch,
        recordId: record.recordId,
        deleted: false,
        stamp: record.stamp,
      },
      record.blob
    )
    return (
      plaintext.kind === 'member' &&
      plaintext.data !== undefined &&
      checkMatches(spaceId, record.epoch, key, plaintext.data, member.checkKey)
    )
  } catch {
    return false
  }
}

export type CandidateInput = {
  spaceId: string
  /** A key a wrap gave for an epoch this device trusts no key for. */
  candidate: EpochKey
  /** The key this device trusts for `epoch`, or null. */
  trusted: (epoch: number) => Uint8Array | null
  /** The space's key chain links (`k.<x>`), as sealed. */
  links: readonly SealedRecord[]
  /**
   * Versions of the User's own `member` record as sealed: the last one whose
   * check matched here, and any newer one the space holds.
   */
  own: readonly SealedRecord[]
  member: CheckingMember
}

export type CandidateVerdict =
  /**
   * Trusted: `keys` is every key on the path from the candidate (first) to what
   * vouched for it, all to trust now.
   */
  | { status: 'trusted'; keys: EpochKey[] }
  /**
   * The chain from it reached `epoch`, which this device trusts another key
   * for: a planted key.
   */
  | { status: 'mismatch'; epoch: number }
  /** Nothing vouches for it yet; the link or record may arrive later. */
  | { status: 'unverified' }

/**
 * Walks the key chain back from a candidate key until it reaches a key this
 * device trusts, or the User's own member record with a check that matches
 * (docs/shared-cars-protocol.md, "The own wrap"). Each step opens the links
 * sealed under the key it has, which hold earlier keys, so the epoch always
 * falls and the walk ends. Only someone holding a key can seal a link under it,
 * and only the User's devices can make a check, so a key the server made up
 * leads to neither.
 */
export function verifyCandidate(input: CandidateInput): CandidateVerdict {
  const { spaceId, trusted, own, member } = input
  const byEpoch = new Map<number, SealedRecord[]>()
  for (const link of input.links) {
    const sealed = byEpoch.get(link.epoch) ?? []
    sealed.push(link)
    byEpoch.set(link.epoch, sealed)
  }
  /** Keys already walked from without reaching anything, by epoch and key. */
  const deadEnds = new Set<string>()
  /** The first epoch the walk reached that's trusted with another key. */
  let mismatch: number | null = null

  function walk(step: EpochKey, path: EpochKey[]): EpochKey[] | null {
    const held = trusted(step.epoch)
    if (held) {
      if (sameBytes(held, step.key)) return path
      mismatch ??= step.epoch
      return null
    }
    const name = `${step.epoch}|${toB64u(step.key)}`
    if (deadEnds.has(name)) return null
    const here = [...path, step]
    if (
      own.some(
        (record) =>
          record.epoch === step.epoch &&
          ownRecordVouches(spaceId, record, step.key, member)
      )
    )
      return here
    for (const link of byEpoch.get(step.epoch) ?? []) {
      const earlier = openLink(spaceId, link, step.key)
      if (!earlier) continue
      const found = walk(earlier, here)
      if (found) return found
    }
    deadEnds.add(name)
    return null
  }

  const keys = walk(input.candidate, [])
  if (keys) return { status: 'trusted', keys }
  return mismatch === null
    ? { status: 'unverified' }
    : { status: 'mismatch', epoch: mismatch }
}
