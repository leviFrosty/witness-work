import { perf } from '@/lib/perf'
import moment from 'moment'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { open, seal, sha256 } from '@/features/buddies/lib/crypto'
import {
  aad,
  BuddyIdentity,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
  DirectionKeys,
} from '@/features/buddies/lib/keys'
import {
  buildInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import {
  isRelayConnectivityError,
  isRelayError,
  OwnerAuth,
  PushAddress,
  PushTemplate,
  RelayCallOptions,
  RelayClient,
  RelayError,
  RelaySyncResponse,
  WriterAuth,
} from '@/features/buddies/lib/relay'
import {
  BadgeReactionEmoji,
  isBadgeReactionEmoji,
} from '@/features/buddies/lib/badgeReactions'
import {
  badgeNewSchema,
  badgeReactionSchema,
  BuddyAvatar,
  BuddyCardDay,
  BuddyPlatform,
  buddyCardSchema,
  BuddyStreak,
  type BuddyPet,
  joinRequestSchema,
  MAX_SHARED_PHOTOS,
  pairConfirmedSchema,
  PairingCard,
  pairingCardSchema,
  type ProfilePhoto,
  Roster,
  rosterSchema,
  ShareCancel,
  shareCancelSchema,
  ShareInvite,
  shareInviteSchema,
  ShareReply,
  shareReplySchema,
  ShareType,
  type SharedPhoto,
} from '@/features/buddies/lib/schemas'
import {
  type BuddiesPushMarker,
  type BuddyAlertContext,
  type BuddyAlertOutcome,
  describeBuddyEvent,
  type SealedEvent,
  shareWhen,
} from '@/features/buddies/lib/pushAlerts'
import {
  BUDDY_CARD_HORIZON_DAYS,
  buildBuddyCardDays,
  withPlanTimes,
} from '@/features/buddies/lib/card'
import {
  holdsBadge,
  knownBadges,
  sharedBadgeKey,
  sortedForAnnouncement,
  withNewBadges,
} from '@/features/buddies/lib/sharedBadges'
import {
  ADOPTED_SHARE_HASH,
  type AnswerMark,
  answerApplies,
  awaitsAnswer,
  BADGE_ALERT_INTERVAL_MS,
  BADGE_ANNOUNCEMENT_TTL_MS,
  BadgeAnnouncement,
  Buddy,
  type BuddyAlertKey,
  buddyAlertSettings,
  BuddyProfile,
  type BuddySettingKey,
  type BuddySettings,
  buddySettings,
  BuddySharing,
  BuddiesState,
  type CardName,
  BuddyNotification,
  cappedQueue,
  IncomingShare,
  incomingJoinRequestKey,
  JOIN_REQUEST_ALERTS_PER_DAY,
  JOIN_REQUEST_LEAD_MS,
  MAX_OPEN_JOIN_REQUESTS,
  type OutgoingInvite,
  OutgoingJoinRequest,
  OutgoingShare,
  incomingShareKey,
  initialBuddiesState,
  INVITE_TTL_MS,
  MAX_BUDDIES,
  mergeAnswerMarks,
  mergeCardName,
  mergeNotificationMarks,
  mergeRemovedBuddies,
  mergeSharing,
  isSharingPaused,
  rosterOverrides,
  withOverride,
  NOTIFICATION_MARK_TTL_MS,
  withoutExpired,
  withPendingInvitesQueued,
  occupiedBuddySpots,
  OutgoingShareSpec,
  pairingEnded,
  PendingRemoval,
  SentBadgeReaction,
  type UnsentShare,
  type UnsentShareReason,
  type UploadedProfilePhoto,
  type UploadedSharedPhoto,
} from '@/features/buddies/lib/state'
import {
  LEGACY_SHARE_RETENTION_MS,
  shareEventExpiry,
} from '@/features/buddies/lib/shares'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'
import { ANNOUNCE_ORDER, parseBadgeKey } from '@/lib/badges/catalog'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import type { RecurringPlan } from '@/lib/recurrence'
import {
  type BadgeKey,
  ONE_TIME_BADGE_IDS,
  type SharedBadge,
} from '@/types/badges'
import type { DayPlan } from '@/types/timeEntry'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import type { RichTextImageAttrs } from '@/types/richText'
import { mapRichTextImages, richTextImages } from '@/lib/richText/inspect'
import {
  encodeSharedNoteDoc,
  localSharedPhotoId,
  openSharedPhoto,
  PROFILE_PHOTO_AAD,
  SHARED_PHOTO_MAX_LIFETIME_MS,
  SHARED_PHOTO_REFRESH_MS,
  sealSharedPhoto,
  sharedPhotoCovers,
  sharedPhotoExpiry,
} from '@/features/buddies/lib/sharedNotes'

/**
 * Buddies client orchestration: pairing, sync, Buddy Card publishing, and
 * teardown, against the relay contract in docs/buddies-protocol.md. Every
 * dependency is injected so two engines can pair through an in-memory relay in
 * tests.
 */

type Store = {
  getState: () => BuddiesState
  setState: (
    partial:
      | Partial<BuddiesState>
      | ((state: BuddiesState) => Partial<BuddiesState>)
  ) => void
}

export type BuddiesEngineDeps = {
  relay: RelayClient
  store: Store
  randomBytes: (length: number) => Uint8Array
  now: () => number
  /**
   * The root seed (iCloud Keychain on iOS, Block Store on Android), created on
   * first use. Read off the JS thread: on Android a first read can wait on
   * Block Store for seconds.
   */
  getRootSeed: () => Promise<Uint8Array>
  deleteRootSeed: () => Promise<void>
  /**
   * The User's server account (ADR 0024), whose key is the root seed. Every
   * relay call carries its session (the relay client's `authorize`), and
   * `inbox/register` its claim on the inbox, so the relay knows which account
   * owns the inbox and can suspend it.
   */
  account?: {
    /**
     * The relay doesn't know the session's account (the server's accounts were
     * reset, say): forget the session, so the next call opens a new one, which
     * creates the account again.
     */
    forget: () => void
  }
  getPlans: () => { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }
  /** Name, avatar, and Tenure as buddies should see them. */
  getProfile: () => BuddyProfile
  /**
   * The Service Streak, while it's long enough to show. Only Buddy Cards carry
   * it, never invites: a link can reach someone who isn't a buddy yet.
   */
  getStreak?: () => BuddyStreak | undefined
  /**
   * The User's Pet Companion as buddies see it, or none. Only Buddy Cards carry
   * it, and only while `sharing.pet` is on.
   */
  getPet?: () => BuddyPet | undefined
  /** The Plans and Follow-ups this User has invited buddies to. */
  getShares?: () => OutgoingShareSpec[]
  /**
   * When a share that's left `getShares` stopped being one (by its spec key):
   * the Plan or Follow-up's deletion, or the change that took its buddies off.
   * The same on every device, so their cancels are one event and one alert.
   */
  withdrawnAt?: (key: string) => number | undefined
  /**
   * When the Plan or Follow-up behind a spec key ends, while the User still has
   * it, shared or not (undefined once it's deleted). One whose only invitees
   * are gone leaves `getShares`, but still says they never got it.
   */
  shareEndsAt?: (key: string) => number | undefined
  /** This device's platform, told to new buddies for pairing analytics. */
  platform?: BuddyPlatform
  /**
   * A pairing just completed: the inviter confirmed (`inviter`), or this User's
   * accepted invite was confirmed (`invitee`). For analytics only.
   */
  onPaired?: (pairing: BuddyPairing) => void
  /**
   * The User's master Badges switch (on when absent). Off, no badges are shared
   * or announced, buddies' badge news isn't listed, and reactions are neither
   * sent nor kept.
   */
  showBadges?: () => boolean
  /**
   * Buddies is shown here and running (on when absent). Off (the `buddies` flag
   * turned off, say), badge news is neither made nor sent.
   */
  isEnabled?: () => boolean
  /** Runs `run` after `ms`, e.g. to send what had to wait; skipped when absent. */
  later?: (run: () => void, ms: number) => void
  /**
   * One of this User's note photos as JPEG bytes to share (made smaller than
   * the original), or null when its file is gone. Without it, shared notes
   * carry no photos.
   */
  readSharedPhoto?: (
    image: RichTextImageAttrs
  ) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>
  /** Whether a buddy's shared photo is on this device already. */
  hasSharedPhoto?: (localId: string) => Promise<boolean>
  /** Keeps a buddy's shared photo (JPEG bytes) as a note photo. */
  saveSharedPhoto?: (localId: string, bytes: Uint8Array) => Promise<void>
  /** Buddies' shared photos were saved, so notes showing them can refresh. */
  onSharedPhotosSaved?: () => void
  /**
   * The Profile photo as JPEG bytes for buddies to open full size, or null when
   * there is none. Without it, Buddy Cards carry only the thumbnail.
   */
  readProfilePhoto?: () => Promise<Uint8Array | null>
  /**
   * Buddies' full-size Profile photos (by blob id) their cards still link; any
   * other copy this device downloaded can go.
   */
  keepBuddyPhotos?: (blobIds: string[]) => Promise<void>
  /** Takes back this device's system alerts for these inbox seqs. */
  dismissAlerts?: (seqs: number[]) => void
  /**
   * Invitations that couldn't be sent and won't be retried as they stand:
   * refused while the account is suspended, to a buddy whose inbox is gone, or
   * to one whose pairing ended before they went (found by a send or a sync; not
   * when the User, or another of their devices, ended it). Their names, as this
   * User sees them, to tell them.
   */
  onSharesNotSent?: (notSent: {
    reason: UnsentShareReason
    names: string[]
  }) => void
}

/** See `sync`. */
export type BuddiesSyncOptions = RelayCallOptions & {
  /**
   * Satisfied once this device has read the inbox up to this seq (the live
   * signal's): a call that finds a sync running then needs no second one if
   * that sync got there.
   */
  minSeq?: number
  /**
   * The app asked, not the User (a return to the foreground, the live signal, a
   * poll). Skipped while the relay has asked to back off.
   */
  automatic?: boolean
}

/**
 * `skipped`: nothing ran (the relay asked to back off, or a sync already got
 * past `minSeq`), so it says nothing about whether Buddies can be reached.
 */
export type SyncOutcome = 'synced' | 'skipped'

/** Rate limited with no Retry-After: automatic syncs wait this long. */
const RATE_LIMIT_COOL_DOWN_MS = 60 * 1000
/**
 * The relay's kill switch is on: automatic syncs wait at least this long, so
 * the app checks back now and then instead of polling a switched-off service.
 */
export const DISABLED_COOL_DOWN_MS = 15 * 60 * 1000
/**
 * The account is suspended: automatic syncs wait this long. Shorter than the
 * kill switch's, so reinstatement shows within minutes of the next check.
 */
export const SUSPENDED_COOL_DOWN_MS = 60 * 1000
/** A removal that keeps failing is retried after this, doubling to an hour. */
const REMOVAL_RETRY_BASE_MS = 60 * 1000
const REMOVAL_RETRY_MAX_MS = 60 * 60 * 1000
/** Events read by recent syncs, kept so a push's alert needn't fetch again. */
const RECENT_EVENTS = 50

export type BuddyPairing = {
  role: 'inviter' | 'invitee'
  /** Absent when the buddy's build doesn't send it. */
  buddyPlatform?: BuddyPlatform
}

export type BuddyInviteErrorReason =
  | 'invalid'
  | 'unavailable'
  | 'own'
  | 'alreadyBuddies'
  | 'limit'
  /** The relay's cap on unclaimed invites (`MAX_OPEN_INVITES`). */
  | 'openInvites'
  | 'nameRequired'

export class BuddyInviteError extends Error {
  constructor(readonly reason: BuddyInviteErrorReason) {
    super(`Buddy invite: ${reason}`)
    this.name = 'BuddyInviteError'
  }
}

/**
 * A removal (or delete-everything) that couldn't reach the relay. The buddy is
 * already gone on this device and the withdrawal is retried on every sync, but
 * they may keep seeing this User's Plans until it completes.
 */
export class BuddyRemovalPendingError extends Error {
  constructor(readonly scope: 'buddy' | 'everything') {
    super(`Buddy removal pending: ${scope}`)
    this.name = 'BuddyRemovalPendingError'
  }
}

/** Push kinds the relay may send; devices register a localized template each. */
export const BUDDY_PUSH_KINDS = [
  'invite.claimed',
  'pair.confirmed',
  'plan.invite',
  'plan.update',
  'plan.cancel',
  'followup.invite',
  'followup.update',
  'followup.cancel',
  'share.reply',
] as const
export type BuddyPushKind = (typeof BUDDY_PUSH_KINDS)[number]

/**
 * A buddy's new badges, and a buddy's reaction to one of this User's badges.
 * Registered only on devices with badge alerts on, so they sit outside
 * `BUDDY_PUSH_KINDS`.
 */
export const BADGE_PUSH_KIND = 'badge.new'
export const BADGE_REACTION_PUSH_KIND = 'badge.reaction'
export type BadgePushKind =
  | typeof BADGE_PUSH_KIND
  | typeof BADGE_REACTION_PUSH_KIND

/**
 * `registered`: the relay got a new or changed registration. `refreshed`: an
 * unchanged one was re-sent because it was over a day old, which also repairs a
 * device the relay dropped. `unchanged`: nothing was sent.
 */
export type PushRegistrationOutcome = 'registered' | 'refreshed' | 'unchanged'

/**
 * An unchanged registration is re-sent this often, so a device the relay
 * evicted or dropped for a rejected token starts receiving pushes again.
 */
export const PUSH_REGISTRATION_REFRESH_MS = 24 * 60 * 60 * 1000

/** The relay's event cap (8 KB sealed) minus the seal's version, nonce, and tag. */
const MAX_EVENT_PLAINTEXT_BYTES = 8 * 1024 - 29

/**
 * Share events (invites, changes, cancels, replies) per buddy per rolling hour.
 * The relay allows 60 writes per slot per hour, cards included, so an edit
 * storm on a shared Plan waits instead of crowding out Buddy Cards.
 */
const SHARE_EVENTS_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Badge news waiting to go out; older news makes way. */
const MAX_BADGE_ANNOUNCEMENTS = 20
/**
 * The relay drops an alert that comes within 60 s of the sender's previous one
 * to that inbox, so a badge alert waits this long (with slack for latency)
 * after any alerting send to that buddy instead of being lost.
 */
const RELAY_ALERT_SPACING_MS = 65 * 1000
/** The relay keeps events 30 days; handled badge events are kept a bit longer. */
const SEEN_BADGE_EVENT_TTL_MS = 31 * DAY_MS

/** Marks wait this long for more before the roster is written. */
const ROSTER_SAVE_DELAY_MS = 2000

/**
 * A share `version` below this is a legacy record's backfilled stamp (1), not a
 * time, so it can't order sends.
 */
const MIN_SHARE_VERSION = Date.UTC(2020, 0, 1)

const SHARE_KIND_PREFIX: Record<ShareType, string> = {
  plan: 'plan',
  followUp: 'followup',
}

/**
 * A join request's kind ends in a tag for the pair (see `joinRequestKind`), so
 * a device can let one buddy's requests alert it and not another's.
 */
const JOIN_REQUEST_KIND_PREFIX = 'join.request.'
const JOIN_CANCEL_KIND = 'join.cancel'
/** Alert seqs kept per incoming share; older alerts have long been seen. */
const MAX_ALERT_SEQS = 10
export type JoinRequestPushKind = `${typeof JOIN_REQUEST_KIND_PREFIX}${string}`

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * The kind of a join request written into `slotId`. Both people derive it from
 * the pair's slot, which the relay already knows, so the tag tells the relay
 * nothing new.
 */
function joinRequestKind(slotId: string): JoinRequestPushKind {
  const tag = sha256(utf8(`ww-buddies/v1/join-kind|${slotId}`)).slice(0, 6)
  return `${JOIN_REQUEST_KIND_PREFIX}${toHex(tag)}`
}

function shareTypeOfKind(kind: string): ShareType | null {
  const prefix = kind.split('.')[0]
  if (prefix === 'plan') return 'plan'
  if (prefix === 'followup') return 'followUp'
  return null
}

type PairKeys = { incoming: DirectionKeys; outgoing: DirectionKeys }
/** The relay event behind a queue entry. */
type EventSource = { id: string; seq: number }
type PairParty = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

function unionBy<T>(local: T[], remote: T[], key: (item: T) => string) {
  const seen = new Set(local.map(key))
  return [...local, ...remote.filter((item) => !seen.has(key(item)))]
}

/**
 * What decides whether two rosters hold the same relationships, choices, and
 * marks.
 */
function rosterSignature(roster: Omit<Roster, 'v' | 'version'>) {
  const {
    photo,
    tenure,
    streak,
    updatedAt,
    badges,
    badgesUpdatedAt,
    pet,
    petUpdatedAt,
    plans,
    planTimes,
    pausedUntil,
    plansUpdatedAt,
    showOnCalendar,
    calendarUpdatedAt,
  } = roster.sharing
  return JSON.stringify([
    roster.buddies
      .map((b) => `${b.inboxId}:${b.status}:${b.prefsAt ?? 0}`)
      .sort(),
    roster.outgoingInvites.map((i) => i.inviteId).sort(),
    roster.incomingClaims.map((c) => c.inviteId).sort(),
    Object.keys(roster.closedInviteIds).sort(),
    Object.entries(roster.removedBuddies)
      .map(([inboxId, removedAt]) => `${inboxId}:${removedAt}`)
      .sort(),
    [photo, tenure, streak, updatedAt],
    // A roster without badges (an older app's) reads as the default, so it
    // differs only from a choice this device actually made, which is then
    // written back once for devices restoring from the roster.
    [badges ?? true, badgesUpdatedAt ?? 0],
    // The pet choice came later still, and reads the same way.
    [pet ?? true, petUpdatedAt ?? 0],
    // Plans, Plan times, the pause, and the calendar, the same way.
    [
      plans ?? true,
      planTimes ?? 'exact',
      pausedUntil ?? 0,
      plansUpdatedAt ?? 0,
    ],
    [showOnCalendar ?? true, calendarUpdatedAt ?? 0],
    Object.entries(roster.answers)
      .map(([key, { s, v, r }]) => `${key}:${s}:${v}:${r}`)
      .sort(),
    Object.keys(roster.read).sort(),
    Object.keys(roster.dismissed).sort(),
    // An older app's roster has none, so a device with one writes it back.
    roster.card ? [roster.card.name, roster.card.updatedAt] : null,
  ])
}

/** When and where a share is: a change to these alerts (see `sendShares`). */
function shareTiming(details: OutgoingShareSpec['details']) {
  const { d, s, m, location } = details
  return toB64u(sha256(utf8(JSON.stringify({ d, s, m, location }))))
}

/**
 * A share as another device sent it: its spec and the confirmed buddies it goes
 * to. Any change since, a buddy confirmed since included, is sent.
 */
function adoptionHash(
  spec: OutgoingShareSpec,
  isActive: (inboxId: string) => unknown
) {
  const { key, type, details, noteDoc, endsAt, expiresAt } = spec
  const recipients = spec.recipients.filter((id) => isActive(id)).sort()
  return toB64u(
    sha256(
      utf8(
        JSON.stringify({
          key,
          type,
          details,
          noteDoc,
          endsAt,
          expiresAt,
          recipients,
        })
      )
    )
  )
}

/**
 * Invites, claims, and events are too small for a photo, so they carry only an
 * emoji avatar; the thumbnail follows in the first Buddy Card.
 */
function compactAvatar(avatar: BuddyAvatar | undefined) {
  return avatar?.t === 'emoji' ? avatar : undefined
}

/**
 * Profile fields for payloads without room for a photo. Badges travel only in
 * Buddy Cards (and `badge.new`), never in invites, claims, or the roster.
 */
function compactProfile<
  T extends { avatar?: BuddyAvatar; badges?: SharedBadge[] },
>(value: T): T {
  const { badges, ...rest } = value
  return { ...rest, avatar: compactAvatar(value.avatar) } as T
}

function omitKey<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  )
}

/** `removedBuddies` with this buddy's current pairing recorded as ended. */
function endedPairing(
  state: BuddiesState,
  inboxId: string,
  removedAt?: number
) {
  const buddy = state.buddies.find((b) => b.inboxId === inboxId)
  if (!buddy) return state.removedBuddies
  return mergeRemovedBuddies(state.removedBuddies, {
    [inboxId]: Math.max(removedAt ?? buddy.pairedAt, buddy.pairedAt),
  })
}

/**
 * When a new pairing starts: after any removal this device knows of, so that
 * removal can't end it.
 */
function newPairedAt(state: BuddiesState, inboxId: string, now: number) {
  return Math.max(now, (state.removedBuddies[inboxId] ?? -1) + 1)
}

export function createBuddiesEngine(deps: BuddiesEngineDeps) {
  const { relay, store } = deps
  let cachedIdentity: { seed: string; identity: BuddyIdentity } | null = null
  /** The root seed each identity came from: the account key, for its claim. */
  const accountKeys = new WeakMap<BuddyIdentity, Uint8Array>()
  let identityLoad: Promise<BuddyIdentity> | null = null
  let registering: Promise<BuddyIdentity> | null = null
  /**
   * Identities whose inbox `deleteEverything` deleted. A sync already under way
   * with one finds its inbox gone, which isn't the relay's inactivity wipe: it
   * must not register it again. The same seed coming back later (a handoff, a
   * recovery key) derives a new identity, which may.
   */
  const deletedIdentities = new WeakSet<BuddyIdentity>()
  /**
   * Inboxes this device signed out of (`leaveThisDevice`) while their seed is
   * still here: nothing starts with one again until the seed is replaced.
   */
  const leftInboxes = new Set<string>()
  const pairCache = new Map<string, PairKeys>()
  let syncInFlight: Promise<SyncOutcome> | null = null
  /** The one sync queued behind the running one; see `sync`. */
  let followUp: {
    promise: Promise<SyncOutcome>
    minSeq: number
    automatic: boolean
  } | null = null
  /** Automatic syncs wait until then: the relay asked to back off. */
  let coolDownUntil = 0
  /** Removals that failed: how often in a row, and when to try again. */
  const removalRetries = new Map<string, { failures: number; at: number }>()
  /** Events recent syncs read, by seq, for `describePush`. */
  const recentEvents = new Map<number, SealedEvent>()
  /** Settles once the running sync has read the inbox (before it sends). */
  let inboxRead: Promise<void> | null = null
  /** Share events sent per buddy inboxId in the last hour. */
  const shareSends = new Map<string, number[]>()
  /** Slots added while a sync is in flight are missing from its response. */
  const slotsAddedDuringSync = new Set<string>()
  /** Join request deliveries run one after another. */
  let joinDelivery: Promise<void> = Promise.resolve()
  /** So do deliveries of badge news. */
  let badgeDelivery: Promise<void> = Promise.resolve()
  /** When badge news held back by the relay's alert spacing is retried. */
  let badgeRetryAt: number | null = null
  /**
   * When this device last sent each buddy an alerting event (any kind), for the
   * relay's alert spacing. Kept in memory: best effort.
   */
  const lastAlertSentAt = new Map<string, number>()

  const json = (value: unknown) => utf8(JSON.stringify(value))
  const nonce = () => deps.randomBytes(12)
  const newId = () => toB64u(deps.randomBytes(16))
  const decode = (bytes: Uint8Array): unknown => JSON.parse(fromUtf8(bytes))

  /**
   * This User's identity, from the root seed. The seed is read off the JS
   * thread, once at a time, then kept; `fresh` reads it again, since another
   * device's seed may have replaced it through iCloud Keychain.
   */
  function identity({ fresh = false } = {}): Promise<BuddyIdentity> {
    if (!fresh && cachedIdentity)
      return Promise.resolve(cachedIdentity.identity)
    identityLoad ??= (async () => {
      try {
        const seed = await deps.getRootSeed()
        const key = toB64u(seed)
        if (cachedIdentity?.seed !== key) {
          cachedIdentity = { seed: key, identity: deriveIdentity(seed) }
          accountKeys.set(cachedIdentity.identity, seed)
          pairCache.clear()
        }
        if (leftInboxes.has(cachedIdentity.identity.inboxId))
          throw new RelayError('cancelled', 0)
        return cachedIdentity.identity
      } finally {
        identityLoad = null
      }
    })()
    return identityLoad
  }

  /**
   * The account key was replaced (after `deleteEverything` when there was
   * anything to leave): forget everything derived from the old seed, so the
   * next call derives the new identity and links its inbox again.
   */
  function dropIdentity() {
    cachedIdentity = null
    pairCache.clear()
    leftInboxes.clear()
  }

  /** The inbox id, without waiting on the seed: render paths read this. */
  function knownInboxId(): string | null {
    return (
      cachedIdentity?.identity.inboxId ?? store.getState().registeredInboxId
    )
  }

  const cancelled = (call?: RelayCallOptions) => {
    if (call?.signal?.aborted) throw new RelayError('cancelled', 0)
  }

  function ownerAuth(me: BuddyIdentity): OwnerAuth {
    return {
      inboxId: me.inboxId,
      ownerSeed: me.ownerSeed,
      ownerPub: me.ownerPub,
      link: {
        sign: (accountId) => {
          const accountKey = accountKeys.get(me)
          if (!accountKey) throw new Error('Buddies identity without its seed')
          return signInboxLink(
            deriveAccountSigningKey(accountKey),
            accountId,
            me.inboxId,
            me.ownerPub
          )
        },
        linked: () => {
          if (store.getState().accountLinkedInboxId !== me.inboxId)
            store.setState({ accountLinkedInboxId: me.inboxId })
        },
      },
    }
  }

  function writerAuth(buddyInboxId: string, keys: DirectionKeys): WriterAuth {
    return {
      inboxId: buddyInboxId,
      slotId: keys.slotId,
      writerSeed: keys.writerSeed,
    }
  }

  function pairKeys(me: BuddyIdentity, party: PairParty): PairKeys {
    const cacheKey = `${me.inboxId}|${party.inboxId}|${party.dhPub}|${party.inviteSecret}`
    const cached = pairCache.get(cacheKey)
    if (cached) return cached
    const pairSecret = derivePairSecret(
      me.dhPrivate,
      fromB64u(party.dhPub),
      fromB64u(party.inviteSecret),
      me.inboxId,
      party.inboxId
    )
    const keys = {
      incoming: deriveDirection(pairSecret, me.inboxId),
      outgoing: deriveDirection(pairSecret, party.inboxId),
    }
    pairCache.set(cacheKey, keys)
    return keys
  }

  /**
   * The name every device of this User puts on their Buddy Card (see
   * `cardName`): the roster's, else this device's Profile name, which this
   * device has run Buddies longest stands for.
   */
  function cardName(): CardName {
    const { cardName: known, startedAt } = store.getState()
    return (
      known ?? {
        name: deps.getProfile().name.trim(),
        // Earlier starts rank higher; any change the User makes ranks above.
        updatedAt: -(startedAt ?? 0),
      }
    )
  }

  /**
   * The card name a roster brings: another device's newer one, or the account's
   * for a device joining it. While none is kept here and the roster has this
   * device's own Profile name, none is kept still, so a change to the Profile
   * name goes on reaching buddies however it's made.
   */
  function adoptCardName(state: BuddiesState, remote: CardName | undefined) {
    if (!remote) return state.cardName
    const local = cardName()
    if (mergeCardName(local, remote) !== remote) return state.cardName
    return state.cardName === null && remote.name === local.name ? null : remote
  }

  /**
   * The User changed their Profile name on this device: buddies see it on every
   * device's card from now on, once the roster reaches them.
   */
  function setCardName(name: string) {
    store.setState({ cardName: { name: name.trim(), updatedAt: deps.now() } })
    saveRosterSoon()
  }

  /**
   * The Profile minus what All Buddies don't see: for pairing, before anyone
   * has settings of their own. Buddy Cards follow each buddy's
   * (`sendCardsTo`).
   */
  function profile(): BuddyProfile {
    const current = deps.getProfile()
    const { sharing } = store.getState()
    return {
      name: cardName().name,
      avatar: sharing.photo ? current.avatar : undefined,
      tenure: sharing.tenure ? current.tenure : undefined,
      badges: sharesBadges() ? (current.badges ?? []) : [],
      ...(sharing.photo && current.photoUnavailable
        ? { photoUnavailable: true }
        : {}),
    }
  }

  /** What this buddy sees: their own settings over All Buddies'. */
  function settingsFor(buddy: Pick<Buddy, 'overrides'>): BuddySettings {
    return buddySettings(store.getState().sharing, buddy).settings
  }

  /**
   * Plans, streak, badges, and the pet are paused for everyone, whatever the
   * buddy's settings.
   */
  function sharingPaused(): boolean {
    return isSharingPaused(store.getState().sharing, deps.now())
  }

  /** News of new badges goes to this buddy, unless sharing is paused. */
  function badgesGoTo(buddy: Pick<Buddy, 'overrides'>): boolean {
    return (deps.showBadges?.() ?? true) && settingsFor(buddy).badges
  }

  /** This buddy's alerts on this device. */
  function alertsFor(inboxId: string) {
    return buddyAlertSettings(store.getState(), inboxId).settings
  }

  /** Badges are on, and shared with buddies. */
  function sharesBadges(): boolean {
    return (
      (deps.showBadges?.() ?? true) && store.getState().sharing.badges !== false
    )
  }

  function displayName(): string {
    return profile().name
  }

  function pairingCard(me: BuddyIdentity): PairingCard {
    return {
      v: 1,
      ...compactProfile(profile()),
      dhPub: me.dhPub,
      inboxId: me.inboxId,
      offer: { plans: 'daysTimes' },
      ...(deps.platform ? { platform: deps.platform } : {}),
    }
  }

  function nextColorIndex(
    used = new Set(store.getState().buddies.map((b) => b.colorIndex))
  ): number {
    for (let index = 0; index < MAX_BUDDIES; index++) {
      if (!used.has(index)) return index
    }
    return 0
  }

  /**
   * `inbox/register`, linking the inbox to the session's account. If the relay
   * doesn't know that account, a new session (which creates it) tries once
   * more.
   */
  async function registerInbox(me: BuddyIdentity, call?: RelayCallOptions) {
    if (deletedIdentities.has(me)) throw new RelayError('cancelled', 0)
    try {
      await relay.registerInbox(ownerAuth(me), call)
    } catch (error) {
      if (!deps.account || !isRelayError(error, 'unknown_account')) throw error
      deps.account.forget()
      await relay.registerInbox(ownerAuth(me), call)
    }
  }

  /** Registers this User's inbox on first use; callers share one attempt. */
  async function ensureInbox(call?: RelayCallOptions): Promise<BuddyIdentity> {
    const me = await identity()
    if (store.getState().registeredInboxId === me.inboxId) return me
    registering ??= registerInbox(me, call)
      .then(() => {
        store.setState((state) => ({
          registeredInboxId: me.inboxId,
          syncSeq: 0,
          pushRegistrationKey: null,
          startedAt: state.startedAt ?? deps.now(),
        }))
        return me
      })
      .finally(() => {
        registering = null
      })
    return registering
  }

  /**
   * Stable per event, so a retry of a send whose answer was lost (or the same
   * send from another of this User's devices) is the same event, which the
   * relay stores and alerts once.
   */
  function eventIdFor(...parts: (string | number)[]): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/event|${parts.join('|')}`)).slice(0, 16)
    )
  }

  /**
   * Card, share and answer sends run one at a time, so two publishes can't send
   * the same event twice. Each kind is queued at most once behind the one
   * running, which picks up whatever changed meanwhile.
   */
  let outboxTail: Promise<void> = Promise.resolve()
  const outboxQueued = new Map<string, Promise<void>>()
  function outbox(kind: string, run: () => Promise<void>): Promise<void> {
    const waiting = outboxQueued.get(kind)
    if (waiting) return waiting
    const next = outboxTail.then(() => {
      outboxQueued.delete(kind)
      return run()
    })
    outboxQueued.set(kind, next)
    outboxTail = next.catch(() => {
      // The caller sees the failure; the queue moves on.
    })
    return next
  }

  async function addSlot(me: BuddyIdentity, keys: DirectionKeys) {
    await relay.addSlot(ownerAuth(me), keys.slotId, keys.writerPub)
    slotsAddedDuringSync.add(keys.slotId)
  }

  /** What this device's roster holds, lapsed marks left out. */
  function rosterContent(state: BuddiesState): Omit<Roster, 'v' | 'version'> {
    const now = deps.now()
    const marks = mergeNotificationMarks(
      state.notificationMarks,
      { read: {}, dismissed: {} },
      now
    )
    return {
      // Photos would overflow the roster cap; each device gets them, and
      // streaks and pets, from cards. `showOnCalendar` is for older apps, which read
      // and write that alone.
      buddies: state.buddies.map(({ streak, pet, overrides, ...buddy }) =>
        compactProfile({
          ...buddy,
          showOnCalendar: buddySettings(state.sharing, { overrides }).settings
            .showOnCalendar,
          overrides: overrides ?? {},
        })
      ),
      outgoingInvites: state.outgoingInvites,
      incomingClaims: state.incomingClaims.map(compactProfile),
      closedInviteIds: state.closedInviteIds,
      removedBuddies: state.removedBuddies,
      sharing: state.sharing,
      answers: mergeAnswerMarks(state.answerMarks, {}, now),
      read: marks.read,
      dismissed: marks.dismissed,
      ...(cardName().name ? { card: cardName() } : {}),
    }
  }

  /** Best effort: the next change or sync rewrites it. */
  async function saveRoster(me: BuddyIdentity) {
    const state = store.getState()
    const version = state.rosterVersion + 1
    const roster: Roster = { v: 1, version, ...rosterContent(state) }
    try {
      await relay.putRoster(
        ownerAuth(me),
        seal(me.rosterKey, json(roster), aad.roster(me.inboxId), nonce())
      )
      // Only a write the relay took counts; otherwise this device could
      // refuse another device's roster that is in fact newer.
      store.setState((current) => ({
        rosterVersion: Math.max(current.rosterVersion, version),
      }))
    } catch {
      // Offline or relay hiccup — the next sync that sees a different roster
      // on the relay writes the merged one back.
    }
  }

  let rosterSaveQueued = false
  /**
   * Writes the roster shortly, once for a burst of marks (the tray marks every
   * entry it shows as read), so this User's other devices catch up within
   * seconds. Without `later`, the next sync writes it.
   */
  function saveRosterSoon() {
    if (rosterSaveQueued || !deps.later) return
    if (store.getState().registeredInboxId === null) return
    rosterSaveQueued = true
    deps.later(() => {
      rosterSaveQueued = false
      void ensureInbox()
        .then(saveRoster)
        .catch(() => {
          // The next sync writes it.
        })
    }, ROSTER_SAVE_DELAY_MS)
  }

  /**
   * Also purges everything they shared with this User, and records the pairing
   * as ended so no roster brings it back. `removedAt` defaults to the pairing's
   * own `pairedAt`: when the relay says they left, this device may hold an
   * older pairing than one made since on another device. Unless `quiet` (the
   * User or another of their devices ended it), invitations that never reached
   * them are reported to the User.
   */
  function forgetBuddy(
    inboxId: string,
    removedAt?: number,
    { quiet = false } = {}
  ) {
    const unsentTo = noteUnsentTo(inboxId)
    if (unsentTo && !quiet)
      deps.onSharesNotSent?.({ reason: 'gone', names: [unsentTo] })
    store.setState((state) => ({
      buddies: state.buddies.filter((b) => b.inboxId !== inboxId),
      removedBuddies: endedPairing(state, inboxId, removedAt),
      cards: omitKey(state.cards, inboxId),
      publishedCardHashes: omitKey(state.publishedCardHashes, inboxId),
      incomingShares: Object.fromEntries(
        Object.entries(state.incomingShares).filter(
          ([, share]) => share.from !== inboxId
        )
      ),
      outgoingShares: Object.fromEntries(
        Object.entries(state.outgoingShares).map(([key, share]) => [
          key,
          {
            ...share,
            sent: omitKey(share.sent, inboxId),
            sentTiming: omitKey(share.sentTiming ?? {}, inboxId),
          },
        ])
      ),
      shareReplies: Object.fromEntries(
        Object.entries(state.shareReplies).map(([shareId, replies]) => [
          shareId,
          omitKey(replies, inboxId),
        ])
      ),
      joinRequests: Object.fromEntries(
        Object.entries(state.joinRequests).filter(
          ([, request]) => request.from !== inboxId
        )
      ),
      askedToJoin: Object.fromEntries(
        Object.entries(state.askedToJoin).filter(
          ([, request]) => request.to !== inboxId
        )
      ),
      alertOverrides: omitKey(state.alertOverrides, inboxId),
      notifications: state.notifications.filter((n) => n.from !== inboxId),
      // Pairing again later never brings old badge news.
      badgeAnnouncements: state.badgeAnnouncements.map((announcement) => ({
        ...announcement,
        recipients: announcement.recipients.filter((id) => id !== inboxId),
      })),
      lastBadgeAlertAt: omitKey(state.lastBadgeAlertAt, inboxId),
      // Reactions both ways go with them.
      sentBadgeReactions: omitKey(state.sentBadgeReactions, inboxId),
      badgeReactions: Object.fromEntries(
        Object.entries(state.badgeReactions)
          .map(([key, reactions]): [string, typeof reactions] => [
            key,
            omitKey(reactions, inboxId),
          ])
          .filter(([, reactions]) => Object.keys(reactions).length > 0)
      ),
      lastBadgeReactionAlertAt: omitKey(
        state.lastBadgeReactionAlertAt,
        inboxId
      ),
    }))
  }

  /**
   * A buddy is going: the User's coming Plans and Follow-ups that invite them
   * but never reached them say so (a `gone` entry in `unsentShares`). Their
   * name when there were any.
   */
  function noteUnsentTo(inboxId: string): string | null {
    const state = store.getState()
    const buddy = state.buddies.find((b) => b.inboxId === inboxId)
    if (!buddy || !deps.getShares) return null
    const now = deps.now()
    const entry: UnsentShare = {
      reason: 'gone',
      name: buddy.nickname ?? buddy.name,
      at: now,
    }
    const keys = deps
      .getShares()
      .filter(
        (spec) =>
          spec.endsAt > now &&
          spec.recipients.includes(inboxId) &&
          state.outgoingShares[spec.key]?.sent[inboxId] === undefined &&
          state.unsentShares[spec.key]?.[inboxId] === undefined
      )
      .map((spec) => spec.key)
    if (keys.length === 0) return null
    setUnsent(keys.map((key) => [key, inboxId, entry]))
    return entry.name
  }

  /** Records (an entry) or clears (null) invitations that didn't go out. */
  function setUnsent(changes: [string, string, UnsentShare | null][]) {
    store.setState((state) => {
      const unsentShares = { ...state.unsentShares }
      for (const [key, inboxId, entry] of changes) {
        const recipients = entry
          ? { ...unsentShares[key], [inboxId]: entry }
          : omitKey(unsentShares[key] ?? {}, inboxId)
        if (Object.keys(recipients).length > 0) unsentShares[key] = recipients
        else delete unsentShares[key]
      }
      return { unsentShares }
    })
  }

  /** Queues a tray entry, stamped now unless it says when it happened. */
  function notify(
    entry: Omit<BuddyNotification, 'at' | 'read'> & { at?: number },
    read = false
  ) {
    store.setState((state) => ({
      notifications: cappedQueue(
        [
          { ...entry, at: entry.at ?? deps.now(), read },
          ...state.notifications.filter((n) => n.id !== entry.id),
        ],
        state,
        deps.now()
      ),
    }))
  }

  function dropInvite(inviteId: string) {
    store.setState((state) => ({
      closedInviteIds: {
        ...state.closedInviteIds,
        [inviteId]:
          state.outgoingInvites.find((i) => i.inviteId === inviteId)
            ?.expiresAt ??
          state.incomingClaims.find((c) => c.inviteId === inviteId)
            ?.expiresAt ??
          deps.now() + INVITE_TTL_MS,
      },
      outgoingInvites: state.outgoingInvites.filter(
        (invite) => invite.inviteId !== inviteId
      ),
      incomingClaims: state.incomingClaims.filter(
        (claim) => claim.inviteId !== inviteId
      ),
      notifications: state.notifications.filter((n) => n.inviteId !== inviteId),
    }))
  }

  function requireName() {
    if (!displayName()) throw new BuddyInviteError('nameRequired')
  }

  /**
   * Looks up each invite whose create got no answer (`unconfirmedInvites`): one
   * the relay holds open joins the outgoing invites, so it can be shared or
   * cancelled; one it doesn't (or that expired) is forgotten. Stops at the
   * first lookup that fails, for the next sync. Returns the newest one found.
   */
  async function confirmUnsureInvites(): Promise<OutgoingInvite | null> {
    let found: OutgoingInvite | null = null
    for (const invite of store.getState().unconfirmedInvites) {
      let open = false
      if (invite.expiresAt > deps.now()) {
        try {
          open = (await relay.fetchInvite(invite.inviteId)).status === 'open'
        } catch (error) {
          if (!isRelayError(error, 'not_found')) return found
        }
      }
      store.setState((state) => ({
        unconfirmedInvites: state.unconfirmedInvites.filter(
          (candidate) => candidate.inviteId !== invite.inviteId
        ),
        outgoingInvites:
          open &&
          !state.outgoingInvites.some((i) => i.inviteId === invite.inviteId)
            ? [...state.outgoingInvites, invite]
            : state.outgoingInvites,
      }))
      if (open) found = invite
    }
    return found
  }

  async function createInvite(): Promise<string> {
    requireName()
    if (occupiedBuddySpots(store.getState()) >= MAX_BUDDIES)
      throw new BuddyInviteError('limit')
    const me = await ensureInbox()
    // An earlier try may have created one without hearing back: that's the
    // one to show, not a second.
    const unsure = await confirmUnsureInvites()
    if (unsure) {
      await saveRoster(me)
      return buildInviteLink(fromB64u(unsure.secret))
    }
    const secret = deps.randomBytes(16)
    const invite = deriveInvite(secret)
    const createdAt = deps.now()
    const expiresAt = createdAt + INVITE_TTL_MS
    try {
      await relay.createInvite(ownerAuth(me), {
        inviteId: invite.inviteId,
        claimVerifier: invite.claimVerifier,
        blob: seal(
          invite.inviteKey,
          json(pairingCard(me)),
          aad.inviteCard(invite.inviteId),
          nonce()
        ),
        expiresAt,
      })
    } catch (error) {
      // No answer: the relay may have created it anyway.
      if (
        isRelayConnectivityError(error) ||
        isRelayError(error, 'cancelled') ||
        isRelayError(error, 'unknown')
      )
        store.setState((state) => ({
          unconfirmedInvites: [
            ...state.unconfirmedInvites,
            {
              inviteId: invite.inviteId,
              secret: toB64u(secret),
              createdAt,
              expiresAt,
            },
          ],
        }))
      if (!isRelayError(error, 'limit')) throw error
      // Every spot is taken, or (with spots free here) the relay's cap on
      // invites still waiting to be accepted, some maybe from another device.
      throw new BuddyInviteError(
        occupiedBuddySpots(store.getState()) >= MAX_BUDDIES
          ? 'limit'
          : 'openInvites'
      )
    }
    store.setState((state) => ({
      outgoingInvites: [
        ...state.outgoingInvites,
        {
          inviteId: invite.inviteId,
          secret: toB64u(secret),
          createdAt,
          expiresAt,
        },
      ],
    }))
    await saveRoster(me)
    return buildInviteLink(secret)
  }

  function inviteLinkFor(inviteId: string): string | null {
    const invite = store
      .getState()
      .outgoingInvites.find((candidate) => candidate.inviteId === inviteId)
    return invite ? buildInviteLink(fromB64u(invite.secret)) : null
  }

  async function cancelInvite(inviteId: string) {
    const me = await ensureInbox()
    try {
      await relay.deleteInvite(ownerAuth(me), inviteId)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
    }
    dropInvite(inviteId)
    await saveRoster(me)
  }

  async function readInvite(link: string) {
    const secret = parseInviteSecret(link)
    if (!secret) throw new BuddyInviteError('invalid')
    const invite = deriveInvite(secret)
    let fetched: Awaited<ReturnType<RelayClient['fetchInvite']>>
    try {
      fetched = await relay.fetchInvite(invite.inviteId)
    } catch (error) {
      if (isRelayError(error, 'not_found'))
        throw new BuddyInviteError('unavailable')
      throw error
    }
    let card: PairingCard
    try {
      card = pairingCardSchema.parse(
        decode(
          open(invite.inviteKey, fetched.blob, aad.inviteCard(invite.inviteId))
        )
      )
    } catch {
      throw new BuddyInviteError('invalid')
    }

    const me = await identity()
    const state = store.getState()
    if (card.inboxId === me.inboxId) throw new BuddyInviteError('own')
    if (state.buddies.some((buddy) => buddy.inboxId === card.inboxId))
      throw new BuddyInviteError('alreadyBuddies')
    if (fetched.status !== 'open') throw new BuddyInviteError('unavailable')
    if (occupiedBuddySpots(state) >= MAX_BUDDIES)
      throw new BuddyInviteError('limit')
    return { secret, invite, card, expiresAt: fetched.expiresAt }
  }

  /** What the pre-accept screen shows. Creates no server state. */
  async function previewInvite(link: string) {
    const { card, expiresAt } = await readInvite(link)
    return {
      name: card.name,
      avatar: compactAvatar(card.avatar),
      tenure: card.tenure,
      expiresAt,
    }
  }

  /** Accepting shares nothing until the inviter confirms. */
  async function acceptInvite(link: string) {
    requireName()
    const { secret, invite, card, expiresAt } = await readInvite(link)
    const me = await ensureInbox()
    const party: PairParty = {
      inboxId: card.inboxId,
      dhPub: card.dhPub,
      inviteSecret: toB64u(secret),
    }
    const { incoming } = pairKeys(me, party)
    await addSlot(me, incoming)
    const claim = seal(
      invite.inviteKey,
      json(pairingCard(me)),
      aad.claim(invite.inviteId),
      nonce()
    )
    try {
      await claimOnce(invite.inviteId, invite.claimSecret, claim)
    } catch (error) {
      await relay.removeSlot(ownerAuth(me), incoming.slotId).catch(() => {})
      if (isRelayError(error, 'conflict') || isRelayError(error, 'not_found'))
        throw new BuddyInviteError('unavailable')
      throw error
    }
    const colorIndex = nextColorIndex()
    store.setState((state) => ({
      buddies: [
        ...state.buddies,
        {
          ...party,
          name: card.name,
          avatar: compactAvatar(card.avatar),
          tenure: card.tenure,
          status: 'awaitingConfirm',
          pairedAt: newPairedAt(state, card.inboxId, deps.now()),
          colorIndex,
          expiresAt,
        },
      ],
      // Pairing again on purpose lifts an earlier removal.
      removedBuddies: omitKey(state.removedBuddies, card.inboxId),
      // Accepting a link is starting Buddies; skip the first-visit intro.
      onboardingComplete: true,
    }))
    await saveRoster(me)
    return { name: card.name }
  }

  /**
   * Claims an invite, finding out what happened when the answer is lost: the
   * claim may have landed, and claiming isn't repeatable on older relays (a
   * second try is a `conflict`), while newer ones answer a retry of the same
   * claim with ok. So it's tried once more, then the invite is read: claimed
   * means it was this claim, which leaves the slot for the inviter to confirm
   * into. Throws the connection error when neither answers.
   */
  async function claimOnce(
    inviteId: string,
    claimSecret: string,
    blob: string
  ) {
    try {
      await relay.claimInvite(inviteId, claimSecret, blob)
      return
    } catch (error) {
      if (!isRelayConnectivityError(error)) throw error
    }
    let retryError: unknown
    try {
      await relay.claimInvite(inviteId, claimSecret, blob)
      return
    } catch (error) {
      retryError = error
    }
    const fetched = await relay.fetchInvite(inviteId).catch(() => null)
    if (fetched?.status === 'claimed') return
    throw retryError
  }

  async function confirmClaim(inviteId: string) {
    const state = store.getState()
    const claim = state.incomingClaims.find(
      (candidate) => candidate.inviteId === inviteId
    )
    if (!claim) return
    // Lapsed while still listed: it can't become a pairing anymore.
    if (claim.expiresAt <= deps.now()) {
      dropInvite(inviteId)
      throw new BuddyInviteError('unavailable')
    }
    requireName()
    const me = await ensureInbox()
    const buddy: Buddy = {
      inboxId: claim.inboxId,
      name: claim.name,
      avatar: claim.avatar,
      tenure: claim.tenure,
      dhPub: claim.dhPub,
      inviteSecret: claim.secret,
      status: 'active',
      pairedAt: newPairedAt(state, claim.inboxId, deps.now()),
      colorIndex: nextColorIndex(),
    }
    const { incoming, outgoing } = pairKeys(me, buddy)
    await addSlot(me, incoming)
    // One per invite: confirming again after a lost answer alerts them once.
    const eventId = eventIdFor('pair', me.inboxId, buddy.inboxId, inviteId)
    try {
      await relay.putEvent(writerAuth(buddy.inboxId, outgoing), {
        eventId,
        kind: 'pair.confirmed',
        blob: seal(
          outgoing.contentKey,
          json({
            v: 1,
            ...compactProfile(profile()),
            ...(deps.platform ? { platform: deps.platform } : {}),
          }),
          aad.event(buddy.inboxId, outgoing.slotId, eventId),
          nonce()
        ),
        push: true,
      })
      lastAlertSentAt.set(buddy.inboxId, deps.now())
    } catch (error) {
      if (!isRelayError(error, 'gone')) throw error
      // Their request lapsed or they cancelled — undo our half of the pairing.
      await relay.removeSlot(ownerAuth(me), incoming.slotId).catch(() => {})
      await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
      dropInvite(inviteId)
      await saveRoster(me)
      throw new BuddyInviteError('unavailable')
    }
    store.setState((current) => ({
      buddies: [...current.buddies, buddy],
      // Pairing again on purpose lifts an earlier removal.
      removedBuddies: omitKey(current.removedBuddies, buddy.inboxId),
    }))
    dropInvite(inviteId)
    deps.onPaired?.({ role: 'inviter', buddyPlatform: claim.platform })
    await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
    await saveRoster(me)
    addCardEdits(new Set([buddy.inboxId]))
    await publishCards().catch(() => {})
  }

  /**
   * Turns down a request. Fails, keeping it listed, when the relay can't be
   * told: the other person would otherwise wait on it until it lapses.
   */
  async function rejectClaim(inviteId: string) {
    const me = await ensureInbox()
    try {
      await relay.deleteInvite(ownerAuth(me), inviteId)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
    }
    dropInvite(inviteId)
    await saveRoster(me)
  }

  /** Forgets buddies locally and queues withdrawing their relay slots. */
  function queueRemoval(parties: PendingRemoval[], removedAt?: number) {
    const inboxIds = new Set(parties.map((party) => party.inboxId))
    for (const inboxId of inboxIds)
      forgetBuddy(inboxId, removedAt, { quiet: true })
    store.setState((state) => ({
      pendingRemovals: [
        ...state.pendingRemovals.filter((p) => !inboxIds.has(p.inboxId)),
        ...parties.map(({ inboxId, dhPub, inviteSecret }) => ({
          inboxId,
          dhPub,
          inviteSecret,
        })),
      ],
    }))
  }

  /**
   * Removes their slot from my inbox and my slot (and last card) from theirs.
   * Both are idempotent, so a removal stays queued until both succeed. One that
   * keeps failing waits longer each time (from a minute up to an hour) before
   * syncs try it again; `force` (the User asking) tries everything now.
   */
  async function flushRemovals(me: BuddyIdentity, { force = false } = {}) {
    const missing = (error: unknown) =>
      isRelayError(error, 'not_found') || isRelayError(error, 'gone')
    for (const party of store.getState().pendingRemovals) {
      const retry = removalRetries.get(party.inboxId)
      if (!force && retry && retry.at > deps.now()) continue
      const { incoming, outgoing } = pairKeys(me, party)
      try {
        await relay
          .removeSlot(ownerAuth(me), incoming.slotId)
          .catch((error) => {
            if (!missing(error)) throw error
          })
        await relay
          .leaveSlot(writerAuth(party.inboxId, outgoing))
          .catch((error) => {
            if (!missing(error)) throw error
          })
      } catch {
        const failures = (retry?.failures ?? 0) + 1
        removalRetries.set(party.inboxId, {
          failures,
          at:
            deps.now() +
            Math.min(
              REMOVAL_RETRY_MAX_MS,
              REMOVAL_RETRY_BASE_MS * 2 ** (failures - 1)
            ),
        })
        continue
      }
      removalRetries.delete(party.inboxId)
      store.setState((state) => ({
        pendingRemovals: state.pendingRemovals.filter(
          (p) => p.inboxId !== party.inboxId
        ),
      }))
    }
  }

  const isPendingRemoval = (inboxId: string) =>
    store.getState().pendingRemovals.some((p) => p.inboxId === inboxId)

  /** Ends the connection for both people; neither gets a notification. */
  async function removeBuddy(inboxId: string) {
    const buddy = store.getState().buddies.find((b) => b.inboxId === inboxId)
    if (!buddy) return
    const me = await ensureInbox()
    // Ends every pairing with them up to now, on all this User's devices.
    queueRemoval([buddy], deps.now())
    await flushRemovals(me, { force: true })
    await saveRoster(me)
    if (isPendingRemoval(inboxId)) throw new BuddyRemovalPendingError('buddy')
  }

  /**
   * Changes how this User sees a buddy (nickname, color) or their own settings.
   * Saved to the roster, stamped, so every one of their devices takes the
   * latest.
   */
  function setBuddyPrefs(
    inboxId: string,
    prefs:
      | Partial<Pick<Buddy, 'nickname' | 'color'>>
      | ((buddy: Buddy) => Partial<Pick<Buddy, 'overrides'>>)
  ) {
    const prefsAt = deps.now()
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId
          ? {
              ...b,
              ...(typeof prefs === 'function' ? prefs(b) : prefs),
              prefsAt,
            }
          : b
      ),
    }))
  }

  /**
   * From the buddy's menu: back to All Buddies' choice when that's the one
   * asked for, else their own.
   */
  function setShowOnCalendar(inboxId: string, showOnCalendar: boolean) {
    const followsAll =
      store.getState().sharing.showOnCalendar === showOnCalendar
    void setBuddySetting(
      inboxId,
      'showOnCalendar',
      followsAll ? undefined : showOnCalendar
    ).catch(() => {
      // Saved here; the next change or sync writes the roster.
    })
  }

  /**
   * Gives a buddy their own value for a setting, or (`undefined`) has them
   * follow All Buddies again. A change to what they see republishes their card;
   * they aren't told.
   */
  async function setBuddySetting<K extends BuddySettingKey>(
    inboxId: string,
    key: K,
    value: BuddySettings[K] | undefined
  ) {
    await setBuddyOverrides(inboxId, (overrides) =>
      withOverride(overrides, key, value)
    )
  }

  /**
   * Replaces a buddy's own settings at once: `undefined` has them follow All
   * buddies in everything (Reset All), and Undo puts back what was there.
   */
  async function setBuddyOverrides(
    inboxId: string,
    change: (overrides: Buddy['overrides']) => Buddy['overrides'] | undefined
  ) {
    setBuddyPrefs(inboxId, (buddy) => ({ overrides: change(buddy.overrides) }))
    if (store.getState().registeredInboxId === null) return
    addCardEdits(new Set([inboxId]))
    const me = await ensureInbox()
    await saveRoster(me)
    await publishCards()
  }

  /**
   * Gives a buddy their own alert setting on this device, or (`undefined`) has
   * them follow this device's alert settings again. The Buddies runtime
   * re-registers this device's push templates.
   */
  function setBuddyAlert(
    inboxId: string,
    key: BuddyAlertKey,
    value: boolean | undefined
  ) {
    setBuddyAlerts(inboxId, (alerts) => withOverride(alerts, key, value))
  }

  /** Replaces a buddy's own alert settings at once, like `setBuddyOverrides`. */
  function setBuddyAlerts(
    inboxId: string,
    change: (
      alerts: BuddiesState['alertOverrides'][string] | undefined
    ) => BuddiesState['alertOverrides'][string] | undefined
  ) {
    store.setState((state) => {
      const next = change(state.alertOverrides[inboxId])
      return {
        alertOverrides: next
          ? { ...state.alertOverrides, [inboxId]: next }
          : omitKey(state.alertOverrides, inboxId),
      }
    })
  }

  /**
   * Two buddies may share a color; it's this User's choice. `null` goes back to
   * the assigned slot color.
   */
  async function setColor(inboxId: string, color: string | null) {
    setBuddyPrefs(inboxId, { color: color ?? undefined })
    await saveRoster(await ensureInbox())
  }

  /** A blank nickname goes back to the buddy's own name. */
  async function setNickname(inboxId: string, nickname: string) {
    const trimmed = nickname.trim().slice(0, 60) || undefined
    setBuddyPrefs(inboxId, { nickname: trimmed })
    await saveRoster(await ensureInbox())
  }

  /**
   * Changes All Buddies' settings and republishes, so a withheld photo, Tenure,
   * streak, badges, or Plans clear from the cards of buddies who follow All
   * buddies. Before Buddies has started it only records the choice.
   */
  async function setSharing(
    change: Partial<
      Omit<
        BuddySharing,
        | 'updatedAt'
        | 'badgesUpdatedAt'
        | 'petUpdatedAt'
        | 'plansUpdatedAt'
        | 'calendarUpdatedAt'
      >
    >
  ) {
    const now = deps.now()
    store.setState((state) => ({
      sharing: {
        ...state.sharing,
        ...change,
        // Each choice carries its own stamp (see `mergeSharing`).
        ...('photo' in change || 'tenure' in change || 'streak' in change
          ? { updatedAt: now }
          : {}),
        ...('badges' in change ? { badgesUpdatedAt: now } : {}),
        ...('pet' in change ? { petUpdatedAt: now } : {}),
        ...('plans' in change ||
        'planTimes' in change ||
        'pausedUntil' in change
          ? { plansUpdatedAt: now }
          : {}),
        ...('showOnCalendar' in change ? { calendarUpdatedAt: now } : {}),
      },
    }))
    // Badge news not yet sent stays home too, for buddies who follow All
    // buddies (`pruneBadgeAnnouncements`).
    if (change.badges === false) pruneBadgeAnnouncements()
    if (store.getState().registeredInboxId === null) return
    const me = await ensureInbox()
    await saveRoster(me)
    await publishCards({ edited: true })
  }

  /**
   * Cards that changes made on this device still have to publish: every buddy's
   * (`all`), or those of buddies paired here. A device without the Profile
   * photo publishes only these (see `sendCards`).
   */
  let cardEdits: 'all' | Set<string> = new Set()

  function addCardEdits(edits: 'all' | Set<string>) {
    cardEdits =
      edits === 'all' || cardEdits === 'all'
        ? 'all'
        : new Set([...cardEdits, ...edits])
  }

  /**
   * Publishes one Buddy Card per active buddy, skipping unchanged content.
   * `edited`: for a change made on this device, not one that arrived from
   * another device or with time.
   */
  function publishCards({ edited = false } = {}): Promise<void> {
    if (edited) addCardEdits('all')
    return outbox('cards', sendCards)
  }

  async function sendCards() {
    const current = deps.getProfile()
    const { name } = cardName()
    const edits = cardEdits
    cardEdits = new Set()
    const active = store.getState().buddies.filter((b) => b.status === 'active')
    if (active.length === 0 || !name) return
    // Without the Profile photo, this device's card would take it off the
    // screens of buddies who see it, so cards are left to the device that has
    // it, except for changes made here (and a buddy paired here, who has no
    // card yet).
    const photoUnavailable =
      current.photoUnavailable && active.some((b) => settingsFor(b).photo)
    const targets = photoUnavailable
      ? active.filter((b) => edits === 'all' || edits.has(b.inboxId))
      : active
    if (targets.length === 0) return
    try {
      await sendCardsTo(targets, current)
    } catch (error) {
      addCardEdits(edits)
      throw error
    }
  }

  async function sendCardsTo(targets: Buddy[], current: BuddyProfile) {
    const me = await identity()
    // Every device's card carries the account's name, not this device's.
    const { name } = cardName()
    const each = targets.map((buddy) => ({
      buddy,
      settings: settingsFor(buddy),
    }))
    // One upload serves every buddy who sees the photo; with none left it's
    // taken down.
    const avatar = await withFullPhoto(
      me,
      each.some(({ settings }) => settings.photo) ? current.avatar : undefined
    )
    const { dayPlans, recurringPlans } = deps.getPlans()
    const cardDays = buildBuddyCardDays(
      dayPlans,
      recurringPlans,
      new Date(deps.now())
    )
    const streak = each.some(({ settings }) => settings.streak)
      ? deps.getStreak?.()
      : undefined
    const shared = (deps.showBadges?.() ?? true) ? (current.badges ?? []) : []
    const pet = each.some(({ settings }) => settings.pet)
      ? deps.getPet?.()
      : undefined
    // Left out when there are none, so cards (and their hash) stay as before;
    // so is a pet that isn't there or isn't shared.
    const badges = shared.length > 0 ? shared : undefined
    // While sharing is paused for everyone, the card keeps who this User is
    // and drops their Plans, progress, and pet.
    const paused = sharingPaused()
    const content = (settings: BuddySettings) => ({
      name,
      avatar: settings.photo ? avatar : undefined,
      tenure: settings.tenure ? current.tenure : undefined,
      streak: settings.streak && !paused ? streak : undefined,
      days:
        settings.plans && !paused
          ? withPlanTimes(cardDays, settings.planTimes)
          : [],
      badges: settings.badges && !paused ? badges : undefined,
      pet: settings.pet && !paused ? pet : undefined,
    })
    for (const { buddy, settings } of each) {
      const payload = content(settings)
      const contentHash = toB64u(sha256(json(payload)))
      if (store.getState().publishedCardHashes[buddy.inboxId] === contentHash)
        continue
      const { outgoing } = pairKeys(me, buddy)
      const card = {
        v: 1,
        name: payload.name,
        avatar: payload.avatar,
        tenure: payload.tenure,
        streak: payload.streak,
        updatedAt: deps.now(),
        level: 'daysTimes',
        days: payload.days,
        badges: payload.badges,
        pet: payload.pet,
      }
      try {
        await relay.putCard(
          writerAuth(buddy.inboxId, outgoing),
          seal(
            outgoing.contentKey,
            json(card),
            aad.card(buddy.inboxId, outgoing.slotId),
            nonce()
          )
        )
        store.setState((state) => ({
          publishedCardHashes: {
            ...state.publishedCardHashes,
            [buddy.inboxId]: contentHash,
          },
        }))
      } catch (error) {
        if (!isRelayError(error, 'gone')) throw error
        forgetBuddy(buddy.inboxId)
      }
    }
  }

  /**
   * The card's avatar, linking the Profile photo at full size when it's a
   * photo: uploaded (encrypted with its own key) under this User's inbox once
   * per photo, and again before the relay's copy runs out. One upload serves
   * every buddy. While it can't be uploaded (offline, photos off on the relay)
   * the card carries the thumbnail alone, and a later publish links it.
   */
  async function withFullPhoto(
    me: BuddyIdentity,
    avatar: BuddyAvatar | undefined
  ): Promise<BuddyAvatar | undefined> {
    const uploaded = store.getState().profilePhoto
    if (avatar?.t !== 'image') {
      // Removed, or no longer shared: buddies can't open it any more.
      if (uploaded) await deleteProfilePhoto(me, uploaded)
      return avatar
    }
    if (!deps.readProfilePhoto || !store.getState().photosAvailable)
      return avatar
    const now = deps.now()
    const thumbnail = toB64u(sha256(utf8(avatar.v)))
    const current = (photo: UploadedProfilePhoto | null) =>
      photo?.thumbnail === thumbnail && photo.expiresAt > now ? photo : null
    let photo = current(uploaded)
    if (!photo || photo.expiresAt - now <= SHARED_PHOTO_REFRESH_MS) {
      try {
        photo = current(await uploadProfilePhoto(me, thumbnail)) ?? photo
      } catch (error) {
        if (isRelayError(error, 'photos_disabled'))
          store.setState({ photosAvailable: false })
        if (isRelayError(error, 'cancelled')) throw error
      }
    }
    if (!photo) return avatar
    const { blob, token, key } = photo
    return { ...avatar, full: { blob, token, key } }
  }

  async function uploadProfilePhoto(
    me: BuddyIdentity,
    thumbnail: string
  ): Promise<UploadedProfilePhoto | null> {
    const bytes = await deps.readProfilePhoto?.()
    if (!bytes) return null
    const key = deps.randomBytes(32)
    const token = deps.randomBytes(32)
    const { sealed, blobId } = sealSharedPhoto(
      bytes,
      key,
      deps.randomBytes(12),
      PROFILE_PHOTO_AAD
    )
    const expiresAt = deps.now() + SHARED_PHOTO_MAX_LIFETIME_MS
    await relay.putBlob(ownerAuth(me), {
      blobId,
      data: sealed,
      expiresAt,
      readTokenHash: toB64u(sha256(token)),
    })
    const previous = store.getState().profilePhoto
    const uploaded: UploadedProfilePhoto = {
      thumbnail,
      blob: blobId,
      key: toB64u(key),
      token: toB64u(token),
      expiresAt,
    }
    store.setState({ profilePhoto: uploaded })
    if (
      previous &&
      previous.blob !== blobId &&
      previous.expiresAt > deps.now()
    ) {
      await relay.deleteBlobs(ownerAuth(me), [previous.blob]).catch(() => {})
    }
    return uploaded
  }

  /**
   * Kept to try again on the next publish while the relay can't be reached.
   * With photos off there, the relay deletes it when it expires.
   */
  async function deleteProfilePhoto(
    me: BuddyIdentity,
    photo: UploadedProfilePhoto
  ) {
    if (photo.expiresAt > deps.now()) {
      try {
        await relay.deleteBlobs(ownerAuth(me), [photo.blob])
      } catch (error) {
        if (
          !isRelayError(error, 'not_found') &&
          !isRelayError(error, 'photos_disabled')
        )
          return
      }
    }
    store.setState({ profilePhoto: null })
  }

  /**
   * A buddy's Profile photo at full size as JPEG bytes, from the link in their
   * card; null when the relay's copy is gone, or isn't the one linked.
   */
  async function fetchBuddyPhoto(
    inboxId: string,
    photo: ProfilePhoto,
    call: RelayCallOptions = {}
  ): Promise<Uint8Array | null> {
    try {
      const sealed = await relay.getBlob(
        { inboxId, blobId: photo.blob, token: photo.token },
        call
      )
      return openSharedPhoto(sealed, photo, PROFILE_PHOTO_AAD)
    } catch (error) {
      if (isRelayError(error, 'not_found')) return null
      throw error
    }
  }

  /** Lets go of buddies' full-size photos no card links any more. */
  async function keepBuddyPhotos() {
    const linked = store
      .getState()
      .buddies.flatMap((buddy) =>
        buddy.avatar?.t === 'image' && buddy.avatar.full
          ? [buddy.avatar.full.blob]
          : []
      )
    await deps.keepBuddyPhotos?.(linked).catch(() => {})
  }

  function applyClaim(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const state = store.getState()
    const invite = state.outgoingInvites.find(
      (i) => i.inviteId === event.eventId
    )
    if (
      !invite ||
      state.incomingClaims.some((c) => c.inviteId === invite.inviteId)
    )
      return
    let card: PairingCard
    try {
      const { inviteKey } = deriveInvite(fromB64u(invite.secret))
      card = pairingCardSchema.parse(
        decode(open(inviteKey, event.blob, aad.claim(invite.inviteId)))
      )
    } catch {
      return
    }
    if (
      card.inboxId === me.inboxId ||
      state.buddies.some((buddy) => buddy.inboxId === card.inboxId)
    )
      return
    store.setState((current) => ({
      incomingClaims: [
        ...current.incomingClaims,
        {
          inviteId: invite.inviteId,
          secret: invite.secret,
          name: card.name,
          avatar: compactAvatar(card.avatar),
          tenure: card.tenure,
          dhPub: card.dhPub,
          inboxId: card.inboxId,
          ...(card.platform ? { platform: card.platform } : {}),
          receivedAt: deps.now(),
          expiresAt: invite.expiresAt,
        },
      ],
    }))
    notify({
      id: event.eventId,
      kind: 'claim',
      name: card.name,
      inviteId: invite.inviteId,
      seq: event.seq,
    })
  }

  function applyConfirmation(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ): boolean {
    const buddy = store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'awaitingConfirm' &&
          pairKeys(me, candidate).incoming.slotId === event.slotId
      )
    if (!buddy) return false
    try {
      const { incoming } = pairKeys(me, buddy)
      const body = pairConfirmedSchema.parse(
        decode(
          open(
            incoming.contentKey,
            event.blob,
            aad.event(me.inboxId, event.slotId, event.eventId)
          )
        )
      )
      store.setState((state) => ({
        buddies: state.buddies.map((b) =>
          b.inboxId === buddy.inboxId
            ? {
                ...b,
                name: body.name,
                avatar: body.avatar ?? b.avatar,
                tenure: body.tenure,
                status: 'active',
                expiresAt: undefined,
              }
            : b
        ),
      }))
      notify({
        id: event.eventId,
        kind: 'paired',
        from: buddy.inboxId,
        name: body.name,
        seq: event.seq,
      })
      deps.onPaired?.({ role: 'invitee', buddyPlatform: body.platform })
      // Their first card from this User; the sync publishes it.
      addCardEdits(new Set([buddy.inboxId]))
      return true
    } catch {
      return false
    }
  }

  function applyCard(
    me: BuddyIdentity,
    card: RelaySyncResponse['cards'][number]
  ) {
    const buddy = store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'active' &&
          pairKeys(me, candidate).incoming.slotId === card.slotId
      )
    if (!buddy) return
    try {
      const { incoming } = pairKeys(me, buddy)
      const parsed = buddyCardSchema.parse(
        decode(
          open(
            incoming.contentKey,
            card.blob,
            aad.card(me.inboxId, card.slotId)
          )
        )
      )
      // A request for a Plan the buddy moved or dropped can't be seen or
      // answered anymore; it's taken back on the next delivery.
      withdrawJoinRequests(
        Object.values(store.getState().askedToJoin)
          .filter(
            (request) =>
              request.to === buddy.inboxId &&
              !request.withdrawn &&
              !parsed.days.some(
                (day) =>
                  day.d === request.d &&
                  day.p.some((plan) => plan.s === request.s)
              )
          )
          .map((request) => request.id)
      )
      store.setState((state) => ({
        cards: {
          ...state.cards,
          [buddy.inboxId]: {
            name: parsed.name,
            updatedAt: parsed.updatedAt,
            receivedAt: deps.now(),
            days: parsed.days,
          },
        },
        buddies: state.buddies.map((b) =>
          b.inboxId === buddy.inboxId
            ? {
                ...b,
                name: parsed.name,
                avatar: parsed.avatar,
                tenure: parsed.tenure,
                streak: parsed.streak,
                // The card is the source of truth: none listed clears them.
                badges: knownBadges(parsed.badges),
                // None on the card: no pet, or not shared any more.
                pet: parsed.pet,
              }
            : b
        ),
      }))
    } catch {
      // Undecryptable or malformed cards are dropped; the next publish replaces them.
    }
  }

  /** Stable per share, so every device of this User sends the same id. */
  function shareIdFor(inboxId: string, key: string): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/share|${inboxId}|${key}`)).slice(0, 16)
    )
  }

  /**
   * Whether a buddy's hourly share-event budget has room; when it doesn't, the
   * send waits for a later publish. Kept in memory: best effort.
   */
  function hasShareBudget(inboxId: string): boolean {
    const since = deps.now() - HOUR_MS
    const recent = (shareSends.get(inboxId) ?? []).filter((at) => at > since)
    shareSends.set(inboxId, recent)
    return recent.length < SHARE_EVENTS_PER_HOUR
  }

  /** Only events the relay accepted count against the budget. */
  function spendShareBudget(inboxId: string) {
    shareSends.set(inboxId, [...(shareSends.get(inboxId) ?? []), deps.now()])
  }

  async function sendEvent(
    me: BuddyIdentity,
    buddy: Buddy,
    kind: string,
    body: unknown,
    push = true,
    eventId = newId()
  ) {
    const { outgoing } = pairKeys(me, buddy)
    await relay.putEvent(writerAuth(buddy.inboxId, outgoing), {
      eventId,
      kind,
      blob: seal(
        outgoing.contentKey,
        json(body),
        aad.event(buddy.inboxId, outgoing.slotId, eventId),
        nonce()
      ),
      push,
    })
    if (push) lastAlertSentAt.set(buddy.inboxId, deps.now())
  }

  /**
   * Fits the invitation in the relay's event cap: leaves photos out (the last
   * first), then the formatting, then shortens the note.
   */
  function fitEvent(invite: ShareInvite): ShareInvite {
    let fitted = invite
    const withDetails = (details: Partial<ShareInvite['details']>) => {
      fitted = { ...fitted, details: { ...fitted.details, ...details } }
    }
    for (;;) {
      const over = json(fitted).length - MAX_EVENT_PLAINTEXT_BYTES
      if (over <= 0) return fitted
      const { photos, noteDoc, note } = fitted.details
      if (photos?.length) {
        withDetails({
          photos: photos.length > 1 ? photos.slice(0, -1) : undefined,
        })
        continue
      }
      if (noteDoc) {
        withDetails({ noteDoc: undefined })
        continue
      }
      if (!note) return fitted
      // A character is at most 6 bytes of JSON (`\uXXXX`).
      const kept = note
        .slice(0, Math.max(0, note.length - Math.ceil(over / 6)))
        .replace(/[\uD800-\uDBFF]$/, '')
      withDetails({ note: kept || undefined })
    }
  }

  /**
   * A photo in a shared note, uploaded (encrypted with its own key) under this
   * User's inbox to stay on the relay as long as its share (a month after the
   * Plan ends), or at most `SHARED_PHOTO_MAX_LIFETIME_MS`. One upload serves
   * every share of the photo while it lasts; one running short for a Plan
   * further out is replaced by a new upload, and the old copy deleted.
   */
  async function uploadSharedPhoto(
    me: BuddyIdentity,
    image: RichTextImageAttrs,
    spec: OutgoingShareSpec
  ): Promise<SharedPhoto | null> {
    const now = deps.now()
    const until = spec.expiresAt
    const cached = store.getState().sharedPhotos[image.id]
    const ref = (photo: UploadedSharedPhoto): SharedPhoto => ({
      id: image.id,
      blob: photo.blob,
      token: photo.token,
      key: photo.key,
      w: photo.w,
      h: photo.h,
    })
    if (cached && sharedPhotoCovers(cached.expiresAt, until, now)) {
      return ref(cached)
    }
    const expiresAt = sharedPhotoExpiry(until, now)
    const file = await deps.readSharedPhoto?.(image)
    if (!file) return null
    const key = deps.randomBytes(32)
    const token = deps.randomBytes(32)
    const { sealed, blobId } = sealSharedPhoto(
      file.bytes,
      key,
      deps.randomBytes(12)
    )
    await relay.putBlob(ownerAuth(me), {
      blobId,
      data: sealed,
      expiresAt,
      readTokenHash: toB64u(sha256(token)),
    })
    const uploaded: UploadedSharedPhoto = {
      blob: blobId,
      key: toB64u(key),
      token: toB64u(token),
      expiresAt,
      w: file.width,
      h: file.height,
    }
    store.setState((state) => ({
      sharedPhotos: { ...state.sharedPhotos, [image.id]: uploaded },
    }))
    if (cached && cached.blob !== blobId && cached.expiresAt > now) {
      await relay.deleteBlobs(ownerAuth(me), [cached.blob]).catch(() => {})
    }
    return ref(uploaded)
  }

  /**
   * A share's details with its note's formatting and photos. A photo that can't
   * be uploaded now (offline, photos off on the relay) is left out, and the
   * next publish sends it once it can.
   */
  async function sharedDetails(
    me: BuddyIdentity,
    spec: OutgoingShareSpec
  ): Promise<ShareInvite['details']> {
    if (!spec.noteDoc) return spec.details
    const photos: SharedPhoto[] = []
    if (store.getState().photosAvailable) {
      const images = new Map(
        richTextImages(spec.noteDoc).map((image) => [image.id, image])
      )
      for (const image of [...images.values()].slice(0, MAX_SHARED_PHOTOS)) {
        try {
          const photo = await uploadSharedPhoto(me, image, spec)
          if (photo) photos.push(photo)
        } catch (error) {
          if (isRelayError(error, 'photos_disabled')) {
            store.setState({ photosAvailable: false })
            break
          }
          // Only an inbox with a buddy can store photos.
          if (isRelayError(error, 'no_buddies')) break
          if (isRelayError(error, 'cancelled')) throw error
        }
      }
    }
    const shared = new Set(photos.map((photo) => photo.id))
    const doc = mapRichTextImages(spec.noteDoc, (image) =>
      shared.has(image.id) ? image : null
    )
    return {
      ...spec.details,
      noteDoc: encodeSharedNoteDoc(doc),
      ...(photos.length ? { photos } : {}),
    }
  }

  /**
   * Forgets uploads no current share uses (the photo was taken out, or its Plan
   * deleted or unshared), and asks the relay to delete the ones that haven't
   * expired. Best effort: the relay deletes them at `expiresAt` anyway.
   */
  async function pruneSharedPhotos(
    me: BuddyIdentity,
    specs: OutgoingShareSpec[]
  ) {
    const used = new Set(
      specs.flatMap((spec) =>
        spec.noteDoc
          ? richTextImages(spec.noteDoc).map((image) => image.id)
          : []
      )
    )
    const now = deps.now()
    const unused = Object.entries(store.getState().sharedPhotos).filter(
      ([id, photo]) => !used.has(id) || photo.expiresAt <= now
    )
    if (!unused.length) return
    const live = unused
      .filter(([, photo]) => photo.expiresAt > now)
      .map(([, photo]) => photo.blob)
    for (let start = 0; start < live.length; start += 50) {
      await relay
        .deleteBlobs(ownerAuth(me), live.slice(start, start + 50))
        .catch(() => {})
    }
    const gone = new Set(unused.map(([id]) => id))
    store.setState((state) => ({
      sharedPhotos: Object.fromEntries(
        Object.entries(state.sharedPhotos).filter(([id]) => !gone.has(id))
      ),
    }))
  }

  /**
   * Brings buddies' shared photos onto this device: those in invitations still
   * open and in Plans this User follows. Each is checked against its hash and
   * opened with its key; one that fails is tried again on the next sync.
   */
  async function downloadSharedPhotos(call: RelayCallOptions) {
    const { hasSharedPhoto, saveSharedPhoto } = deps
    if (!hasSharedPhoto || !saveSharedPhoto) return
    const now = deps.now()
    const wanted = new Map<string, { from: string; photo: SharedPhoto }>()
    for (const share of Object.values(store.getState().incomingShares)) {
      if (share.expiresAt <= now) continue
      if (share.status === 'cancelled' || share.status === 'declined') continue
      for (const photo of share.details.photos ?? []) {
        wanted.set(localSharedPhotoId(photo.blob), { from: share.from, photo })
      }
    }
    let saved = 0
    for (const [localId, { from, photo }] of wanted) {
      cancelled(call)
      if (await hasSharedPhoto(localId)) continue
      try {
        const sealed = await relay.getBlob(
          { inboxId: from, blobId: photo.blob, token: photo.token },
          call
        )
        const bytes = openSharedPhoto(sealed, photo)
        if (!bytes) continue
        await saveSharedPhoto(localId, bytes)
        saved++
      } catch (error) {
        if (isRelayError(error, 'cancelled')) throw error
        // Gone, expired, or offline: the next sync tries again.
      }
    }
    if (saved) deps.onSharedPhotosSaved?.()
  }

  /**
   * The revs one publish of a share sends with. A send left undone keeps its
   * rev, and so its event id, while the content (`hash`) is the same: sent
   * again after a lost answer, it's the same event, which the relay keeps once.
   * Every other send gets a rev newer than any this share has used, so a buddy
   * never drops it as old, even after the clock moves back.
   */
  function shareRevs(
    previous: OutgoingShare | undefined,
    hash: string,
    now: number,
    version?: number
  ) {
    const kept = previous?.pending?.hash === hash ? previous.pending.revs : {}
    const floor = (previous?.lastRev ?? 0) + 1
    const fresh = Math.max(now, floor)
    // Every device of this User reaches the same rev for the same change, so
    // a send that alerts is one event, and one alert, however many send it.
    const settled =
      version !== undefined && version >= MIN_SHARE_VERSION
        ? Math.max(version, floor)
        : fresh
    let lastRev = previous?.lastRev ?? 0
    const undone: Record<string, number> = {}
    return {
      fresh,
      /** `alerts`: the send pushes, so it takes the rev every device shares. */
      take(inboxId: string, kind: string, alerts = false) {
        const rev = kept[`${inboxId}|${kind}`] ?? (alerts ? settled : fresh)
        lastRev = Math.max(lastRev, rev)
        return rev
      },
      leave(inboxId: string, kind: string, rev: number) {
        undone[`${inboxId}|${kind}`] = rev
      },
      saved(): Pick<OutgoingShare, 'lastRev' | 'pending'> {
        return {
          ...(lastRev > 0 ? { lastRev } : {}),
          ...(Object.keys(undone).length > 0
            ? { pending: { hash, revs: undone } }
            : {}),
        }
      },
    }
  }

  /**
   * Takes shares this device has never sent as sent, without sending: they came
   * from another of this User's devices, which sent them (they were in the data
   * at this device's first sync, or `keys` just arrived through iCloud Sync). A
   * change after that is sent as usual, as an update.
   */
  function adoptShares(keys?: readonly string[]) {
    const inboxId = knownInboxId()
    if (!inboxId || !deps.getShares || keys?.length === 0) return
    const now = deps.now()
    const state = store.getState()
    const isActive = (id: string) =>
      state.buddies.some((b) => b.inboxId === id && b.status === 'active')
    const adopted: Record<string, OutgoingShare> = {}
    for (const spec of deps.getShares()) {
      if (keys && !keys.includes(spec.key)) continue
      if (spec.expiresAt <= now || state.outgoingShares[spec.key]) continue
      const recipients = spec.recipients.filter(isActive)
      if (recipients.length === 0) continue
      const timing = shareTiming(spec.details)
      adopted[spec.key] = {
        shareId: shareIdFor(inboxId, spec.key),
        type: spec.type,
        endsAt: spec.endsAt,
        expiresAt: spec.expiresAt,
        sent: Object.fromEntries(
          recipients.map((id) => [id, ADOPTED_SHARE_HASH])
        ),
        sentTiming: Object.fromEntries(recipients.map((id) => [id, timing])),
        ...(spec.version !== undefined && spec.version >= MIN_SHARE_VERSION
          ? { lastRev: spec.version }
          : {}),
        adopted: adoptionHash(spec, isActive),
      }
    }
    if (Object.keys(adopted).length === 0) return
    store.setState((current) => ({
      outgoingShares: { ...current.outgoingShares, ...adopted },
    }))
  }

  /**
   * Brings every buddy's view of this User's shared Plans and Follow-ups in
   * line with the current data: invites new recipients, updates changed
   * details, and cancels removed recipients and deleted shares. Content is
   * hashed per recipient so an unchanged share sends nothing.
   */
  function publishShares(): Promise<void> {
    return outbox('shares', sendShares)
  }

  async function sendShares() {
    if (!deps.getShares || !displayName()) return
    const now = deps.now()
    const specs = deps.getShares().filter((spec) => spec.expiresAt > now)
    resolveJoinRequests(specs)
    const state = store.getState()
    if (
      specs.length === 0 &&
      Object.keys(state.outgoingShares).length === 0 &&
      Object.keys(state.unsentShares).length === 0
    )
      return
    const me = await identity()
    const activeBuddy = (inboxId: string) =>
      store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
    let failure: unknown = null
    /** Invitations this publish found it can't send, to tell the User. */
    const notSent: Record<UnsentShareReason, Set<string>> = {
      suspended: new Set(),
      gone: new Set(),
    }

    /**
     * Sends one event: `sent`, `retry` on the next publish, or `dropped`, when
     * it never will be (the pairing ended, the buddy's inbox is gone, or an
     * invitation the relay refused while the account is suspended: it isn't
     * held for later). A refused invitation is recorded with `refused`; while
     * suspended, cancels are retried, since they only take back what buddies
     * already have.
     */
    const deliver = async (
      inboxId: string,
      kind: string,
      body: { id: string; rev: number },
      push = true,
      refused?: (reason: UnsentShareReason, name: string) => void
    ): Promise<'sent' | 'retry' | 'dropped'> => {
      const buddy = activeBuddy(inboxId)
      if (!buddy) return 'dropped'
      if (!hasShareBudget(inboxId)) return 'retry'
      const eventId = eventIdFor(
        'share',
        me.inboxId,
        inboxId,
        body.id,
        kind,
        body.rev
      )
      try {
        await sendEvent(me, buddy, kind, body, push, eventId)
        spendShareBudget(inboxId)
        return 'sent'
      } catch (error) {
        // Says so itself when an invitation never reached them.
        if (isRelayError(error, 'gone')) {
          forgetBuddy(inboxId)
          return 'dropped'
        }
        const name = buddy.nickname ?? buddy.name
        // Their inbox is gone (they deleted their Buddies data, or the relay
        // wiped it), so nothing sent there arrives; the pairing ends here
        // once their slot leaves this inbox.
        if (isRelayError(error, 'not_found')) {
          if (refused) {
            refused('gone', name)
            notSent.gone.add(name)
          }
          return 'dropped'
        }
        failure ??= error
        if (refused && isRelayError(error, 'suspended')) {
          refused('suspended', name)
          notSent.suspended.add(name)
          return 'dropped'
        }
        return 'retry'
      }
    }

    const saveSent = (
      key: string,
      share: BuddiesState['outgoingShares'][string] | null
    ) =>
      store.setState((current) => ({
        outgoingShares: share
          ? { ...current.outgoingShares, [key]: share }
          : omitKey(current.outgoingShares, key),
      }))

    for (const spec of specs) {
      const previous = store.getState().outgoingShares[spec.key]
      // Another device sent it, and nothing changed since (`adoptShares`).
      if (
        previous?.adopted !== undefined &&
        previous.adopted === adoptionHash(spec, activeBuddy)
      )
        continue
      // Once it has happened, a share is history: it goes on, quietly, only to
      // buddies who already have it, never to anyone new.
      const ended = spec.endsAt <= now
      if (ended && !Object.keys(previous?.sent ?? {}).length) continue
      const shareId = shareIdFor(me.inboxId, spec.key)
      const prefix = SHARE_KIND_PREFIX[spec.type]
      const details = await sharedDetails(me, spec)
      const hash = toB64u(
        sha256(
          json({
            type: spec.type,
            details,
            expiresAt: spec.expiresAt,
          })
        )
      )
      const revs = shareRevs(previous, hash, now, spec.version)
      // Only a change to when or where pushes; a new title or note arrives
      // quietly, sparing the relay's daily push budget for what matters.
      const timing = shareTiming(details)
      const recipients = new Set(spec.recipients.filter(activeBuddy))
      const sent = { ...previous?.sent }
      const sentTiming = { ...previous?.sentTiming }
      const unsent = store.getState().unsentShares[spec.key] ?? {}
      const unsentChanges: [string, string, UnsentShare | null][] = []
      const body = fitEvent({
        v: 1,
        id: shareId,
        rev: revs.fresh,
        type: spec.type,
        ...shareEventExpiry(spec),
        details,
      })
      for (const inboxId of recipients) {
        if (sent[inboxId] === hash) continue
        // Refused (suspended, or their inbox gone): never sent later as it
        // stands.
        if (unsent[inboxId]?.hash === hash) continue
        const update = sent[inboxId] !== undefined
        if (ended && !update) continue
        const kind = `${prefix}.${update ? 'update' : 'invite'}`
        const push = !ended && (!update || sentTiming[inboxId] !== timing)
        const rev = revs.take(inboxId, kind, push)
        const outcome = await deliver(
          inboxId,
          kind,
          { ...body, rev },
          push,
          (reason, name) =>
            unsentChanges.push([
              spec.key,
              inboxId,
              { reason, name, hash, at: now },
            ])
        )
        if (outcome === 'sent') {
          sent[inboxId] = hash
          sentTiming[inboxId] = timing
          if (unsent[inboxId]) unsentChanges.push([spec.key, inboxId, null])
        } else if (outcome === 'retry') revs.leave(inboxId, kind, rev)
      }
      // No longer invited: nothing more to say about them. A buddy who's gone
      // is taken off the Plan or Follow-up for them (`forgetBuddiesInData`),
      // so that one stays, to say it never reached them, until it's over or
      // they're a buddy again.
      for (const [inboxId, entry] of Object.entries(unsent))
        if (
          !spec.recipients.includes(inboxId) &&
          (entry.reason !== 'gone' || activeBuddy(inboxId))
        )
          unsentChanges.push([spec.key, inboxId, null])
      for (const inboxId of Object.keys(sent)) {
        if (recipients.has(inboxId)) continue
        const kind = `${prefix}.cancel`
        const rev = revs.take(inboxId, kind, !ended)
        const cancel = { v: 1, id: shareId, rev, removed: true }
        // Taking someone off who hadn't said they're going is no news to them.
        const going =
          store.getState().shareReplies[shareId]?.[inboxId]?.status === 'going'
        if (
          (await deliver(inboxId, kind, cancel, going && !ended)) !== 'retry'
        ) {
          delete sent[inboxId]
          delete sentTiming[inboxId]
        } else revs.leave(inboxId, kind, rev)
      }
      setUnsent(unsentChanges)
      saveSent(spec.key, {
        shareId,
        type: spec.type,
        endsAt: spec.endsAt,
        expiresAt: spec.expiresAt,
        sent,
        sentTiming,
        ...revs.saved(),
      })
    }

    const wanted = new Set(specs.map((spec) => spec.key))
    for (const [key, share] of Object.entries(
      store.getState().outgoingShares
    )) {
      if (wanted.has(key)) continue
      const sent = { ...share.sent }
      const revs = shareRevs(share, 'deleted', now, deps.withdrawnAt?.(key))
      if (share.expiresAt > now) {
        const kind = `${SHARE_KIND_PREFIX[share.type]}.cancel`
        // Deleting one that has happened goes quietly.
        const ended =
          (share.endsAt ?? share.expiresAt - LEGACY_SHARE_RETENTION_MS) <= now
        for (const inboxId of Object.keys(sent)) {
          const rev = revs.take(inboxId, kind, !ended)
          const cancel = { v: 1, id: share.shareId, rev }
          if ((await deliver(inboxId, kind, cancel, !ended)) !== 'retry')
            delete sent[inboxId]
          else revs.leave(inboxId, kind, rev)
        }
      }
      const { pending: _pending, ...rest } = share
      saveSent(
        key,
        share.expiresAt > now && Object.keys(sent).length > 0
          ? { ...rest, sent, ...revs.saved() }
          : null
      )
    }
    // A Plan or Follow-up that's gone, or over, has nothing left to tell. One
    // that no longer invites anyone, because the buddies it invited are gone
    // (`forgetBuddiesInData`), isn't shared any more, but still says it never
    // reached them, until it's over or they're a buddy again.
    const unsentChanges: [string, string, UnsentShare | null][] = []
    for (const [key, recipients] of Object.entries(
      store.getState().unsentShares
    )) {
      const spec = specs.find((candidate) => candidate.key === key)
      const endsAt = spec ? spec.endsAt : deps.shareEndsAt?.(key)
      for (const [inboxId, entry] of Object.entries(recipients))
        if (
          endsAt === undefined ||
          endsAt <= now ||
          (!spec && (entry.reason !== 'gone' || activeBuddy(inboxId)))
        )
          unsentChanges.push([key, inboxId, null])
    }
    if (unsentChanges.length > 0) setUnsent(unsentChanges)
    for (const reason of ['suspended', 'gone'] as const)
      if (notSent[reason].size > 0)
        deps.onSharesNotSent?.({ reason, names: [...notSent[reason]] })
    await pruneSharedPhotos(me, specs)
    if (failure) throw failure
  }

  /** The buddy whose incoming slot delivered an event, if still active. */
  function senderOf(me: BuddyIdentity, slotId: string): Buddy | undefined {
    return store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'active' &&
          pairKeys(me, candidate).incoming.slotId === slotId
      )
  }

  function openEvent(
    me: BuddyIdentity,
    buddy: Buddy,
    event: RelaySyncResponse['events'][number]
  ): unknown {
    return decode(
      open(
        pairKeys(me, buddy).incoming.contentKey,
        event.blob,
        aad.event(me.inboxId, event.slotId, event.eventId)
      )
    )
  }

  function applyShareEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    const action = event.kind.split('.')[1]
    try {
      const body = openEvent(me, buddy, event)
      const source = { id: event.eventId, seq: event.seq }
      if (event.kind === 'share.reply') {
        applyReply(buddy, source, shareReplySchema.parse(body))
      } else if (action === 'cancel') {
        const cancel = shareCancelSchema.parse(body)
        applyCancel(buddy, source, cancel)
      } else if (action === 'invite' || action === 'update') {
        const invite = shareInviteSchema.parse(body)
        if (invite.type !== shareTypeOfKind(event.kind)) return
        applyInvite(buddy, source, invite)
      }
    } catch {
      // Undecryptable or malformed events are dropped.
    }
  }

  function applyInvite(buddy: Buddy, source: EventSource, invite: ShareInvite) {
    const expiresAt = Math.max(invite.expiresAt, invite.keepUntil ?? 0)
    if (expiresAt <= deps.now()) return
    const key = incomingShareKey(buddy.inboxId, invite.id)
    const existing = store.getState().incomingShares[key]
    if (existing && existing.rev >= invite.rev) return
    const reopened = !existing || existing.status === 'cancelled'
    const changed =
      reopened ||
      JSON.stringify(existing.details) !== JSON.stringify(invite.details)
    const share: IncomingShare = {
      from: buddy.inboxId,
      shareId: invite.id,
      type: invite.type,
      rev: invite.rev,
      details: invite.details,
      expiresAt,
      receivedAt: deps.now(),
      status: reopened ? 'pending' : existing.status,
      unsentReplyRev: reopened ? undefined : existing.unsentReplyRev,
      alertSeqs: [...(existing?.alertSeqs ?? []), source.seq].slice(
        -MAX_ALERT_SEQS
      ),
    }
    store.setState((state) => ({
      incomingShares: { ...state.incomingShares, [key]: share },
      // Being invited that day answers this User's request to join.
      askedToJoin:
        invite.type === 'plan'
          ? Object.fromEntries(
              Object.entries(state.askedToJoin).filter(
                ([, request]) =>
                  request.to !== buddy.inboxId || request.d !== invite.details.d
              )
            )
          : state.askedToJoin,
    }))
    // A change to a Plan that has happened isn't news: it's history by then.
    if (!changed || hasSharedEventEnded(share, deps.now())) return
    // A change to an invitation not yet seen is still news of an invitation.
    const unseenInvite = store
      .getState()
      .notifications.some(
        (n) => n.shareKey === key && n.kind === 'shareInvite' && !n.read
      )
    // One entry per share: the latest invite or change replaces older ones.
    store.setState((state) => ({
      notifications: state.notifications.filter(
        (n) => n.shareKey !== key || n.kind === 'shareReply'
      ),
    }))
    notify({
      ...source,
      kind: reopened || unseenInvite ? 'shareInvite' : 'shareUpdate',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: key,
      shareType: invite.type,
    })
  }

  function applyCancel(
    buddy: Buddy,
    source: EventSource,
    { id: shareId, rev, removed }: ShareCancel
  ) {
    const key = incomingShareKey(buddy.inboxId, shareId)
    const existing = store.getState().incomingShares[key]
    // A cancel wins a tie with the invite it follows.
    if (!existing || existing.rev > rev || existing.status === 'cancelled')
      return
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: { ...existing, rev, status: 'cancelled', cancelledRev: rev },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
    // An answer given before doesn't carry over if they invite again, on any
    // of this User's devices.
    if (store.getState().answerMarks[key])
      markAnswer(key, { s: 'none', v: rev, r: 0, x: existing.expiresAt })
    // Taken off an invitation they hadn't accepted: it just goes away, along
    // with any alert still showing for it.
    if (removed && existing.status !== 'going') {
      if (existing.alertSeqs?.length) deps.dismissAlerts?.(existing.alertSeqs)
      return
    }
    if (hasSharedEventEnded(existing, deps.now())) return
    notify({
      ...source,
      kind: 'shareCancel',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: key,
      shareType: existing.type,
    })
  }

  function applyReply(
    buddy: Buddy,
    source: EventSource,
    reply: { id: string; rev: number; status: ShareReply }
  ) {
    const previous = store.getState().shareReplies[reply.id]?.[buddy.inboxId]
    if (previous && previous.rev >= reply.rev) return
    const share = Object.values(store.getState().outgoingShares).find(
      (candidate) => candidate.shareId === reply.id
    )
    store.setState((state) => ({
      shareReplies: {
        ...state.shareReplies,
        [reply.id]: {
          ...state.shareReplies[reply.id],
          [buddy.inboxId]: {
            status: reply.status,
            rev: reply.rev,
            at: deps.now(),
          },
        },
      },
      notifications: state.notifications.filter(
        (n) =>
          !(
            n.kind === 'shareReply' &&
            n.shareKey === reply.id &&
            n.from === buddy.inboxId
          )
      ),
    }))
    notify({
      ...source,
      kind: 'shareReply',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: reply.id,
      shareType: share?.type,
      reply: reply.status,
    })
  }

  /**
   * Answers a buddy's invitation; "going" is what adds the linked Plan. The
   * answer is saved first, so it holds offline, and sent when the relay is
   * reachable — now or on a later sync. With `holdMs` it waits that long first,
   * so the User can still change it; answering again restarts the wait.
   */
  async function replyToShare(
    key: string,
    status: ShareReply,
    { holdMs = 0 }: { holdMs?: number } = {}
  ) {
    const share = store.getState().incomingShares[key]
    if (!share || share.status === 'cancelled') return
    const now = deps.now()
    // Over: it can still be looked at, but not answered.
    if (hasSharedEventEnded(share, now)) return
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: {
          ...share,
          status,
          unsentReplyRev: now,
          replySendAt: holdMs > 0 ? now + holdMs : undefined,
        },
      },
      notifications: state.notifications.map((n) =>
        n.shareKey === key ? { ...n, read: true } : n
      ),
    }))
    // This User's other devices show it too; this one sends it.
    markAnswer(key, { s: status, v: share.rev, r: now, x: share.expiresAt })
    markNotifications(
      store
        .getState()
        .notifications.filter((n) => n.shareKey === key)
        .map((n) => n.id),
      'read'
    )
    if (holdMs > 0) return
    await deliverReplies().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Sends held answers now, e.g. as the app leaves the foreground. */
  async function sendHeldReplies() {
    store.setState((state) => ({
      incomingShares: Object.fromEntries(
        Object.entries(state.incomingShares).map(([key, share]) => [
          key,
          share.replySendAt === undefined
            ? share
            : { ...share, replySendAt: undefined },
        ])
      ),
    }))
    await deliverReplies()
  }

  /** Sends the answers that haven't reached their buddy yet and are due. */
  function deliverReplies(): Promise<void> {
    return outbox('replies', sendReplies)
  }

  async function sendReplies() {
    const now = deps.now()
    const unsent = Object.entries(store.getState().incomingShares).filter(
      ([, share]) =>
        share.unsentReplyRev !== undefined &&
        (share.replySendAt === undefined || share.replySendAt <= now)
    )
    if (unsent.length === 0) return
    const me = await ensureInbox()
    const markSent = (key: string, rev: number) =>
      store.setState((state) => {
        const current = state.incomingShares[key]
        // A newer answer given meanwhile still needs sending.
        if (current?.unsentReplyRev !== rev) return state
        return {
          incomingShares: {
            ...state.incomingShares,
            [key]: {
              ...current,
              unsentReplyRev: undefined,
              replySendAt: undefined,
            },
          },
        }
      })
    let failure: unknown = null
    for (const [key, share] of unsent) {
      const rev = share.unsentReplyRev!
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === share.from && b.status === 'active')
      if (
        !buddy ||
        share.status === 'pending' ||
        share.status === 'cancelled'
      ) {
        markSent(key, rev)
        continue
      }
      // Stays unsent until the hourly budget allows; retried on every sync.
      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        await sendEvent(
          me,
          buddy,
          'share.reply',
          { v: 1, id: share.shareId, rev, status: share.status },
          true,
          // A retry of this answer is the same event: one alert, however sent.
          eventIdFor('reply', me.inboxId, buddy.inboxId, share.shareId, rev)
        )
        spendShareBudget(buddy.inboxId)
        markSent(key, rev)
      } catch (error) {
        if (isRelayError(error, 'gone')) forgetBuddy(buddy.inboxId)
        else failure ??= error
      }
    }
    if (failure) throw failure
  }

  /** Stable per buddy and Plan, so asking again for the same Plan is a no-op. */
  function joinRequestIdFor(
    me: BuddyIdentity,
    to: string,
    d: string,
    s: number | undefined
  ): string {
    return toB64u(
      sha256(
        utf8(`ww-buddies/v1/join|${me.inboxId}|${to}|${d}|${s ?? ''}`)
      ).slice(0, 16)
    )
  }

  /**
   * Asks a buddy to invite this User to their Plan, as seen on their Buddy
   * Card. Saved first, so it holds offline, and sent now or on a later sync.
   * The buddy answers by inviting, or not at all: nothing tells this User a
   * request was passed over, and it lapses when the Plan starts. Only the first
   * ask for a Plan alerts the buddy; asking again after withdrawing arrives
   * quietly.
   */
  async function askToJoin(
    to: string,
    d: string,
    plan: BuddyCardDay['p'][number],
    expiresAt: number
  ) {
    if (expiresAt - deps.now() < JOIN_REQUEST_LEAD_MS) return
    const me = await ensureInbox()
    const id = joinRequestIdFor(me, to, d, plan.s)
    store.setState((state) => {
      const existing = state.askedToJoin[id]
      if (existing && !existing.withdrawn) return state
      const open = Object.values(state.askedToJoin).filter(
        (request) => request.to === to && !request.withdrawn
      )
      if (open.length >= MAX_OPEN_JOIN_REQUESTS) return state
      const rev = nextRev(existing)
      return {
        askedToJoin: {
          ...state.askedToJoin,
          [id]: existing
            ? { ...existing, withdrawn: undefined, rev }
            : {
                to,
                id,
                d,
                ...(plan.s === undefined ? {} : { s: plan.s }),
                m: plan.m,
                expiresAt,
                askedAt: rev,
                rev,
                attempted: false,
                pushed: false,
              },
        },
      }
    })
    await deliverJoinRequests().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Always newer than the last ask or withdrawal, even within a millisecond. */
  function nextRev(request: OutgoingJoinRequest | undefined) {
    return Math.max(deps.now(), (request?.rev ?? 0) + 1)
  }

  /** Takes back a request; the buddy's tray drops it quietly. */
  async function withdrawJoinRequest(id: string) {
    withdrawJoinRequests([id])
    await deliverJoinRequests().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Marks requests withdrawn, keeping them until they lapse. */
  function withdrawJoinRequests(ids: string[]) {
    store.setState((state) => {
      const askedToJoin = { ...state.askedToJoin }
      for (const id of ids) {
        const request = askedToJoin[id]
        if (request && !request.withdrawn)
          askedToJoin[id] = {
            ...request,
            withdrawn: true,
            rev: nextRev(request),
          }
      }
      return { askedToJoin }
    })
  }

  /**
   * Whether sending this request alerts the buddy: only its first ask, or a
   * retry of that same ask, and only `JOIN_REQUEST_ALERTS_PER_DAY` requests per
   * buddy a day. An ask whose alert may already have landed, then was withdrawn
   * and asked again, goes quietly.
   */
  function shouldAlert(request: OutgoingJoinRequest): boolean {
    if (request.pushed) return false
    if (request.alertRev !== undefined) return request.alertRev === request.rev
    const since = deps.now() - DAY_MS
    const alerted = Object.values(store.getState().askedToJoin).filter(
      (other) =>
        other.to === request.to &&
        other.id !== request.id &&
        other.alertRev !== undefined &&
        other.alertRev > since
    )
    return alerted.length < JOIN_REQUEST_ALERTS_PER_DAY
  }

  /**
   * Sends requests and withdrawals that haven't reached their buddy yet, one
   * delivery at a time, so asking, withdrawing, and syncing can't race.
   */
  function deliverJoinRequests(): Promise<void> {
    const run = joinDelivery.then(sendJoinRequests)
    joinDelivery = run.catch(() => {
      // The caller sees the failure; the queue moves on.
    })
    return run
  }

  async function sendJoinRequests() {
    const waiting = Object.values(store.getState().askedToJoin).filter(
      (request) => request.sentRev !== request.rev
    )
    if (waiting.length === 0) return
    const me = await ensureInbox()
    const update = (
      id: string,
      change: (current: OutgoingJoinRequest) => Partial<OutgoingJoinRequest>
    ) =>
      store.setState((state) => {
        const current = state.askedToJoin[id]
        if (!current) return state
        return {
          askedToJoin: {
            ...state.askedToJoin,
            [id]: { ...current, ...change(current) },
          },
        }
      })
    // A newer ask or withdrawal made meanwhile still needs sending.
    const markSent = (id: string, rev: number) =>
      update(id, (current) => (current.rev === rev ? { sentRev: rev } : {}))
    let failure: unknown = null
    for (const waitingRequest of waiting) {
      let request = waitingRequest
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === request.to && b.status === 'active')
      if (!buddy) {
        store.setState((state) => ({
          askedToJoin: omitKey(state.askedToJoin, request.id),
        }))
        continue
      }
      // Still unsent this close to the start: too late to be any use, so
      // it's taken back (quietly, in case an earlier try landed).
      if (
        !request.withdrawn &&
        request.expiresAt - deps.now() < JOIN_REQUEST_LEAD_MS
      ) {
        withdrawJoinRequests([request.id])
        request = store.getState().askedToJoin[request.id]
      }
      // Never reached the relay: there's nothing to take back.
      if (request.withdrawn && !request.attempted) {
        markSent(request.id, request.rev)
        continue
      }
      // Waits for the hourly budget; retried on every sync.
      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        if (request.withdrawn) {
          const cancel = { v: 1, id: request.id, rev: request.rev }
          await sendEvent(me, buddy, JOIN_CANCEL_KIND, cancel, false)
        } else {
          const alert = shouldAlert(request)
          const eventId = alert ? (request.alertEventId ?? newId()) : newId()
          // Recorded first: a send that seems to fail may still have landed,
          // and a retry of the alert reuses its event id.
          update(request.id, () => ({
            attempted: true,
            ...(alert ? { alertEventId: eventId, alertRev: request.rev } : {}),
          }))
          const { slotId } = pairKeys(me, buddy).outgoing
          await sendEvent(
            me,
            buddy,
            joinRequestKind(slotId),
            {
              v: 1,
              id: request.id,
              rev: request.rev,
              d: request.d,
              ...(request.s === undefined ? {} : { s: request.s }),
              m: request.m,
              expiresAt: request.expiresAt,
            },
            alert,
            eventId
          )
          if (alert) update(request.id, () => ({ pushed: true }))
        }
        spendShareBudget(buddy.inboxId)
        markSent(request.id, request.rev)
      } catch (error) {
        if (isRelayError(error, 'gone')) forgetBuddy(buddy.inboxId)
        else failure ??= error
      }
    }
    if (failure) throw failure
  }

  function applyJoinEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    try {
      const body = openEvent(me, buddy, event)
      if (event.kind === JOIN_CANCEL_KIND) {
        const cancel = shareCancelSchema.parse(body)
        const key = incomingJoinRequestKey(buddy.inboxId, cancel.id)
        const existing = store.getState().joinRequests[key]
        // A withdrawal wins a tie with the request it follows.
        if (!existing || existing.rev > cancel.rev) return
        // Kept until it lapses, so asking again is listed quietly.
        store.setState((state) => ({
          joinRequests: {
            ...state.joinRequests,
            [key]: { ...existing, rev: cancel.rev, withdrawn: true },
          },
          notifications: state.notifications.filter((n) => n.shareKey !== key),
        }))
        return
      }
      const request = joinRequestSchema.parse(body)
      // The Plan's start here, whatever the asker's clock says: a request
      // lapses by then (a day's slack for time zones) and can't reach past
      // the Buddy Card's window.
      const start = moment(request.d, 'YYYY-MM-DD')
        .startOf('day')
        .add(request.s ?? DEFAULT_START_TIME_IN_MINUTES, 'minutes')
        .valueOf()
      const expiresAt = Math.min(request.expiresAt, start + DAY_MS)
      if (expiresAt <= deps.now()) return
      if (start > deps.now() + (BUDDY_CARD_HORIZON_DAYS + 1) * DAY_MS) return
      const key = incomingJoinRequestKey(buddy.inboxId, request.id)
      const existing = store.getState().joinRequests[key]
      if (existing && existing.rev >= request.rev) return
      store.setState((state) => ({
        joinRequests: {
          ...state.joinRequests,
          [key]: {
            from: buddy.inboxId,
            id: request.id,
            rev: request.rev,
            d: request.d,
            ...(request.s === undefined ? {} : { s: request.s }),
            ...(request.m === undefined ? {} : { m: request.m }),
            expiresAt,
            receivedAt: existing?.receivedAt ?? deps.now(),
            ...(existing?.dismissed ? { dismissed: true } : {}),
          },
        },
      }))
      // Listed once; a request this User passed over stays quiet, and one
      // asked again after a withdrawal comes back already read.
      if (existing && !existing.withdrawn) return
      if (existing?.dismissed) return
      notify(
        {
          id: event.eventId,
          seq: event.seq,
          kind: 'joinRequest',
          from: buddy.inboxId,
          name: buddy.name,
          shareKey: key,
        },
        // Alerts off for this buddy: listed, but it doesn't call for attention.
        !!existing || !alertsFor(buddy.inboxId).joinRequests
      )
    } catch {
      // Undecryptable or malformed events are dropped.
    }
  }

  /**
   * Not Now: clears a buddy's request here without telling them. It lapses on
   * their side when the Plan starts, like any request not answered.
   */
  function dismissJoinRequest(key: string) {
    const request = store.getState().joinRequests[key]
    if (!request) return
    const entries = store
      .getState()
      .notifications.filter((n) => n.shareKey === key)
      .map((n) => n.id)
    store.setState((state) => ({
      joinRequests: {
        ...state.joinRequests,
        [key]: { ...request, dismissed: true },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
    markNotifications(entries, 'dismissed')
  }

  /** A request is answered once this User invites the buddy to a Plan that day. */
  function resolveJoinRequests(specs: OutgoingShareSpec[]) {
    const answered = Object.entries(store.getState().joinRequests)
      .filter(([, request]) =>
        specs.some(
          (spec) =>
            spec.type === 'plan' &&
            spec.details.d === request.d &&
            spec.recipients.includes(request.from)
        )
      )
      .map(([key]) => key)
    if (answered.length === 0) return
    store.setState((state) => ({
      joinRequests: Object.fromEntries(
        Object.entries(state.joinRequests).filter(
          ([key]) => !answered.includes(key)
        )
      ),
      notifications: state.notifications.filter(
        (n) => n.kind !== 'joinRequest' || !answered.includes(n.shareKey ?? '')
      ),
    }))
  }

  /**
   * Push kinds for join requests from each active buddy whose requests may
   * alert this device; left out of the push registration otherwise.
   */
  async function joinRequestPushKinds(): Promise<JoinRequestPushKind[]> {
    const { buddies } = store.getState()
    const alerting = buddies.filter(
      (buddy) =>
        buddy.status === 'active' && alertsFor(buddy.inboxId).joinRequests
    )
    if (alerting.length === 0) return []
    const me = await identity()
    return alerting.map((buddy) =>
      joinRequestKind(pairKeys(me, buddy).incoming.slotId)
    )
  }

  /**
   * Stable per buddy and set of badges, so the same news sent again (a retry,
   * or another of this User's devices) is the same event, which the relay never
   * alerts for twice.
   */
  function badgeEventId(
    me: BuddyIdentity,
    to: string,
    badges: readonly SharedBadge[]
  ): string {
    const keys = badges.map(sharedBadgeKey).sort().join(',')
    return toB64u(
      sha256(utf8(`ww-buddies/v1/badge|${me.inboxId}|${to}|${keys}`)).slice(
        0,
        16
      )
    )
  }

  /**
   * Tells buddies about badges this User just earned: each collection's new
   * level, batched into one `badge.new` per buddy. One-time Badges stay quiet
   * (a first Bible study is personal, and a first buddy already knows). Saved
   * first, so it holds offline, and sent now or on a later sync for up to a
   * week. Only buddies active now hear about it; anyone paired later sees the
   * badges on the Buddy Card.
   */
  async function announceBadges(keys: readonly BadgeKey[]) {
    // Buddies hidden or stopped here (its flag turned off, say): no news.
    if (!(deps.isEnabled?.() ?? true)) return
    const best = new Map<string, SharedBadge>()
    for (const key of keys) {
      const parsed = parseBadgeKey(key)
      if (!parsed?.level) continue
      const held = best.get(parsed.art)
      if (!held || (held.l ?? 0) < parsed.level)
        best.set(parsed.art, { c: parsed.art, l: parsed.level })
    }
    if (best.size === 0 || sharingPaused()) return
    const state = store.getState()
    // Buddies never started here: no one to tell, and no seed to create.
    if (state.registeredInboxId === null) return
    const recipients = state.buddies
      .filter((buddy) => buddy.status === 'active' && badgesGoTo(buddy))
      .map((buddy) => buddy.inboxId)
    if (recipients.length === 0) return
    const badges = sortedForAnnouncement([...best.values()])
    const id = badges.map(sharedBadgeKey).sort().join(',')
    if (state.badgeAnnouncements.some((announcement) => announcement.id === id))
      return
    store.setState((current) => ({
      badgeAnnouncements: [
        ...current.badgeAnnouncements,
        {
          id,
          badges,
          createdAt: deps.now(),
          recipients,
          sent: {},
          alerted: {},
        },
      ].slice(-MAX_BADGE_ANNOUNCEMENTS),
    }))
    await deliverBadgeAnnouncements().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Forgets badge news not yet sent, once badges or sharing them is off. */
  function dropBadgeAnnouncements() {
    if (store.getState().badgeAnnouncements.length > 0)
      store.setState({ badgeAnnouncements: [] })
  }

  /**
   * Drops badge news that's delivered, a week old, or no longer shared with
   * anyone it's still owed to.
   */
  function pruneBadgeAnnouncements() {
    const now = deps.now()
    const { badgeAnnouncements, buddies } = store.getState()
    const owed = (inboxId: string) => {
      const buddy = buddies.find((b) => b.inboxId === inboxId)
      return !!buddy && badgesGoTo(buddy)
    }
    const kept = badgeAnnouncements.filter(
      (announcement) =>
        announcement.createdAt + BADGE_ANNOUNCEMENT_TTL_MS > now &&
        announcement.recipients.some((id) => !announcement.sent[id] && owed(id))
    )
    if (kept.length !== badgeAnnouncements.length)
      store.setState({ badgeAnnouncements: kept })
  }

  /** Sends badge news still owed to buddies, one delivery at a time. */
  function deliverBadgeAnnouncements(): Promise<void> {
    const run = badgeDelivery.then(sendBadgeAnnouncements)
    badgeDelivery = run.catch(() => {
      // The caller sees the failure; the queue moves on.
    })
    return run
  }

  /**
   * Delivers badge news and reactions again once `at` passes, if a timer is
   * available.
   */
  function retryBadgesAt(at: number) {
    if (!deps.later || (badgeRetryAt !== null && badgeRetryAt <= at)) return
    badgeRetryAt = at
    deps.later(
      () => {
        if (badgeRetryAt === at) badgeRetryAt = null
        void deliverBadgeAnnouncements().catch(() => {
          // Retried on the next sync.
        })
        void deliverBadgeReactions().catch(() => {
          // Retried on the next sync.
        })
      },
      Math.max(0, at - deps.now())
    )
  }

  async function sendBadgeAnnouncements() {
    pruneBadgeAnnouncements()
    if (store.getState().badgeAnnouncements.length === 0) return
    // Kept, but not sent, while Buddies is hidden or stopped here.
    if (!(deps.isEnabled?.() ?? true)) return
    const me = await ensureInbox()
    const current = (id: string) =>
      store.getState().badgeAnnouncements.find((a) => a.id === id)
    const update = (
      id: string,
      change: (announcement: BadgeAnnouncement) => Partial<BadgeAnnouncement>
    ) =>
      store.setState((state) => ({
        badgeAnnouncements: state.badgeAnnouncements.map((announcement) =>
          announcement.id === id
            ? { ...announcement, ...change(announcement) }
            : announcement
        ),
      }))
    let failure: unknown = null
    for (const { id, recipients } of store.getState().badgeAnnouncements) {
      for (const inboxId of recipients) {
        // Read again each time: a send may have ended a pairing meanwhile.
        const announcement = current(id)
        if (
          !announcement ||
          announcement.sent[inboxId] ||
          !announcement.recipients.includes(inboxId)
        )
          continue
        const buddy = store
          .getState()
          .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
        // Waits for the hourly budget, or the pause to end; retried on every
        // sync.
        if (
          !buddy ||
          !badgesGoTo(buddy) ||
          sharingPaused() ||
          !hasShareBudget(inboxId)
        )
          continue
        const lastAlert = store.getState().lastBadgeAlertAt[inboxId]
        const alert =
          !!announcement.alerted[inboxId] ||
          lastAlert === undefined ||
          deps.now() - lastAlert >= BADGE_ALERT_INTERVAL_MS
        // Just alerted them about something else (a reply, an invitation):
        // the relay would drop this alert, so it waits out the spacing rather
        // than spending the day's badge alert on nothing.
        const lastSent = lastAlertSentAt.get(inboxId)
        const sinceLastSent =
          lastSent === undefined ? Infinity : deps.now() - lastSent
        if (
          alert &&
          sinceLastSent >= 0 &&
          sinceLastSent < RELAY_ALERT_SPACING_MS
        ) {
          retryBadgesAt(lastSent! + RELAY_ALERT_SPACING_MS)
          continue
        }
        if (alert && !announcement.alerted[inboxId]) {
          // Recorded first: a send that seems to fail may still have landed,
          // and its retry keeps the alert under the same event id.
          store.setState((state) => ({
            lastBadgeAlertAt: {
              ...state.lastBadgeAlertAt,
              [inboxId]: deps.now(),
            },
          }))
          update(id, (a) => ({ alerted: { ...a.alerted, [inboxId]: true } }))
        }
        try {
          await sendEvent(
            me,
            buddy,
            BADGE_PUSH_KIND,
            { v: 1, badges: announcement.badges },
            alert,
            badgeEventId(me, inboxId, announcement.badges)
          )
          spendShareBudget(inboxId)
          update(id, (a) => ({ sent: { ...a.sent, [inboxId]: true } }))
        } catch (error) {
          if (isRelayError(error, 'gone')) forgetBuddy(inboxId)
          else failure ??= error
        }
      }
    }
    pruneBadgeAnnouncements()
    if (failure) throw failure
  }

  /**
   * A buddy's news of new badges: listed in the tray (already read with badge
   * alerts off here, and not at all with Badges off) and shown on their page
   * until their next Buddy Card, which is the source of truth.
   */
  function applyBadgeEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number],
    /** This device has never synced: everything read is backlog. */
    firstSync: boolean
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    // A sync that reads the inbox from the start again lists nothing twice.
    if (store.getState().seenBadgeEvents[event.eventId] !== undefined) return
    let badges: SharedBadge[]
    try {
      const body = badgeNewSchema.parse(openEvent(me, buddy, event))
      badges = sortedForAnnouncement(knownBadges(body.badges))
    } catch {
      // Undecryptable or malformed events are dropped.
      return
    }
    const now = deps.now()
    store.setState((state) => ({
      seenBadgeEvents: {
        ...Object.fromEntries(
          Object.entries(state.seenBadgeEvents).filter(
            ([, at]) => at + SEEN_BADGE_EVENT_TTL_MS > now
          )
        ),
        [event.eventId]: now,
      },
      buddies:
        badges.length === 0
          ? state.buddies
          : state.buddies.map((b) =>
              b.inboxId === buddy.inboxId
                ? { ...b, badges: withNewBadges(b.badges ?? [], badges) }
                : b
            ),
    }))
    if (badges.length === 0 || !(deps.showBadges?.() ?? true)) return
    // Listed when it happened, not when this device first read it.
    const at = Number.isFinite(event.createdAt)
      ? Math.min(event.createdAt, now)
      : now
    notify(
      {
        id: event.eventId,
        seq: event.seq,
        kind: 'badge',
        from: buddy.inboxId,
        name: buddy.name,
        badges,
        at,
      },
      // Listed, but not calling for attention: badge alerts are off here for
      // them, or it's old news (a day or more, or a new device's whole
      // backlog).
      !alertsFor(buddy.inboxId).badges || firstSync || at <= now - DAY_MS
    )
  }

  /**
   * The badge push kinds (new badges, reactions), while badge alerts are on
   * here, or on for a buddy of their own; the alert stays quiet for buddies
   * with them off (`pushAlerts`).
   */
  function badgePushKinds(): BadgePushKind[] {
    return badgeAlertsOn() ? [BADGE_PUSH_KIND, BADGE_REACTION_PUSH_KIND] : []
  }

  function badgeAlertsOn(): boolean {
    const { badgeNotifications, alertOverrides } = store.getState()
    return (
      (deps.showBadges?.() ?? true) &&
      (badgeNotifications ||
        Object.values(alertOverrides).some((alerts) => alerts.badges))
    )
  }

  /**
   * Stable per buddy, badge, and choice, so a retry (or another of this User's
   * devices sending the same choice) is the same event, which the relay stores
   * once and never alerts for twice.
   */
  function badgeReactionEventId(
    me: BuddyIdentity,
    to: string,
    key: string,
    rev: number
  ): string {
    return toB64u(
      sha256(
        utf8(`ww-buddies/v1/badge-reaction|${me.inboxId}|${to}|${key}|${rev}`)
      ).slice(0, 16)
    )
  }

  /**
   * Reacts to a buddy's badge with one of the preset reactions, replacing this
   * User's earlier reaction to it. Only for an active buddy whose card shows
   * that badge (or a higher level of it). Saved first, so the reaction bar
   * shows it at once and it holds offline, then sent now or on a later sync for
   * up to a week. Sharing one's own badges isn't needed to react to theirs.
   */
  async function reactToBadge(
    inboxId: string,
    badge: SharedBadge,
    emoji: BadgeReactionEmoji
  ) {
    // Buddies hidden or stopped here, or badges off: nothing to react to.
    if (!(deps.isEnabled?.() ?? true) || !(deps.showBadges?.() ?? true)) return
    if (!isBadgeReactionEmoji(emoji)) return
    const [known] = knownBadges([badge])
    const state = store.getState()
    if (!known || state.registeredInboxId === null) return
    const buddy = state.buddies.find(
      (b) => b.inboxId === inboxId && b.status === 'active'
    )
    if (!buddy || !holdsBadge(buddy.badges, known)) return
    const key = sharedBadgeKey(known)
    const existing = state.sentBadgeReactions[inboxId]?.[key]
    if (existing?.e !== emoji) {
      const now = deps.now()
      const reaction: SentBadgeReaction = {
        ...existing,
        e: emoji,
        // Always newer than the last choice, even within a millisecond.
        rev: Math.max(now, (existing?.rev ?? 0) + 1),
        at: now,
      }
      store.setState((current) => ({
        sentBadgeReactions: {
          ...current.sentBadgeReactions,
          [inboxId]: {
            ...current.sentBadgeReactions[inboxId],
            [key]: reaction,
          },
        },
      }))
    }
    await deliverBadgeReactions().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /**
   * Sends reactions that haven't reached their buddy yet. Runs in line with
   * badge news, so the two never race for the relay's alert spacing.
   */
  function deliverBadgeReactions(): Promise<void> {
    const run = badgeDelivery.then(sendBadgeReactions)
    badgeDelivery = run.catch(() => {
      // The caller sees the failure; the queue moves on.
    })
    return run
  }

  async function sendBadgeReactions() {
    const now = deps.now()
    const waiting = Object.entries(store.getState().sentBadgeReactions).flatMap(
      ([inboxId, reactions]) =>
        Object.entries(reactions)
          .filter(
            ([, reaction]) =>
              reaction.sentRev !== reaction.rev &&
              reaction.at + BADGE_ANNOUNCEMENT_TTL_MS > now
          )
          .map(([key]) => ({ inboxId, key }))
    )
    if (waiting.length === 0) return
    // Kept, but not sent, while Buddies is hidden or stopped here.
    if (!(deps.isEnabled?.() ?? true)) return
    const me = await ensureInbox()
    const update = (
      inboxId: string,
      key: string,
      change: (reaction: SentBadgeReaction) => Partial<SentBadgeReaction>
    ) =>
      store.setState((state) => {
        const current = state.sentBadgeReactions[inboxId]?.[key]
        if (!current) return state
        return {
          sentBadgeReactions: {
            ...state.sentBadgeReactions,
            [inboxId]: {
              ...state.sentBadgeReactions[inboxId],
              [key]: { ...current, ...change(current) },
            },
          },
        }
      })
    let failure: unknown = null
    for (const { inboxId, key } of waiting) {
      // Read again each time: a send may have ended a pairing meanwhile.
      const reaction = store.getState().sentBadgeReactions[inboxId]?.[key]
      const parsed = parseBadgeKey(key)
      if (!reaction || !parsed || reaction.sentRev === reaction.rev) continue
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
      // Waits for the hourly budget; retried on every sync.
      if (!buddy || !hasShareBudget(inboxId)) continue
      const { rev } = reaction
      // Reactions have their own allowance, apart from badge news.
      const lastAlert = store.getState().lastBadgeReactionAlertAt[inboxId]
      const alert =
        reaction.alertRev === rev ||
        lastAlert === undefined ||
        deps.now() - lastAlert >= BADGE_ALERT_INTERVAL_MS
      // Just alerted them about something else: the relay would drop this
      // alert, so it waits out the spacing rather than spending the day's
      // reaction alert on nothing.
      const lastSent = lastAlertSentAt.get(inboxId)
      const sinceLastSent =
        lastSent === undefined ? Infinity : deps.now() - lastSent
      if (
        alert &&
        sinceLastSent >= 0 &&
        sinceLastSent < RELAY_ALERT_SPACING_MS
      ) {
        retryBadgesAt(lastSent! + RELAY_ALERT_SPACING_MS)
        continue
      }
      if (alert && reaction.alertRev !== rev) {
        // Recorded first: a send that seems to fail may still have landed,
        // and its retry keeps the alert under the same event id.
        store.setState((state) => ({
          lastBadgeReactionAlertAt: {
            ...state.lastBadgeReactionAlertAt,
            [inboxId]: deps.now(),
          },
        }))
        update(inboxId, key, () => ({ alertRev: rev }))
      }
      try {
        await sendEvent(
          me,
          buddy,
          BADGE_REACTION_PUSH_KIND,
          {
            v: 1,
            badge: parsed.level
              ? { c: parsed.art, l: parsed.level }
              : { c: parsed.art },
            e: reaction.e,
            rev,
          },
          alert,
          badgeReactionEventId(me, inboxId, key, rev)
        )
        spendShareBudget(inboxId)
        // A newer choice made meanwhile still needs sending.
        update(inboxId, key, (current) =>
          current.rev === rev ? { sentRev: rev } : {}
        )
      } catch (error) {
        if (isRelayError(error, 'gone')) forgetBuddy(inboxId)
        else failure ??= error
      }
    }
    if (failure) throw failure
  }

  /**
   * A buddy's reaction to one of this User's badges: kept, the newest per buddy
   * and badge, for that badge's view, and listed in the tray in place of their
   * earlier reaction to it (already read with badge alerts off here, or when
   * old). Ignored with badges off here, and for a badge this User doesn't
   * have.
   */
  function applyBadgeReactionEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number],
    /** This device has never synced: everything read is backlog. */
    firstSync: boolean
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    let body: { badge: SharedBadge; e: BadgeReactionEmoji; rev: number }
    try {
      const parsed = badgeReactionSchema.parse(openEvent(me, buddy, event))
      const [badge] = knownBadges([parsed.badge])
      if (!badge) return
      body = { ...parsed, badge }
    } catch {
      // Undecryptable or malformed events are dropped.
      return
    }
    if (!(deps.showBadges?.() ?? true)) return
    if (!holdsBadge(deps.getProfile().badges, body.badge)) return
    const key = sharedBadgeKey(body.badge)
    const existing = store.getState().badgeReactions[key]?.[buddy.inboxId]
    // Read before (the inbox read from the start again), or an older choice.
    if (existing && existing.rev >= body.rev) return
    const now = deps.now()
    const at = Number.isFinite(event.createdAt)
      ? Math.min(event.createdAt, now)
      : now
    // The same reaction again (from another of their devices) isn't news.
    const same = existing !== undefined && existing.e === body.e
    store.setState((state) => ({
      badgeReactions: {
        ...state.badgeReactions,
        [key]: {
          ...state.badgeReactions[key],
          [buddy.inboxId]: {
            e: body.e,
            at: same ? existing.at : at,
            rev: body.rev,
          },
        },
      },
      // One entry per buddy and badge: a new reaction replaces the last.
      notifications: same
        ? state.notifications
        : state.notifications.filter(
            (n) =>
              !(
                n.kind === 'badgeReaction' &&
                n.from === buddy.inboxId &&
                n.badges?.some((b) => sharedBadgeKey(b) === key)
              )
          ),
    }))
    if (same) return
    notify(
      {
        id: event.eventId,
        seq: event.seq,
        kind: 'badgeReaction',
        from: buddy.inboxId,
        name: buddy.name,
        badges: [body.badge],
        reaction: body.e,
        at,
      },
      // Listed, but not calling for attention: badge alerts are off here for
      // them, or it's old news (a day or more, or a new device's whole
      // backlog).
      !alertsFor(buddy.inboxId).badges || firstSync || at <= now - DAY_MS
    )
  }

  function markNotificationsRead() {
    const unread = store
      .getState()
      .notifications.filter((n) => !n.read)
      .map((n) => n.id)
    if (unread.length === 0) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.read ? n : { ...n, read: true }
      ),
    }))
    markNotifications(unread, 'read')
  }

  /**
   * Seen in the tray, here and on this User's other devices. A later change to
   * a seen invitation then reads as a change rather than a new invitation.
   */
  function markNotificationRead(id: string) {
    const entry = store.getState().notifications.find((n) => n.id === id)
    if (!entry || entry.read) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
    markNotifications([id], 'read')
  }

  /**
   * Removes a queue entry, here and on this User's other devices, except a
   * request still waiting on an answer: the tray is where it's answered, and
   * answering is what clears it.
   */
  function dismissNotification(id: string) {
    const state = store.getState()
    const entry = state.notifications.find((n) => n.id === id)
    if (!entry || awaitsAnswer(entry, state, deps.now())) return
    if (entry.kind === 'joinRequest' && entry.shareKey) {
      dismissJoinRequest(entry.shareKey)
      return
    }
    store.setState((current) => ({
      notifications: current.notifications.filter((n) => n.id !== id),
    }))
    markNotifications([id], 'dismissed')
  }

  /**
   * The id buddies know one of this User's shares by. Renders read it, so it
   * never waits on the seed; empty before Buddies has started here.
   */
  function shareIdForKey(key: string): string {
    const inboxId = knownInboxId()
    return inboxId ? shareIdFor(inboxId, key) : ''
  }

  function readRoster(me: BuddyIdentity, blob: string): Roster | null {
    try {
      return rosterSchema.parse(
        decode(open(me.rosterKey, blob, aad.roster(me.inboxId)))
      )
    } catch {
      // A roster from another identity or a corrupt blob is ignored.
      return null
    }
  }

  /**
   * A roster older than the newest this device has read or written: a replay,
   * or a write from a device that hadn't synced. One without a `version` comes
   * from an older build and is merged; local tombstones still win over it.
   */
  function isStaleRoster(roster: Roster): boolean {
    return (
      roster.version !== undefined &&
      roster.version < store.getState().rosterVersion
    )
  }

  /**
   * Folds another device's roster into local state. Relationships union, and
   * removals win: ended pairings and closed invites carry tombstones, which
   * union too, and a removed buddy's slot is gone from the inbox. Lapsed
   * invites and claims are dropped. The later sharing choice wins. Returns the
   * buddies this device didn't know about.
   */
  function mergeRoster(me: BuddyIdentity, remote: Roster): string[] {
    const state = store.getState()
    const now = deps.now()
    const closedInviteIds = {
      ...remote.closedInviteIds,
      ...state.closedInviteIds,
    }
    const removedBuddies = mergeRemovedBuddies(
      state.removedBuddies,
      remote.removedBuddies
    )
    const ended = (buddy: Buddy) => pairingEnded(removedBuddies, buddy)
    const sharing = mergeSharing(state.sharing, remote.sharing)
    const known = new Set(state.buddies.map((b) => b.inboxId))
    const usedColors = new Set(state.buddies.map((b) => b.colorIndex))
    const added: Buddy[] = []
    for (const { showOnCalendar, overrides, ...buddy } of remote.buddies) {
      if (
        known.has(buddy.inboxId) ||
        buddy.inboxId === me.inboxId ||
        isPendingRemoval(buddy.inboxId) ||
        ended(buddy)
      )
        continue
      const colorIndex = usedColors.has(buddy.colorIndex)
        ? nextColorIndex(usedColors)
        : buddy.colorIndex
      usedColors.add(colorIndex)
      const own = rosterOverrides({ showOnCalendar, overrides }, sharing, {})
      added.push({ ...buddy, colorIndex, ...(own && { overrides: own }) })
    }
    // Another of this User's devices ended these pairings.
    const endedHere = state.buddies.filter(ended)
    // Invitations of this device's that never reached them say so, while
    // they're still listed to name. Quietly: the User may have ended it there.
    for (const buddy of endedHere) noteUnsentTo(buddy.inboxId)
    const buddies = [
      ...state.buddies
        .filter((local) => !ended(local))
        .map((local): Buddy => {
          const theirs = remote.buddies.find((b) => b.inboxId === local.inboxId)
          // Another device already applied this pairing's confirmation.
          const confirmed =
            local.status === 'awaitingConfirm' &&
            theirs?.status === 'active' &&
            theirs.inviteSecret === local.inviteSecret
              ? {
                  ...local,
                  name: theirs.name,
                  tenure: theirs.tenure,
                  status: 'active' as const,
                  expiresAt: undefined,
                }
              : local
          // A nickname, color, or setting of their own made later on another
          // device.
          return theirs?.prefsAt !== undefined &&
            theirs.prefsAt > (local.prefsAt ?? 0)
            ? {
                ...confirmed,
                nickname: theirs.nickname,
                color: theirs.color,
                overrides: rosterOverrides(theirs, sharing, local.overrides),
                prefsAt: theirs.prefsAt,
              }
            : confirmed
        }),
      ...added,
    ]
    const isOpen = (invite: { inviteId: string; expiresAt: number }) =>
      !(invite.inviteId in closedInviteIds) && invite.expiresAt > now
    store.setState({
      buddies,
      // Buddies restored from another device means Buddies is already set up.
      onboardingComplete: state.onboardingComplete || buddies.length > 0,
      outgoingInvites: unionBy(
        state.outgoingInvites,
        remote.outgoingInvites,
        (invite) => invite.inviteId
      ).filter(isOpen),
      incomingClaims: unionBy(
        state.incomingClaims,
        remote.incomingClaims,
        (claim) => claim.inviteId
      ).filter(
        (claim) =>
          isOpen(claim) && !buddies.some((b) => b.inboxId === claim.inboxId)
      ),
      closedInviteIds,
      // A tombstone a newer pairing replaced has done its job.
      removedBuddies: Object.fromEntries(
        Object.entries(removedBuddies).filter(
          ([inboxId, removedAt]) =>
            !buddies.some(
              (b) => b.inboxId === inboxId && b.pairedAt > removedAt
            )
        )
      ),
      rosterVersion: Math.max(state.rosterVersion, remote.version ?? 0),
      sharing,
      cardName: adoptCardName(state, remote.card),
      answerMarks: mergeAnswerMarks(state.answerMarks, remote.answers, now),
      notificationMarks: mergeNotificationMarks(
        state.notificationMarks,
        { read: remote.read, dismissed: remote.dismissed },
        now
      ),
    })
    applyMarks()
    // Withdraw their slots from here too, in case that device can't finish.
    if (endedHere.length > 0) queueRemoval(endedHere)
    return added.map((b) => b.inboxId)
  }

  /**
   * Brings this device in line with what this User did on any of their devices:
   * answers to invitations, and queue entries read or dismissed. A mark can
   * arrive before what it's about, so this runs again after events. Another
   * device's answer is sent by that device; one waiting to be sent here is
   * dropped when the other is newer.
   */
  function applyMarks() {
    const state = store.getState()
    const { answerMarks, notificationMarks } = state
    let incomingShares = state.incomingShares
    const answered = new Set<string>()
    for (const [key, mark] of Object.entries(answerMarks)) {
      const share = incomingShares[key]
      if (!share || !answerApplies(share, mark)) continue
      const superseded =
        share.unsentReplyRev !== undefined && mark.r > share.unsentReplyRev
      if (share.status === mark.s && !superseded) continue
      answered.add(key)
      incomingShares = {
        ...incomingShares,
        [key]: {
          ...share,
          status: mark.s,
          ...(share.unsentReplyRev === undefined || superseded
            ? { unsentReplyRev: undefined, replySendAt: undefined }
            : {}),
        },
      }
    }
    const { read, dismissed } = notificationMarks
    const answerState = { incomingClaims: state.incomingClaims, incomingShares }
    const now = deps.now()
    // Not Now on another device: the request stays quiet here too.
    const passedOver = new Set(
      state.notifications
        .filter(
          (n) => n.id in dismissed && n.kind === 'joinRequest' && !!n.shareKey
        )
        .map((n) => n.shareKey!)
    )
    const notifications = state.notifications
      .filter(
        (n) =>
          !(n.id in dismissed) ||
          // Answering is what clears a request still waiting on an answer.
          awaitsAnswer(n, answerState, now)
      )
      .filter((n) => !n.shareKey || !passedOver.has(n.shareKey))
      .map((n) =>
        !n.read &&
        (n.id in read ||
          n.id in dismissed ||
          (n.shareKey !== undefined &&
            n.kind !== 'shareReply' &&
            answered.has(n.shareKey)))
          ? { ...n, read: true }
          : n
      )
    let joinRequests = state.joinRequests
    for (const key of passedOver) {
      const request = joinRequests[key]
      if (request && !request.dismissed)
        joinRequests = {
          ...joinRequests,
          [key]: { ...request, dismissed: true },
        }
    }
    const changed =
      incomingShares !== state.incomingShares ||
      joinRequests !== state.joinRequests ||
      notifications.length !== state.notifications.length ||
      notifications.some((n, index) => n !== state.notifications[index])
    if (changed) store.setState({ incomingShares, notifications, joinRequests })
  }

  /**
   * Records answers, reads, and dismissals for this User's other devices.
   * Lapsed marks go, and only as many as the roster carries are kept.
   */
  function markAnswer(key: string, mark: AnswerMark) {
    const now = deps.now()
    store.setState((state) => ({
      answerMarks: mergeAnswerMarks(state.answerMarks, { [key]: mark }, now),
    }))
    saveRosterSoon()
  }

  function markNotifications(ids: string[], how: 'read' | 'dismissed') {
    if (ids.length === 0) return
    const now = deps.now()
    const stamps = Object.fromEntries(
      ids.map((id) => [id, now + NOTIFICATION_MARK_TTL_MS])
    )
    store.setState((state) => ({
      notificationMarks: mergeNotificationMarks(
        state.notificationMarks,
        how === 'read'
          ? { read: stamps, dismissed: {} }
          : { read: {}, dismissed: stamps },
        now
      ),
    }))
    saveRosterSoon()
  }

  /**
   * Wipes lapsed shares, replies, and queue entries, and lists any invitation
   * still to answer whose entry was lost; needs no network.
   */
  function expireLocal() {
    const now = deps.now()
    store.setState((state) => {
      const unexpired = withoutExpired(state, now)
      return {
        ...unexpired,
        notifications: withPendingInvitesQueued(
          { ...state, ...unexpired },
          now
        ),
      }
    })
  }

  function expireStale() {
    const now = deps.now()
    const lapsed = store
      .getState()
      .buddies.filter(
        (b) => b.status === 'awaitingConfirm' && (b.expiresAt ?? 0) <= now
      )
    if (lapsed.length > 0) queueRemoval(lapsed)
    expireLocal()
    return lapsed.length > 0
  }

  /**
   * After the relay wipes an inactive inbox, register it again and re-add every
   * buddy's slot so the pairings resume. Flagged in state first so a failure
   * part-way is retried rather than read as buddies having left.
   */
  async function restoreInbox(me: BuddyIdentity, call?: RelayCallOptions) {
    store.setState({ slotsNeedRestore: true })
    // A new inbox counts seq from the start again.
    recentEvents.clear()
    await registerInbox(me, call)
    store.setState({ syncSeq: 0, pushRegistrationKey: null })
    for (const buddy of store.getState().buddies)
      await addSlot(me, pairKeys(me, buddy).incoming)
    store.setState({ slotsNeedRestore: false })
    await saveRoster(me)
  }

  async function fetchInbox(
    me: BuddyIdentity,
    since: number,
    call?: RelayCallOptions
  ) {
    let response: RelaySyncResponse
    try {
      response = await relay.syncInbox(ownerAuth(me), since, call)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
      if (deletedIdentities.has(me)) throw new RelayError('cancelled', 0)
      // Wiped for inactivity, or deleted by another of this User's devices.
      await restoreInbox(me, call)
      response = await relay.syncInbox(ownerAuth(me), 0, call)
    }
    for (const event of response.events) {
      recentEvents.set(event.seq, event)
      if (recentEvents.size > RECENT_EVENTS)
        recentEvents.delete(recentEvents.keys().next().value!)
    }
    const photosAvailable = response.capabilities?.photos === true
    if (store.getState().photosAvailable !== photosAvailable)
      store.setState({ photosAvailable })
    return response
  }

  async function runSync(call: RelayCallOptions) {
    let markRead = () => {}
    inboxRead = new Promise((resolve) => {
      markRead = resolve
    })
    try {
      await readAndSend(call, () => markRead())
    } finally {
      markRead()
      inboxRead = null
    }
  }

  async function readAndSend(call: RelayCallOptions, onRead: () => void) {
    perf.count('buddies:sync')
    expireLocal()
    const firstSync = store.getState().lastSyncAt === 0
    // Read again each sync: another device's seed may have synced in.
    const current = await identity({ fresh: true })
    const registered = store.getState().registeredInboxId
    // It replaced this one (iCloud Keychain): what's here is the old
    // account's, whose devices keep it. This device can't sign for that inbox
    // any more, so it leaves it as it is and starts over with the new one.
    if (registered !== null && registered !== current.inboxId)
      await resetLocalState()
    const me = await ensureInbox(call)
    slotsAddedDuringSync.clear()
    if (store.getState().slotsNeedRestore) await restoreInbox(me, call)
    const since = store.getState().syncSeq
    let response = await fetchInbox(me, since, call)

    const readBack = response.roster
      ? readRoster(me, response.roster.blob)
      : null
    // A stale roster is ignored, and this device's own is written back over it.
    const staleRoster = readBack !== null && isStaleRoster(readBack)
    const remoteRoster = staleRoster ? null : readBack
    if (remoteRoster) {
      const learned = mergeRoster(me, remoteRoster)
      // This device already synced past the new buddies' cards and events.
      if (learned.length > 0 && since > 0)
        response = await fetchInbox(me, 0, call)
    }

    let rosterChanged = staleRoster
    for (const event of [...response.events].sort((a, b) => a.seq - b.seq)) {
      if (event.kind === 'invite.claimed' && event.slotId === '') {
        applyClaim(me, event)
      } else if (event.kind === 'pair.confirmed') {
        rosterChanged = applyConfirmation(me, event) || rosterChanged
      } else if (
        event.kind === 'share.reply' ||
        shareTypeOfKind(event.kind) !== null
      ) {
        applyShareEvent(me, event)
      } else if (
        event.kind === JOIN_CANCEL_KIND ||
        event.kind.startsWith(JOIN_REQUEST_KIND_PREFIX)
      ) {
        applyJoinEvent(me, event)
      } else if (event.kind === BADGE_PUSH_KIND) {
        applyBadgeEvent(me, event, firstSync)
      } else if (event.kind === BADGE_REACTION_PUSH_KIND) {
        applyBadgeReactionEvent(me, event, firstSync)
      }
    }
    for (const card of response.cards) applyCard(me, card)
    // Answers, reads, and dismissals for what the events just brought.
    applyMarks()

    // A buddy who ended the connection (or a removal on another of this
    // User's devices) has withdrawn their slot from my inbox.
    const liveSlots = new Set(response.slots.map((slot) => slot.slotId))
    for (const buddy of store.getState().buddies) {
      const { slotId } = pairKeys(me, buddy).incoming
      if (!liveSlots.has(slotId) && !slotsAddedDuringSync.has(slotId)) {
        forgetBuddy(buddy.inboxId)
        rosterChanged = true
      }
    }

    rosterChanged = expireStale() || rosterChanged
    // Shares already in this User's data were sent by the device that made
    // them, before this one started.
    if (firstSync) adoptShares()
    // Read and applied: kept even if the sends below are cut short.
    store.setState({ syncSeq: response.seq, lastSyncAt: deps.now() })
    onRead()
    // The relay answered: whatever it asked to wait for is over.
    coolDownUntil = 0
    cancelled(call)
    await flushRemovals(me)
    if (await confirmUnsureInvites()) rosterChanged = true
    await deliverReplies().catch(() => {
      // Retried on the next sync.
    })
    await deliverJoinRequests().catch(() => {
      // Retried on the next sync.
    })
    await deliverBadgeAnnouncements().catch(() => {
      // Retried on the next sync, for up to a week.
    })
    await deliverBadgeReactions().catch(() => {
      // Retried on the next sync, for up to a week.
    })
    // Write the merged roster back when another device's copy lacks
    // something, which also heals a concurrent last-writer-wins overwrite.
    if (
      remoteRoster &&
      rosterSignature(remoteRoster) !==
        rosterSignature(rosterContent(store.getState()))
    )
      rosterChanged = true
    if (rosterChanged) await saveRoster(me)
    cancelled(call)
    await publishCards()
    cancelled(call)
    await publishShares()
    cancelled(call)
    await downloadSharedPhotos(call)
    await keepBuddyPhotos()
  }

  /**
   * How long the relay asked to be left alone, from a failed call: its
   * Retry-After, or a default for rate limits and the kill switch. A device
   * that couldn't be verified waits as long as its session does before
   * attesting again.
   */
  function noteBackPressure(error: unknown) {
    if (!(error instanceof RelayError)) return
    const wait =
      error.code === 'disabled' || error.code === 'upgrade_required'
        ? Math.max(error.retryAfterMs ?? 0, DISABLED_COOL_DOWN_MS)
        : error.code === 'suspended'
          ? Math.max(error.retryAfterMs ?? 0, SUSPENDED_COOL_DOWN_MS)
          : error.code === 'rate_limited'
            ? (error.retryAfterMs ?? RATE_LIMIT_COOL_DOWN_MS)
            : error.code === 'limit'
              ? null
              : error.retryAfterMs
    if (wait === null) return
    coolDownUntil = Math.max(coolDownUntil, deps.now() + wait)
  }

  /** The relay asked to back off; automatic syncs wait until it's over. */
  function coolingDown(): boolean {
    return deps.now() < coolDownUntil
  }

  /**
   * Reads the inbox and sends what's waiting. Concurrent callers share one run.
   * A call made while a sync runs may announce an event that sync already
   * fetched past, so it gets one more sync afterwards, shared by everyone who
   * asked meanwhile, unless every one of them gave a `minSeq` that the running
   * sync reached. Automatic calls do nothing while the relay asked to back off
   * (Retry-After, the kill switch); the User's own still go.
   */
  function sync(options: BuddiesSyncOptions = {}): Promise<SyncOutcome> {
    const { minSeq, automatic = false, ...call } = options
    if (automatic && coolingDown()) {
      perf.count('buddies:syncCoolingDown')
      return Promise.resolve('skipped')
    }
    const reached = (seq: number) => store.getState().syncSeq >= seq
    if (!syncInFlight) {
      if (minSeq !== undefined && reached(minSeq)) {
        perf.count('buddies:syncSkipped')
        return Promise.resolve('skipped')
      }
      syncInFlight = runSync(call)
        .then((): SyncOutcome => 'synced')
        .catch((error: unknown) => {
          noteBackPressure(error)
          throw error
        })
        .finally(() => {
          syncInFlight = null
        })
      return syncInFlight
    }
    const wanted = minSeq ?? Infinity
    if (followUp) {
      followUp.minSeq = Math.max(followUp.minSeq, wanted)
      followUp.automatic &&= automatic
      return followUp.promise
    }
    const next = {
      promise: Promise.resolve<SyncOutcome>('skipped'),
      minSeq: wanted,
      automatic,
    }
    next.promise = syncInFlight
      .catch(() => {
        // The follow-up runs either way; its own outcome is what callers see.
      })
      .then((): Promise<SyncOutcome> | SyncOutcome => {
        followUp = null
        if (reached(next.minSeq)) {
          perf.count('buddies:syncSkipped')
          return 'skipped'
        }
        return sync({ ...call, automatic: next.automatic })
      })
    followUp = next
    return next.promise
  }

  /** Opens this inbox's live signal, which says when to sync. */
  async function openLive() {
    return relay.openLive(ownerAuth(await ensureInbox()))
  }

  /**
   * Reads the inbox from this device's cursor and applies nothing: proof the
   * relay accepts this device's session, for Tools' relay check.
   */
  async function probeInbox() {
    const me = await ensureInbox()
    const since = store.getState().syncSeq
    const response = await relay.syncInbox(ownerAuth(me), since)
    return {
      since,
      seq: response.seq,
      slots: response.slots.length,
      cards: response.cards.length,
      events: response.events.length,
      rosterChanged: response.roster !== null,
    }
  }

  /**
   * What this device needs to word Buddies pushes itself (see `pushAlerts`):
   * each buddy's incoming slot, the key that opens it, and their name here;
   * open invites' keys; and when shared Plans and Follow-ups are, both ways.
   * Null until Buddies has started here; undefined until the seed has been read
   * (see `loadIdentity`), which isn't the same as nothing to word.
   */
  function alertContext(): BuddyAlertContext | null | undefined {
    const state = store.getState()
    if (state.registeredInboxId === null) return null
    const me = cachedIdentity?.identity
    if (!me) return undefined
    const now = deps.now()
    const sharesFrom = (inboxId: string) =>
      Object.fromEntries(
        Object.values(state.incomingShares)
          .filter((share) => share.from === inboxId && share.expiresAt > now)
          .map((share) => [share.shareId, shareWhen(share.type, share.details)])
      )
    return {
      v: 1,
      inboxId: me.inboxId,
      ownerSeed: toB64u(me.ownerSeed),
      buddies: state.buddies.map((buddy) => {
        const { incoming } = pairKeys(me, buddy)
        const shares = sharesFrom(buddy.inboxId)
        return {
          slot: incoming.slotId,
          key: toB64u(incoming.contentKey),
          name: buddy.nickname ?? buddy.name,
          ...(!alertsFor(buddy.inboxId).joinRequests
            ? { joinMuted: true as const }
            : {}),
          ...(!alertsFor(buddy.inboxId).badges
            ? { badgeMuted: true as const }
            : {}),
          ...(Object.keys(shares).length > 0 ? { shares } : {}),
        }
      }),
      invites: state.outgoingInvites
        .filter((invite) => invite.expiresAt > now)
        .map((invite) => ({
          id: invite.inviteId,
          key: toB64u(deriveInvite(fromB64u(invite.secret)).inviteKey),
        })),
      myShares: Object.fromEntries(
        (deps.getShares?.() ?? [])
          .filter((spec) => spec.expiresAt > now)
          .map((spec) => [
            shareIdFor(me.inboxId, spec.key),
            shareWhen(spec.type, spec.details),
          ])
      ),
      badgeAlerts: badgeAlertsOn(),
      joinAlerts: state.buddies.some(
        (buddy) => alertsFor(buddy.inboxId).joinRequests
      ),
      catalog: {
        order: [...ANNOUNCE_ORDER],
        oneTime: [...ONE_TIME_BADGE_IDS],
      },
    }
  }

  /**
   * Opens the event a push is about and says how to word its alert: from the
   * push itself when the event fit, or fetched from the inbox by its `seq`.
   * Reads only; the sync that follows a push applies the event as usual, and an
   * event that sync (or a recent one) read isn't fetched again.
   */
  async function describePush(
    marker: BuddiesPushMarker,
    call?: RelayCallOptions
  ): Promise<BuddyAlertOutcome> {
    if (store.getState().registeredInboxId === null)
      return { failed: 'noContext' }
    const me = await identity()
    const context = alertContext()
    if (!context) return { failed: 'noContext' }
    let event: SealedEvent | undefined =
      marker.eventId !== undefined && marker.blob !== undefined
        ? { eventId: marker.eventId, kind: marker.kind, blob: marker.blob }
        : undefined
    const seq = marker.seq
    if (!event && seq !== undefined && seq > 0) {
      event = recentEvents.get(seq)
      if (!event && inboxRead) {
        // Only the read; the sends after it don't hold up an alert.
        await inboxRead
        event = recentEvents.get(seq)
      }
      if (!event) {
        perf.count('buddies:describeFetch')
        const { events } = await relay.syncInbox(ownerAuth(me), seq - 1, call)
        event = events.find((candidate) => candidate.seq === seq)
      }
    }
    return event ? describeBuddyEvent(context, event) : { failed: 'noEvent' }
  }

  /**
   * Registers this device for pushes when anything about the registration
   * changed, or when the last one is a day old: the relay may have dropped the
   * device since (a rejected token, or evicted for a newer device), and a
   * re-sent registration keeps an active device from being the one evicted.
   */
  async function registerPush(
    device: PushAddress & {
      /** A kind left out is never pushed to this device. */
      templates: Partial<Record<BuddyPushKind | BadgePushKind, PushTemplate>> &
        Record<JoinRequestPushKind, PushTemplate>
    },
    call?: RelayCallOptions
  ): Promise<PushRegistrationOutcome> {
    const me = await ensureInbox(call)
    let deviceId = store.getState().deviceId
    if (!deviceId) {
      deviceId = newId()
      store.setState({ deviceId })
    }
    const registrationKey = toB64u(
      sha256(json({ inboxId: me.inboxId, deviceId, ...device }))
    )
    const { pushRegistrationKey, pushRegisteredAt } = store.getState()
    const unchanged = pushRegistrationKey === registrationKey
    const age = deps.now() - pushRegisteredAt
    if (unchanged && age >= 0 && age < PUSH_REGISTRATION_REFRESH_MS)
      return 'unchanged'
    try {
      await relay.registerDevice(ownerAuth(me), { deviceId, ...device }, call)
    } catch (error) {
      // Whatever the relay holds now is unknown; send it again next time.
      store.setState({ pushRegistrationKey: null })
      throw error
    }
    store.setState({
      pushRegistrationKey: registrationKey,
      pushRegisteredAt: deps.now(),
    })
    return unchanged ? 'refreshed' : 'registered'
  }

  /**
   * The current key's identity, after letting go of Buddies data from a key
   * this phone no longer has (it went missing, say, and a new one was made):
   * nothing can be signed for that inbox or its buddies any more, so it's left
   * as it is on the relay, as a sync does when another seed replaced the one
   * here.
   */
  async function currentIdentity(): Promise<BuddyIdentity> {
    const me = await identity({ fresh: true })
    const registered = store.getState().registeredInboxId
    if (registered !== null && registered !== me.inboxId) {
      await syncInFlight?.catch(() => undefined)
      await resetLocalState()
    }
    return me
  }

  /**
   * Removes this User from every buddy, then wipes the relay and the seed. The
   * seed is the only way to retry a removal, so nothing is wiped until every
   * buddy has been left.
   */
  async function deleteEverything() {
    const me = await currentIdentity()
    queueRemoval(store.getState().buddies)
    await flushRemovals(me, { force: true })
    if (store.getState().pendingRemovals.length > 0)
      throw new BuddyRemovalPendingError('everything')
    // Marked before the inbox goes. A failure before the seed is deleted
    // keeps this identity, so its next sync brings the inbox back.
    deletedIdentities.add(me)
    try {
      try {
        await relay.deleteInbox(ownerAuth(me))
      } catch (error) {
        // None, or another account's, which isn't this device's to delete.
        if (
          !isRelayError(error, 'not_found') &&
          !isRelayError(error, 'forbidden')
        )
          throw error
      }
      await deps.deleteRootSeed()
    } catch (error) {
      deletedIdentities.delete(me)
      throw error
    }
    cachedIdentity = null
    pairCache.clear()
    await resetLocalState()
  }

  /**
   * Signs this device out of Buddies and leaves the rest to this User's other
   * devices on the account: the inbox, its slots, and every buddy stay, and
   * only this device's push registration and Buddies data go. For a device
   * leaving an account that's still signed in elsewhere; `deleteEverything` is
   * for the last one. Removals this device still owes are finished first, as
   * there.
   */
  async function leaveThisDevice() {
    const me = await currentIdentity()
    if (store.getState().pendingRemovals.length > 0) {
      await flushRemovals(me, { force: true })
      if (store.getState().pendingRemovals.length > 0)
        throw new BuddyRemovalPendingError('everything')
    }
    // Nothing starts again with this seed (a push registration included), and
    // what a sync under way read lands before the reset clears it.
    leftInboxes.add(me.inboxId)
    const { deviceId, registeredInboxId } = store.getState()
    if (deviceId && registeredInboxId === me.inboxId) {
      try {
        await relay.unregisterDevice(ownerAuth(me), deviceId)
      } catch (error) {
        // Its pushes would keep coming to whoever uses this device next, so
        // only a refusal that won't change by trying again is let through: an
        // inbox that's gone or another account's, a suspended account's
        // inbox, which refuses owner ops, and the kill switch this one
        // (nothing is pushed while it's on).
        if (
          !isRelayError(error, 'not_found') &&
          !isRelayError(error, 'forbidden') &&
          !isRelayError(error, 'suspended') &&
          !isRelayError(error, 'disabled')
        ) {
          leftInboxes.delete(me.inboxId)
          throw error
        }
      }
    }
    await syncInFlight?.catch(() => undefined)
    cachedIdentity = null
    pairCache.clear()
    await resetLocalState()
  }

  /** Forgets everything Buddies kept on this device, but its choices. */
  async function resetLocalState() {
    shareSends.clear()
    lastAlertSentAt.clear()
    removalRetries.clear()
    recentEvents.clear()
    slotsAddedDuringSync.clear()
    coolDownUntil = 0
    // Choices about this device and what to share outlive the data; shared
    // Plans, invitations, replies, and the notification queue don't.
    const {
      devOverride,
      flagLastKnown,
      onboardingComplete,
      notificationsEnabled,
      joinRequestNotifications,
      badgeNotifications,
      sharing,
    } = store.getState()
    store.setState({
      ...initialBuddiesState,
      devOverride,
      flagLastKnown,
      onboardingComplete,
      notificationsEnabled,
      joinRequestNotifications,
      badgeNotifications,
      sharing,
    })
    await keepBuddyPhotos()
  }

  return {
    ensureInbox,
    createInvite,
    inviteLinkFor,
    cancelInvite,
    previewInvite,
    acceptInvite,
    confirmClaim,
    rejectClaim,
    removeBuddy,
    setShowOnCalendar,
    setColor,
    setNickname,
    setSharing,
    setBuddySetting,
    setBuddyOverrides,
    setBuddyAlert,
    setBuddyAlerts,
    publishCards,
    fetchBuddyPhoto,
    publishShares,
    adoptShares,
    replyToShare,
    deliverReplies,
    sendHeldReplies,
    setCardName,
    askToJoin,
    withdrawJoinRequest,
    dismissJoinRequest,
    joinRequestPushKinds,
    announceBadges,
    deliverBadgeAnnouncements,
    dropBadgeAnnouncements,
    badgePushKinds,
    reactToBadge,
    deliverBadgeReactions,
    expire: expireLocal,
    shareIdForKey,
    markNotificationsRead,
    markNotificationRead,
    dismissNotification,
    sync,
    coolingDown,
    /** Reads the seed (off the JS thread) so `alertContext` can answer. */
    loadIdentity: () => identity().then(() => undefined),
    dropIdentity,
    openLive,
    probeInbox,
    registerPush,
    alertContext,
    describePush,
    deleteEverything,
    leaveThisDevice,
  }
}

export type BuddiesEngine = ReturnType<typeof createBuddiesEngine>
