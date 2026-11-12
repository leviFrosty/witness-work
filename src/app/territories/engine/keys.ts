import { sameBytes } from '@/lib/bytes'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import {
  memberOwnsKey,
  newSpaceKey,
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
  keysRecordData,
  keysRecordId,
  sealRecord,
} from '@/lib/sharedSpaces/records'
import type { EngineContext } from '@/app/territories/engine/context'
import type { TerritorySpace } from '@/features/territories/types/sharedTerritory'
import type { SealedSpaceRecord } from '@/types/sharedCars'

const REKEY_ATTEMPTS = 3

export type TerritoryKeys = ReturnType<typeof createKeys>

export function createKeys(
  ctx: EngineContext,
  pull: (spaceId: string, member: SpaceMemberKeys) => Promise<void>
) {
  const { deps, client, keyring } = ctx
  const ownWraps = new Map<
    string,
    { memberId: string; epoch: number; wrap: string; key: Uint8Array | null }
  >()

  const trust = (spaceId: string, { epoch, key }: EpochKey): KeyringChange =>
    keyring.trust(spaceId, epoch, key)

  function openOwnWrap(
    spaceId: string,
    epoch: number,
    wrap: string,
    member: SpaceMemberKeys
  ): 'trusted' | 'mismatch' | 'candidate' | 'unopened' {
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
    return sameBytes(held, opened.key) ? 'trusted' : 'mismatch'
  }

  function learnLink(
    spaceId: string,
    record: Pick<SealedSpaceRecord, 'recordId' | 'epoch' | 'deleted'>,
    data: Record<string, unknown> | undefined
  ): KeyringChange | null {
    const link = linkedKey(record, data)
    return link ? trust(spaceId, link) : null
  }

  function rebuildFromChain(
    spaceId: string,
    links: readonly SealedSpaceRecord[]
  ) {
    for (let learned = true; learned; ) {
      learned = false
      for (const record of links) {
        const x = Number(record.recordId.slice(2))
        if (keyring.key(spaceId, x - 1)) continue
        const key = keyring.key(spaceId, record.epoch)
        const link = key && openLink(spaceId, record, key)
        if (link && trust(spaceId, link) === 'new') learned = true
      }
    }
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

  function sealingKey(space: TerritorySpace): Uint8Array | null {
    const key = keyring.key(space.spaceId, space.epoch)
    if (!key) return null
    const [newest] = keyring.epochs(space.spaceId)
    return space.epoch < newest ? null : key
  }

  function linkOwed(space: TerritorySpace, epoch: number): boolean {
    if (epoch < 2) return false
    const previous = keyring.key(space.spaceId, epoch - 1)
    if (!previous || !keyring.key(space.spaceId, epoch)) return false
    const id = keysRecordId(epoch)
    if (space.pending.includes(id)) return false
    const counted = space.keyChain.find((r) => r.recordId === id)
    if (!counted) return true
    const key = keyring.key(space.spaceId, counted.epoch)
    if (!key) return false
    const link = openLink(space.spaceId, counted, key)
    return !link || !sameBytes(link.key, previous)
  }

  const vouchedFor = (
    space: TerritorySpace,
    listed: { memberId: string; dhPub: string }
  ) =>
    space.records[`m.${listed.memberId}`]?.deleted === false &&
    memberOwnsKey(space.spaceId, listed.memberId, listed.dhPub)

  async function rekeyIfNeeded(
    spaceId: string,
    member: SpaceMemberKeys
  ): Promise<boolean> {
    for (let attempt = 0; attempt < REKEY_ATTEMPTS; attempt++) {
      const space = ctx.space(spaceId)
      if (!space?.rekeyNeeded || space.ownerId !== member.memberId) return false
      const current = sealingKey(space)
      if (!current) return false
      if (
        space.members.some(
          (m) => m.memberId !== member.memberId && !vouchedFor(space, m)
        )
      )
        return false
      const epoch = space.epoch + 1
      const recordId = keysRecordId(epoch)
      const key = newSpaceKey(deps.randomBytes)
      const stamp = deps.stamp(space.keyStamps[String(epoch)])
      let wraps: { memberId: string; wrap: string }[]
      let blob: string
      try {
        wraps = space.members.map(({ memberId, dhPub }) => ({
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
        return false
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
          await pull(spaceId, member)
          continue
        }
        ctx.noteFailure(error)
        ctx.report(error, 'rekey')
        return false
      }
      trust(spaceId, { epoch, key })
      ctx.update(spaceId, (s) => ({
        ...s,
        epoch,
        rekeyNeeded: false,
        invites: [],
        keyStamps: { ...s.keyStamps, [String(epoch)]: stamp },
        keyChain: [
          ...s.keyChain.filter((r) => r.recordId !== recordId),
          { recordId, epoch, stamp, deleted: false, blob, seq: answer.seq },
        ],
      }))
      return true
    }
    return false
  }

  return {
    trust,
    openOwnWrap,
    learnLink,
    rebuildFromChain,
    settle,
    trustInvited,
    sealingKey,
    linkOwed,
    rekeyIfNeeded,
    forget(spaceId: string) {
      ownWraps.delete(spaceId)
    },
    forgetAll() {
      ownWraps.clear()
    },
  }
}
