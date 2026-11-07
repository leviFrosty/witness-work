import { fromB64u, fromUtf8, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { open, seal, sha256 } from '@/features/buddies/lib/crypto'
import type { BuddiesEngine } from '@/features/buddies/lib/engine'
import { RECONNECT_KIND } from '@/features/buddies/lib/engine'
import {
  aad,
  type BuddyIdentity,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import {
  isRelayConnectivityError,
  isRelayError,
  type OwnerAuth,
  RelayError,
  type RelayClient,
  type WriterAuth,
} from '@/features/buddies/lib/relay'
import {
  type PairReconnect,
  type Roster,
  rosterSchema,
} from '@/features/buddies/lib/schemas'
import {
  type Buddy,
  type BuddyOverrides,
  type CardName,
  mergeCardName,
  pairingEnded,
} from '@/features/buddies/lib/state'
import { logger } from '@/lib/logger'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'

export const RECONNECT_WAIT_MS = 24 * 60 * 60 * 1000

export const SUSPENDED_WAIT_MS = 7 * 24 * 60 * 60 * 1000

const RETRY_MS = 5 * 60 * 1000

export const MAX_INVITE_FAILURES = 3

export type FormerBuddy = {
  inboxId: string
  dhPub: string
  name: string

  status: Buddy['status'] | 'ended'
  nickname?: string
  color?: string
  colorIndex: number
  overrides?: BuddyOverrides

  slotId: string
  writerSeed: string
  contentKey: string

  secret: string

  sentAt?: number

  sealedAt?: number

  notSent?: ReconnectNotSent

  inviteFailures?: number

  gone?: true

  leftAt?: number
}

export type BuddiesKeyChangeProgress = {
  v: 1
  oldInboxId: string
  newInboxId: string
  startedAt: number

  hadInbox: boolean

  cardName?: CardName
  former: FormerBuddy[]
  newInboxLinked?: true
  oldInboxDeleted?: true

  noInvites?: InvitesSkipped
}

export type InvitesSkipped =
  | 'forbidden'
  | 'conflict'
  | 'suspended'
  | 'noSuccessor'

export type ReconnectNotSent = 'sealed' | 'failed' | 'noRoom'

export type BuddiesKeyChangeOutcome =
  | { done: true }
  | { done: false; retryAt: number }

export type BuddiesKeyChangeInput = {
  oldKey: Uint8Array

  newKey: Uint8Array
  accountId: string
}

export type BuddiesKeyChangeDeps = {
  relay: RelayClient
  engine: Pick<
    BuddiesEngine,
    | 'createReconnectInvite'
    | 'cancelInvite'
    | 'startNewInbox'
    | 'retireInbox'
    | 'knownPairings'
    | 'keepCardName'
  >

  progress: {
    read: () => Promise<string | null>
    write: (value: string) => Promise<void>
    remove: () => Promise<void>
  }
  randomBytes: (length: number) => Uint8Array
  now: () => number

  onReconnectSent?: () => void

  onInvitesSkipped?: (reason: InvitesSkipped) => void

  onReconnectNotSent?: (reason: ReconnectNotSent) => void
}

export function reconnectEventId(
  oldInboxId: string,
  buddyInboxId: string,
  inviteId: string
) {
  return toB64u(
    sha256(
      utf8(
        `ww-buddies/v1/event|reconnect|${oldInboxId}|${buddyInboxId}|${inviteId}`
      )
    ).slice(0, 16)
  )
}

const missing = (error: unknown) =>
  isRelayError(error, 'gone') || isRelayError(error, 'not_found')

function parseProgress(json: string | null): BuddiesKeyChangeProgress | null {
  if (!json) return null
  try {
    const value = JSON.parse(json) as BuddiesKeyChangeProgress
    return value?.v === 1 && Array.isArray(value.former) ? value : null
  } catch {
    return null
  }
}

export function createBuddiesKeyChange(deps: BuddiesKeyChangeDeps) {
  const { relay, engine } = deps

  let running: Promise<unknown> = Promise.resolve()
  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const next = running.then(work, work)
    running = next.catch(() => undefined)
    return next
  }

  function oldOwner(old: BuddyIdentity): OwnerAuth {
    return {
      inboxId: old.inboxId,
      ownerSeed: old.ownerSeed,
      ownerPub: old.ownerPub,
      link: {
        sign: () => {
          throw new RelayError('not_linked', 409)
        },
      },
    }
  }

  function readRoster(old: BuddyIdentity, blob: string): Roster | null {
    try {
      return rosterSchema.parse(
        JSON.parse(fromUtf8(open(old.rosterKey, blob, aad.roster(old.inboxId))))
      )
    } catch {
      return null
    }
  }

  async function capture(old: BuddyIdentity) {
    const local = engine.knownPairings(old.inboxId)
    let hadInbox = local !== null
    let roster: Roster | null = null
    try {
      const response = await relay.syncInbox(oldOwner(old), 0)
      hadInbox = true
      roster = response.roster ? readRoster(old, response.roster.blob) : null
    } catch (error) {
      if (
        !missing(error) &&
        !isRelayError(error, 'not_linked') &&
        !isRelayError(error, 'forbidden')
      )
        throw error
    }
    type Pairing = Pick<
      Buddy,
      | 'inboxId'
      | 'dhPub'
      | 'inviteSecret'
      | 'name'
      | 'nickname'
      | 'color'
      | 'colorIndex'
      | 'overrides'
    > & { status: FormerBuddy['status'] }
    const found = new Map<string, Pairing>()
    for (const buddy of roster?.buddies ?? [])
      if (!pairingEnded(roster!.removedBuddies, buddy))
        found.set(buddy.inboxId, buddy)

    for (const buddy of local?.buddies ?? []) found.set(buddy.inboxId, buddy)
    for (const removal of local?.pendingRemovals ?? [])
      if (!found.has(removal.inboxId))
        found.set(removal.inboxId, {
          ...removal,
          name: '',
          status: 'ended',
          colorIndex: 0,
        })
    found.delete(old.inboxId)
    const former = [...found.values()].map((buddy): FormerBuddy => {
      const keys = deriveDirection(
        derivePairSecret(
          old.dhPrivate,
          fromB64u(buddy.dhPub),
          fromB64u(buddy.inviteSecret),
          old.inboxId,
          buddy.inboxId
        ),
        buddy.inboxId
      )
      return {
        inboxId: buddy.inboxId,
        dhPub: buddy.dhPub,
        name: buddy.name,
        status: buddy.status,
        colorIndex: buddy.colorIndex,
        ...(buddy.nickname ? { nickname: buddy.nickname } : {}),
        ...(buddy.color ? { color: buddy.color } : {}),
        ...(buddy.overrides ? { overrides: buddy.overrides } : {}),
        slotId: keys.slotId,
        writerSeed: toB64u(keys.writerSeed),
        contentKey: toB64u(keys.contentKey),

        secret: toB64u(deps.randomBytes(16)),
      }
    })

    const kept = local?.cardName ?? undefined
    const cardName = kept ? mergeCardName(kept, roster?.card) : roster?.card
    return { hadInbox, former, ...(cardName ? { cardName } : {}) }
  }

  const writerOf = (buddy: FormerBuddy): WriterAuth => ({
    inboxId: buddy.inboxId,
    slotId: buddy.slotId,
    writerSeed: fromB64u(buddy.writerSeed),
  })

  async function proceed(
    start: BuddiesKeyChangeProgress
  ): Promise<BuddiesKeyChangeOutcome> {
    let progress = start
    const save = async (next: BuddiesKeyChangeProgress) => {
      await deps.progress.write(JSON.stringify(next))
      progress = next
    }
    const update = (inboxId: string, change: Partial<FormerBuddy>) =>
      save({
        ...progress,
        former: progress.former.map((buddy) =>
          buddy.inboxId === inboxId ? { ...buddy, ...change } : buddy
        ),
      })
    const tooLate = (since: number) => deps.now() >= since + RECONNECT_WAIT_MS

    let failed = false

    const notSent = async (
      buddy: FormerBuddy,
      reason: ReconnectNotSent,
      change: Partial<FormerBuddy> = {}
    ) => {
      await engine
        .cancelInvite(deriveInvite(fromB64u(buddy.secret)).inviteId)
        .catch(() => undefined)
      await update(buddy.inboxId, { ...change, notSent: reason })
      deps.onReconnectNotSent?.(reason)
    }

    const invite = async (buddy: FormerBuddy) => {
      const invited = await engine.createReconnectInvite(
        fromB64u(buddy.secret),
        {
          inboxId: buddy.inboxId,
          dhPub: buddy.dhPub,
          name: buddy.nickname ?? buddy.name,
          colorIndex: buddy.colorIndex,
          ...(buddy.nickname ? { nickname: buddy.nickname } : {}),
          ...(buddy.color ? { color: buddy.color } : {}),
          ...(buddy.overrides ? { overrides: buddy.overrides } : {}),
        }
      )

      if (!invited.created) {
        await notSent(buddy, 'noRoom')
        return
      }
      const eventId = reconnectEventId(
        progress.oldInboxId,
        buddy.inboxId,
        deriveInvite(fromB64u(buddy.secret)).inviteId
      )
      const body: PairReconnect = {
        v: 1,
        inboxId: progress.newInboxId,
        secret: buddy.secret,
        expiresAt: invited.expiresAt,
      }
      try {
        await relay.putEvent(writerOf(buddy), {
          eventId,
          kind: RECONNECT_KIND,
          blob: seal(
            fromB64u(buddy.contentKey),
            utf8(JSON.stringify(body)),
            aad.event(buddy.inboxId, buddy.slotId, eventId),
            deps.randomBytes(12)
          ),
          push: true,
        })
      } catch (error) {
        if (isRelayError(error, 'sealed')) {
          await notSent(buddy, 'sealed', { sealedAt: deps.now() })
          return
        }
        if (!missing(error)) throw error

        await update(buddy.inboxId, { gone: true })
        return
      }
      await update(buddy.inboxId, { sentAt: deps.now() })
      deps.onReconnectSent?.()
    }

    for (const buddy of progress.former) {
      if (buddy.status !== 'active' || buddy.sentAt || buddy.gone) continue
      if (buddy.notSent || progress.noInvites || tooLate(progress.startedAt))
        continue
      try {
        await invite(buddy)
      } catch (error) {
        logger.warn('[buddies] key change: an invite failed', error)
        failed = true
        if (
          isRelayConnectivityError(error) ||
          isRelayError(error, 'cancelled') ||
          isRelayError(error, 'unverified')
        )
          continue

        const failures = (buddy.inviteFailures ?? 0) + 1
        if (failures >= MAX_INVITE_FAILURES) await notSent(buddy, 'failed')
        else await update(buddy.inboxId, { inviteFailures: failures })
      }
    }

    for (const buddy of progress.former) {
      if (buddy.gone || buddy.sealedAt !== undefined) continue
      if (buddy.leftAt !== undefined) continue
      if (buddy.sentAt === undefined && buddy.notSent === undefined) continue
      try {
        await relay.sealSlot(writerOf(buddy))
        await update(buddy.inboxId, { sealedAt: deps.now() })
      } catch (error) {
        if (isRelayError(error, 'sealed')) {
          await update(buddy.inboxId, { sealedAt: deps.now() })
        } else if (missing(error)) {
          await update(buddy.inboxId, { gone: true })
        } else {
          logger.warn('[buddies] key change: sealing failed', error)
          failed = true
        }
      }
    }

    const leaving = async (buddy: FormerBuddy) => {
      if (buddy.gone || buddy.status !== 'active') return true
      if (tooLate(buddy.sentAt ?? progress.startedAt)) return true
      if (buddy.sentAt === undefined)
        return progress.noInvites !== undefined || buddy.notSent !== undefined

      try {
        const invite = await relay.fetchInvite(
          deriveInvite(fromB64u(buddy.secret)).inviteId
        )
        return invite.status === 'claimed'
      } catch (error) {
        return isRelayError(error, 'not_found')
      }
    }
    for (const buddy of progress.former) {
      try {
        if (buddy.leftAt !== undefined || !(await leaving(buddy))) continue
        if (!buddy.gone)
          await relay.leaveSlot(writerOf(buddy)).catch((error) => {
            if (!missing(error)) throw error
          })
        await update(buddy.inboxId, { leftAt: deps.now() })
      } catch (error) {
        logger.warn('[buddies] key change: leaving failed', error)
        failed = true
      }
    }

    const waiting = progress.former.filter(
      (buddy) => buddy.leftAt === undefined
    )
    if (waiting.length === 0) {
      await deps.progress.remove()
      return { done: true }
    }
    return {
      done: false,
      retryAt: Math.min(
        ...waiting.map(
          (buddy) => (buddy.sentAt ?? progress.startedAt) + RECONNECT_WAIT_MS
        ),
        ...(failed ? [deps.now() + RETRY_MS] : [])
      ),
    }
  }

  const leaveEveryone = (progress: BuddiesKeyChangeProgress) =>
    proceed({
      ...progress,
      startedAt: deps.now() - RECONNECT_WAIT_MS,
      former: progress.former.map((buddy) =>
        buddy.sentAt === undefined
          ? buddy
          : { ...buddy, sentAt: deps.now() - RECONNECT_WAIT_MS }
      ),
    })

  async function deleteOldInbox(
    old: BuddyIdentity,
    successor: string,
    linkNew: () => Promise<void>,
    startedAt: number
  ): Promise<InvitesSkipped | null> {
    const named = () => relay.deleteInbox(oldOwner(old), { successor })

    const unnamed = async (reason: InvitesSkipped) => {
      await relay.deleteInbox(oldOwner(old)).catch((error) => {
        if (
          !missing(error) &&
          !isRelayError(error, 'not_linked') &&
          !isRelayError(error, 'forbidden')
        )
          throw error
      })
      return reason
    }
    try {
      await named()
      return null
    } catch (error) {
      if (isRelayError(error, 'not_linked') || isRelayError(error, 'forbidden'))
        return 'forbidden'

      if (missing(error))
        return (await relay.inboxSuccessor(old.inboxId)) === successor
          ? null
          : 'noSuccessor'
      if (isRelayError(error, 'suspended')) {
        if (deps.now() < startedAt + SUSPENDED_WAIT_MS) throw error
        return unnamed('suspended')
      }
      if (!isRelayError(error, 'conflict')) throw error
    }
    try {
      await linkNew()
      await named()
      return null
    } catch (error) {
      if (isRelayConnectivityError(error)) throw error
      logger.warn('[buddies] key change: no successor recorded', error)
      return unnamed('conflict')
    }
  }

  function reset({
    oldKey,
    newKey,
    accountId,
  }: BuddiesKeyChangeInput): Promise<BuddiesKeyChangeOutcome> {
    return serially(async () => {
      const old = deriveIdentity(oldKey)
      const next = deriveIdentity(newKey)

      engine.retireInbox(old.inboxId)

      let progress = parseProgress(await deps.progress.read())

      if (progress && progress.oldInboxId !== old.inboxId) {
        await leaveEveryone(progress)
        progress = null
      }
      if (!progress) {
        progress = {
          v: 1,
          oldInboxId: old.inboxId,
          newInboxId: next.inboxId,
          startedAt: deps.now(),
          ...(await capture(old)),
        }
        await deps.progress.write(JSON.stringify(progress))
      }
      if (!progress.hadInbox) {
        await deps.progress.remove()
        return { done: true }
      }

      const linkNew = async () => {
        const linked = await relay.registerInbox({
          inboxId: next.inboxId,
          ownerSeed: next.ownerSeed,
          ownerPub: next.ownerPub,
          link: {
            sign: (sessionAccountId) =>
              signInboxLink(
                deriveAccountSigningKey(newKey),
                sessionAccountId,
                next.inboxId,
                next.ownerPub
              ),
          },
        })
        if (linked.accountId !== accountId)
          throw new Error('Buddies: the new inbox is not on this account')
      }
      if (!progress.newInboxLinked) {
        await linkNew()
        await engine.startNewInbox(next.inboxId)
        progress = { ...progress, newInboxLinked: true }
        await deps.progress.write(JSON.stringify(progress))
      }

      engine.keepCardName(progress.cardName)

      if (!progress.oldInboxDeleted) {
        const skipped = await deleteOldInbox(
          old,
          next.inboxId,
          linkNew,
          progress.startedAt
        )
        progress = {
          ...progress,
          oldInboxDeleted: true,
          ...(skipped ? { noInvites: skipped } : {}),
        }
        await deps.progress.write(JSON.stringify(progress))
        if (skipped) deps.onInvitesSkipped?.(skipped)
      }
      return proceed(progress)
    })
  }

  function carryOn(): Promise<BuddiesKeyChangeOutcome> {
    return serially(async () => {
      const progress = parseProgress(await deps.progress.read())
      if (!progress?.oldInboxDeleted) return { done: true }

      engine.keepCardName(progress.cardName)
      return proceed(progress)
    })
  }

  async function prepare({
    oldKey,
    accountId,
  }: {
    oldKey: Uint8Array
    accountId: string
  }): Promise<'linked' | 'none' | 'otherAccount'> {
    const old = deriveIdentity(oldKey)
    try {
      await relay.syncInbox(
        {
          inboxId: old.inboxId,
          ownerSeed: old.ownerSeed,
          ownerPub: old.ownerPub,
          link: {
            sign: (sessionAccountId) => {
              if (sessionAccountId !== accountId)
                throw new RelayError('forbidden', 403)
              return signInboxLink(
                deriveAccountSigningKey(oldKey),
                sessionAccountId,
                old.inboxId,
                old.ownerPub
              )
            },
          },
        },
        0
      )
      return 'linked'
    } catch (error) {
      if (missing(error)) return 'none'
      if (isRelayError(error, 'forbidden') || isRelayError(error, 'conflict'))
        return 'otherAccount'
      throw error
    }
  }

  function leaveNow(): Promise<void> {
    return serially(async () => {
      const progress = parseProgress(await deps.progress.read())
      if (progress?.oldInboxDeleted) await leaveEveryone(progress)
    })
  }

  async function capturedFor(oldKey: Uint8Array): Promise<boolean> {
    const progress = parseProgress(await deps.progress.read())
    return progress?.oldInboxId === deriveIdentity(oldKey).inboxId
  }

  return { prepare, reset, carryOn, leaveNow, capturedFor }
}
