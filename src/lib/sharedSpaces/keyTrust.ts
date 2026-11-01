import { sameBytes, toB64u } from '@/lib/bytes'
import { memberCheck } from '@/lib/sharedSpaces/crypto'
import {
  epochOfKeysRecord,
  memberRecordId,
  openRecord,
  readKeysData,
} from '@/lib/sharedSpaces/records'

export type SealedRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
}

export type EpochKey = { epoch: number; key: Uint8Array }

export function linkedKey(
  record: Pick<SealedRecord, 'recordId' | 'epoch' | 'deleted'>,
  data: Record<string, unknown> | undefined
): EpochKey | null {
  const x = epochOfKeysRecord(record.recordId)
  if (x === null || record.deleted || !data || record.epoch < x) return null
  const key = readKeysData(data)
  return key && { epoch: x - 1, key }
}

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

export type CheckingMember = { memberId: string; checkKey: Uint8Array }

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

  candidate: EpochKey

  trusted: (epoch: number) => Uint8Array | null

  links: readonly SealedRecord[]

  own: readonly SealedRecord[]
  member: CheckingMember
}

export type CandidateVerdict =
  | { status: 'trusted'; keys: EpochKey[] }
  | { status: 'mismatch'; epoch: number }
  | { status: 'unverified' }

export function verifyCandidate(input: CandidateInput): CandidateVerdict {
  const { spaceId, trusted, own, member } = input
  const byEpoch = new Map<number, SealedRecord[]>()
  for (const link of input.links) {
    const sealed = byEpoch.get(link.epoch) ?? []
    sealed.push(link)
    byEpoch.set(link.epoch, sealed)
  }

  const deadEnds = new Set<string>()

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
