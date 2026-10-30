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
  pairingEnded,
} from '@/features/buddies/lib/state'
import { logger } from '@/lib/logger'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'

/**
 * Step 6 of changing the account key (docs/account-key-change.md, ADR 0039 §5):
 * Buddies moves to a new inbox from the new key, on the same account, and every
 * buddy gets an invite to it through the pairing the old key made. The old key
 * could still write to buddies as the User, so each pairing is left, and the
 * old inbox deleted, naming the new one as its successor: the relay records
 * that only for the account's current key, and buddies accept an invite only to
 * the inbox it names.
 *
 * Leaving deletes what this User wrote into a buddy's inbox, the invite too, so
 * a buddy is left once their claim lands, or `RECONNECT_WAIT_MS` after the
 * invite went if it doesn't. The step (`reset`) resolves once the invites that
 * fit are out and the old inbox is deleted; what's left (invites waiting for
 * room, and leaving) goes on after Buddies syncs (`carryOn`), with each old
 * pairing's own keys, so the old account key can go. What's done is saved as
 * it's done, so a step cut short goes on where it stopped.
 */

/** A buddy who hasn't reconnected by then is left without them. */
export const RECONNECT_WAIT_MS = 24 * 60 * 60 * 1000

/**
 * While the account is suspended the relay records no successor; after this
 * long the old inbox goes without one, and no one is invited.
 */
export const SUSPENDED_WAIT_MS = 7 * 24 * 60 * 60 * 1000

/** An invite or a leave that failed for now is tried again this soon. */
const RETRY_MS = 5 * 60 * 1000

/**
 * A buddy's invite the relay refused this many times (being offline doesn't
 * count) is given up on, and their slot sealed anyway.
 */
export const MAX_INVITE_FAILURES = 3

/** A pairing of the old inbox's, and where its reset stands. */
export type FormerBuddy = {
  inboxId: string
  dhPub: string
  name: string
  /** `ended`: a removal the old inbox still owed; it's only left. */
  status: Buddy['status'] | 'ended'
  nickname?: string
  color?: string
  colorIndex: number
  overrides?: BuddyOverrides
  /** The old pairing's slot in their inbox, and its writer and content keys. */
  slotId: string
  writerSeed: string
  contentKey: string
  /** The new inbox's invite for them (base64url), made before anything goes. */
  secret: string
  /** When the invite reached their inbox. */
  sentAt?: number
  /**
   * When this User's old slot in their inbox was sealed (`slot/seal`), right
   * after the invite: the old key writes nothing more there.
   */
  sealedAt?: number
  /** They get no invite, and why. */
  notSent?: ReconnectNotSent
  /** How often the relay refused their invite so far. */
  inviteFailures?: number
  /** Their inbox, or this User's slot in it, is gone: nothing to send or leave. */
  gone?: true
  /** When this User's old slot left their inbox. */
  leftAt?: number
}

/**
 * Kept in this device's secret storage (it holds the old pairings' writer keys)
 * from the step's start until every pairing is left.
 */
export type BuddiesKeyChangeProgress = {
  v: 1
  oldInboxId: string
  newInboxId: string
  startedAt: number
  /** Buddies was in use with the old key. Without it there's nothing to do. */
  hadInbox: boolean
  former: FormerBuddy[]
  newInboxLinked?: true
  oldInboxDeleted?: true
  /**
   * The old inbox went without naming the new one as its successor: buddies
   * couldn't check an invite, so none is sent, and every pairing is left at
   * once. Why: see `InvitesSkipped`.
   */
  noInvites?: InvitesSkipped
}

/**
 * Why a key change sends no reconnect invites, as the relay answered naming the
 * successor: the old inbox isn't this account's, never linked or another
 * account's (`forbidden`); it kept refusing the new inbox (`conflict`); the
 * account stayed suspended for `SUSPENDED_WAIT_MS` (`suspended`); or the old
 * inbox was gone without naming the new one (`noSuccessor`).
 */
export type InvitesSkipped =
  | 'forbidden'
  | 'conflict'
  | 'suspended'
  | 'noSuccessor'

/**
 * Why one buddy gets no reconnect invite: this User's old slot in their inbox
 * was already sealed, by whoever else holds the old key (`sealed`); the relay
 * refused the invite `MAX_INVITE_FAILURES` times (`failed`); or the new inbox
 * had no room for it (`noRoom`, which a new inbox shouldn't). Their slot is
 * sealed, then left at once.
 */
export type ReconnectNotSent = 'sealed' | 'failed' | 'noRoom'

/**
 * `done: false` while buddies may still reconnect: `carryOn` again by
 * `retryAt`, or sooner when one does.
 */
export type BuddiesKeyChangeOutcome =
  | { done: true }
  | { done: false; retryAt: number }

export type BuddiesKeyChangeInput = {
  /** K1: the account key before the change. */
  oldKey: Uint8Array
  /** K2: the account key now, already this device's. */
  newKey: Uint8Array
  accountId: string
}

export type BuddiesKeyChangeDeps = {
  /** The relay client, with this device's account session. */
  relay: RelayClient
  engine: Pick<
    BuddiesEngine,
    | 'createReconnectInvite'
    | 'cancelInvite'
    | 'startNewInbox'
    | 'retireInbox'
    | 'knownPairings'
  >
  /** Where `BuddiesKeyChangeProgress` is kept, as JSON. */
  progress: {
    read: () => Promise<string | null>
    write: (value: string) => Promise<void>
    remove: () => Promise<void>
  }
  randomBytes: (length: number) => Uint8Array
  now: () => number
  /** A buddy's invite reached them. For analytics only. */
  onReconnectSent?: () => void
  /** This change sends no invites, and why. For analytics only. */
  onInvitesSkipped?: (reason: InvitesSkipped) => void
  /** One buddy gets no invite, and why. For analytics only. */
  onReconnectNotSent?: (reason: ReconnectNotSent) => void
}

/** The relay event id of a reconnect invite, the same on every retry. */
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
  /** One run at a time: the step and the syncs after it share the progress. */
  let running: Promise<unknown> = Promise.resolve()
  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const next = running.then(work, work)
    running = next.catch(() => undefined)
    return next
  }

  /**
   * The old inbox's owner. It's never linked again: the account's key isn't K1
   * any more, so a `not_linked` inbox can't be reached.
   */
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

  /**
   * The old inbox's pairings, with the keys to write into and leave each: from
   * this device's data while it's still the old inbox's, and from the roster on
   * the relay, which a sync with the new key may already have left behind
   * here.
   */
  async function capture(old: BuddyIdentity) {
    const local = engine.knownPairings(old.inboxId)
    let hadInbox = local !== null
    let roster: Roster | null = null
    try {
      const response = await relay.syncInbox(oldOwner(old), 0)
      hadInbox = true
      roster = response.roster ? readRoster(old, response.roster.blob) : null
    } catch (error) {
      // Gone, or never linked or another account's (no reconnect invites
      // then, see `reset`): this device's own data is all there is.
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
    // This device's own copy is at least as current.
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
        // Made now, so a retry sends the same invite.
        secret: toB64u(deps.randomBytes(16)),
      }
    })
    return { hadInbox, former }
  }

  const writerOf = (buddy: FormerBuddy): WriterAuth => ({
    inboxId: buddy.inboxId,
    slotId: buddy.slotId,
    writerSeed: fromB64u(buddy.writerSeed),
  })

  /**
   * Invites every buddy, sealing each slot right after its invite, then leaves
   * those who reconnected or waited long enough. Needs no account key: only
   * each pairing's own keys, and the new inbox, which Buddies now runs.
   */
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
    /** One buddy's invite, seal, or leave failed for now: tried again soon. */
    let failed = false

    /** `buddy` gets no invite: the one made for them stops holding room. */
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

    /** Sends `buddy` their invite. */
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
      // The new inbox has room for every buddy (5 open invites, no slots
      // yet); should the relay refuse anyway, nothing waits on it.
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
        // Sealed already, by whoever else holds the old key: nothing more can
        // be written there, an invite included.
        if (isRelayError(error, 'sealed')) {
          await notSent(buddy, 'sealed', { sealedAt: deps.now() })
          return
        }
        if (!missing(error)) throw error
        // They left, or their inbox is gone.
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
        // The others still go, and everyone due is still left.
        logger.warn('[buddies] key change: an invite failed', error)
        failed = true
        if (
          isRelayConnectivityError(error) ||
          isRelayError(error, 'cancelled') ||
          isRelayError(error, 'unverified')
        )
          continue
        // The relay keeps refusing it: their slot is sealed without one.
        const failures = (buddy.inviteFailures ?? 0) + 1
        if (failures >= MAX_INVITE_FAILURES) await notSent(buddy, 'failed')
        else await update(buddy.inboxId, { inviteFailures: failures })
      }
    }

    // Right after each invite, the old key's writes there end.
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
      // Claimed, or already confirmed and deleted.
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

  /** Leaves every pairing `progress` still holds now, inviting no one more. */
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

  /**
   * Deletes the old inbox, naming the new one as its successor. Null when the
   * relay recorded it; otherwise why no one can be invited. It always ends:
   * `conflict` links the new inbox again and tries once more, then deletes the
   * old inbox without a successor; `suspended` waits (throws, for the next
   * launch) up to `SUSPENDED_WAIT_MS`, then does the same. Anything else that
   * may pass (offline, a `500`) throws, to try again.
   */
  async function deleteOldInbox(
    old: BuddyIdentity,
    successor: string,
    linkNew: () => Promise<void>,
    startedAt: number
  ): Promise<InvitesSkipped | null> {
    const named = () => relay.deleteInbox(oldOwner(old), { successor })
    /** Without a successor: buddies get no invite, but the old key's inbox goes. */
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
      // Never linked (`prepare` links one from before accounts), or another
      // account's: not this account's to delete, and the relay wipes it when
      // it goes quiet.
      if (isRelayError(error, 'not_linked') || isRelayError(error, 'forbidden'))
        return 'forbidden'
      // Gone: wiped, or deleted by a try whose answer was lost.
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

  /**
   * The step itself: idempotent, and resumes from what's saved. Resolves once
   * the old inbox is deleted; buddies yet to reconnect are left later, by
   * `carryOn`. Throws to be run again (next launch, or Try Again).
   */
  function reset({
    oldKey,
    newKey,
    accountId,
  }: BuddiesKeyChangeInput): Promise<BuddiesKeyChangeOutcome> {
    return serially(async () => {
      const old = deriveIdentity(oldKey)
      const next = deriveIdentity(newKey)
      // Nothing else on this device acts for the old inbox again.
      engine.retireInbox(old.inboxId)

      let progress = parseProgress(await deps.progress.read())
      // An earlier change still leaving buddies: this one's old key is that
      // one's new key, so those pairings go now.
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

      /** The new inbox, linked to the same account under the new key. */
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

      // Nothing needs the old inbox now: its owner key and roster go first,
      // so a stolen old key can't read or restore it while buddies reconnect.
      // The relay keeps the new inbox as its successor, which is how a buddy
      // knows an invite to it came from this change.
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

  /**
   * Goes on with a reset the step began: invites and seals that failed for now,
   * and leaving buddies who reconnected or waited long enough. Run after
   * Buddies syncs. Nothing to do resolves done.
   */
  function carryOn(): Promise<BuddiesKeyChangeOutcome> {
    return serially(async () => {
      const progress = parseProgress(await deps.progress.read())
      if (!progress?.oldInboxDeleted) return { done: true }
      return proceed(progress)
    })
  }

  /**
   * Step 0 of the key change, while `oldKey` is still the account's: makes sure
   * the old inbox is linked to this account, linking one from before accounts.
   * Otherwise someone else with the old key could link it to their account and
   * name their own inbox as its successor. `otherAccount`: it's someone else's
   * already, so the change invites no one. Throws for anything but a definite
   * answer (offline, a `500`, `rate_limited`, `disabled`), so the change waits
   * to start.
   */
  async function prepare({
    oldKey,
    accountId,
  }: {
    oldKey: Uint8Array
    accountId: string
  }): Promise<'linked' | 'none' | 'otherAccount'> {
    const old = deriveIdentity(oldKey)
    try {
      // Any owner op links an inbox the relay says isn't (`not_linked`).
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

  /**
   * Delete Buddies: leaves every pairing a reset still holds at once, instead
   * of waiting for buddies to reconnect to an inbox that's going too.
   */
  function leaveNow(): Promise<void> {
    return serially(async () => {
      const progress = parseProgress(await deps.progress.read())
      if (progress?.oldInboxDeleted) await leaveEveryone(progress)
    })
  }

  /**
   * Whether the reset of the change from `oldKey` saved its pairings, so
   * Buddies may let go of the old inbox's data here.
   */
  async function capturedFor(oldKey: Uint8Array): Promise<boolean> {
    const progress = parseProgress(await deps.progress.read())
    return progress?.oldInboxId === deriveIdentity(oldKey).inboxId
  }

  return { prepare, reset, carryOn, leaveNow, capturedFor }
}
