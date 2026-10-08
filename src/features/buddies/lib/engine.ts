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
  isRelayError,
  OwnerAuth,
  PushAddress,
  PushTemplate,
  RelayClient,
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
  joinRequestSchema,
  pairConfirmedSchema,
  PairingCard,
  pairingCardSchema,
  Roster,
  rosterSchema,
  shareCancelSchema,
  ShareInvite,
  shareInviteSchema,
  ShareReply,
  shareReplySchema,
  ShareType,
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
} from '@/features/buddies/lib/card'
import {
  holdsBadge,
  knownBadges,
  sharedBadgeKey,
  sortedForAnnouncement,
  withNewBadges,
} from '@/features/buddies/lib/sharedBadges'
import {
  awaitsAnswer,
  BADGE_ALERT_INTERVAL_MS,
  BADGE_ANNOUNCEMENT_TTL_MS,
  BadgeAnnouncement,
  Buddy,
  BuddyProfile,
  BuddySharing,
  BuddiesState,
  BuddyNotification,
  cappedQueue,
  IncomingShare,
  incomingJoinRequestKey,
  JOIN_REQUEST_ALERTS_PER_DAY,
  JOIN_REQUEST_LEAD_MS,
  MAX_OPEN_JOIN_REQUESTS,
  OutgoingJoinRequest,
  incomingShareKey,
  initialBuddiesState,
  INVITE_TTL_MS,
  MAX_BUDDIES,
  mergeRemovedBuddies,
  mergeSharing,
  withoutExpired,
  withPendingInvitesQueued,
  occupiedBuddySpots,
  OutgoingShareSpec,
  pairingEnded,
  PendingRemoval,
  SentBadgeReaction,
} from '@/features/buddies/lib/state'
import { ANNOUNCE_ORDER, parseBadgeKey } from '@/lib/badges/catalog'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import type { RecurringPlan } from '@/lib/recurrence'
import {
  type BadgeKey,
  ONE_TIME_BADGE_IDS,
  type SharedBadge,
} from '@/types/badges'
import type { DayPlan } from '@/types/timeEntry'

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
  /** The iCloud Keychain root seed, created on first use. */
  getRootSeed: () => Uint8Array
  deleteRootSeed: () => void
  getPlans: () => { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }
  /** Name, avatar, and Tenure as buddies should see them. */
  getProfile: () => BuddyProfile
  /**
   * The Service Streak, while it's long enough to show. Only Buddy Cards carry
   * it, never invites: a link can reach someone who isn't a buddy yet.
   */
  getStreak?: () => BuddyStreak | undefined
  /** The Plans and Follow-ups this User has invited buddies to. */
  getShares?: () => OutgoingShareSpec[]
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
}

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

/** What decides whether two rosters hold the same relationships and choices. */
function rosterSignature(
  roster: Pick<
    Roster,
    | 'buddies'
    | 'outgoingInvites'
    | 'incomingClaims'
    | 'closedInviteIds'
    | 'removedBuddies'
    | 'sharing'
  >
) {
  const { photo, tenure, streak, updatedAt, badges, badgesUpdatedAt } =
    roster.sharing
  return JSON.stringify([
    roster.buddies.map((b) => `${b.inboxId}:${b.status}`).sort(),
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
  ])
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
  const pairCache = new Map<string, PairKeys>()
  let syncInFlight: Promise<void> | null = null
  let syncQueued: Promise<void> | null = null
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

  function identity(): BuddyIdentity {
    const seed = deps.getRootSeed()
    const key = toB64u(seed)
    if (cachedIdentity?.seed !== key) {
      cachedIdentity = { seed: key, identity: deriveIdentity(seed) }
      pairCache.clear()
    }
    return cachedIdentity.identity
  }

  function ownerAuth(me: BuddyIdentity): OwnerAuth {
    return {
      inboxId: me.inboxId,
      ownerSeed: me.ownerSeed,
      ownerPub: me.ownerPub,
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

  /** The Profile minus whatever the User chose not to share. */
  function profile(): BuddyProfile {
    const current = deps.getProfile()
    const { sharing } = store.getState()
    return {
      name: current.name.trim(),
      avatar: sharing.photo ? current.avatar : undefined,
      tenure: sharing.tenure ? current.tenure : undefined,
      badges: sharesBadges() ? (current.badges ?? []) : [],
    }
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

  async function ensureInbox(): Promise<BuddyIdentity> {
    const me = identity()
    if (store.getState().registeredInboxId !== me.inboxId) {
      await relay.registerInbox(ownerAuth(me))
      store.setState({
        registeredInboxId: me.inboxId,
        syncSeq: 0,
        pushRegistrationKey: null,
      })
    }
    return me
  }

  async function addSlot(me: BuddyIdentity, keys: DirectionKeys) {
    await relay.addSlot(ownerAuth(me), keys.slotId, keys.writerPub)
    slotsAddedDuringSync.add(keys.slotId)
  }

  /** Best effort: the next change or sync rewrites it. */
  async function saveRoster(me: BuddyIdentity) {
    const state = store.getState()
    const version = state.rosterVersion + 1
    const roster: Roster = {
      v: 1,
      version,
      // Photos would overflow the roster cap; each device gets them, and
      // streaks, from cards.
      buddies: state.buddies.map(({ streak, ...buddy }) =>
        compactProfile(buddy)
      ),
      outgoingInvites: state.outgoingInvites,
      incomingClaims: state.incomingClaims.map(compactProfile),
      closedInviteIds: state.closedInviteIds,
      removedBuddies: state.removedBuddies,
      sharing: state.sharing,
    }
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

  /**
   * Also purges everything they shared with this User, and records the pairing
   * as ended so no roster brings it back. `removedAt` defaults to the pairing's
   * own `pairedAt`: when the relay says they left, this device may hold an
   * older pairing than one made since on another device.
   */
  function forgetBuddy(inboxId: string, removedAt?: number) {
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
      mutedJoinRequests: state.mutedJoinRequests.filter((id) => id !== inboxId),
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
        state
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

  async function createInvite(): Promise<string> {
    requireName()
    if (occupiedBuddySpots(store.getState()) >= MAX_BUDDIES)
      throw new BuddyInviteError('limit')
    const me = await ensureInbox()
    const secret = deps.randomBytes(16)
    const invite = deriveInvite(secret)
    const createdAt = deps.now()
    const expiresAt = createdAt + INVITE_TTL_MS
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

    const me = identity()
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
    try {
      await relay.claimInvite(
        invite.inviteId,
        invite.claimSecret,
        seal(
          invite.inviteKey,
          json(pairingCard(me)),
          aad.claim(invite.inviteId),
          nonce()
        )
      )
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
          showOnCalendar: true,
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
      showOnCalendar: true,
    }
    const { incoming, outgoing } = pairKeys(me, buddy)
    await addSlot(me, incoming)
    const eventId = newId()
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
    await publishCards().catch(() => {})
  }

  async function rejectClaim(inviteId: string) {
    const me = await ensureInbox()
    await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
    dropInvite(inviteId)
    await saveRoster(me)
  }

  /** Forgets buddies locally and queues withdrawing their relay slots. */
  function queueRemoval(parties: PendingRemoval[], removedAt?: number) {
    const inboxIds = new Set(parties.map((party) => party.inboxId))
    for (const inboxId of inboxIds) forgetBuddy(inboxId, removedAt)
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
   * Both are idempotent, so a removal stays queued until both succeed.
   */
  async function flushRemovals(me: BuddyIdentity) {
    const missing = (error: unknown) =>
      isRelayError(error, 'not_found') || isRelayError(error, 'gone')
    for (const party of store.getState().pendingRemovals) {
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
        continue
      }
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
    await flushRemovals(me)
    await saveRoster(me)
    if (isPendingRemoval(inboxId)) throw new BuddyRemovalPendingError('buddy')
  }

  function setShowOnCalendar(inboxId: string, showOnCalendar: boolean) {
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, showOnCalendar } : b
      ),
    }))
  }

  /**
   * Saved to the roster so a restored device keeps it. Two buddies may share a
   * color; it's this User's choice. `null` goes back to the assigned slot
   * color.
   */
  async function setColor(inboxId: string, color: string | null) {
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, color: color ?? undefined } : b
      ),
    }))
    await saveRoster(await ensureInbox())
  }

  /**
   * Saved to the roster so a restored device keeps it. A blank nickname goes
   * back to the buddy's own name.
   */
  async function setNickname(inboxId: string, nickname: string) {
    const trimmed = nickname.trim().slice(0, 60) || undefined
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, nickname: trimmed } : b
      ),
    }))
    await saveRoster(await ensureInbox())
  }

  /**
   * Changes what buddies see and republishes, so their copy of a withheld
   * photo, Tenure, or streak clears. Before Buddies has started it only records
   * the choice.
   */
  async function setSharing(
    change: Partial<Omit<BuddySharing, 'updatedAt' | 'badgesUpdatedAt'>>
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
      },
    }))
    // Badge news not yet sent stays home too.
    if (change.badges === false) dropBadgeAnnouncements()
    if (store.getState().registeredInboxId === null) return
    const me = await ensureInbox()
    await saveRoster(me)
    await publishCards()
  }

  /** Publishes one Buddy Card per active buddy, skipping unchanged content. */
  async function publishCards() {
    const { name, avatar, tenure, badges: shared = [] } = profile()
    const streak = store.getState().sharing.streak
      ? deps.getStreak?.()
      : undefined
    const active = store.getState().buddies.filter((b) => b.status === 'active')
    if (active.length === 0 || !name) return
    const me = identity()
    const { dayPlans, recurringPlans } = deps.getPlans()
    const days = buildBuddyCardDays(
      dayPlans,
      recurringPlans,
      new Date(deps.now())
    )
    // Left out when there are none, so cards (and their hash) stay as before.
    const badges = shared.length > 0 ? shared : undefined
    const contentHash = toB64u(
      sha256(json({ name, avatar, tenure, streak, days, badges }))
    )
    for (const buddy of active) {
      if (store.getState().publishedCardHashes[buddy.inboxId] === contentHash)
        continue
      const { outgoing } = pairKeys(me, buddy)
      const card = {
        v: 1,
        name,
        avatar,
        tenure,
        streak,
        updatedAt: deps.now(),
        level: 'daysTimes',
        days,
        badges,
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
              }
            : b
        ),
      }))
    } catch {
      // Undecryptable or malformed cards are dropped; the next publish replaces them.
    }
  }

  /** Stable per share, so every device of this User sends the same id. */
  function shareIdFor(me: BuddyIdentity, key: string): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/share|${me.inboxId}|${key}`)).slice(0, 16)
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

  /** Shortens the note until the invitation fits the relay's event cap. */
  function fitEvent(invite: ShareInvite): ShareInvite {
    let fitted = invite
    for (;;) {
      const over = json(fitted).length - MAX_EVENT_PLAINTEXT_BYTES
      const note = fitted.details.note
      if (over <= 0 || !note) return fitted
      // A character is at most 6 bytes of JSON (`\uXXXX`).
      const kept = note
        .slice(0, Math.max(0, note.length - Math.ceil(over / 6)))
        .replace(/[\uD800-\uDBFF]$/, '')
      fitted = {
        ...fitted,
        details: { ...fitted.details, note: kept || undefined },
      }
    }
  }

  /**
   * Brings every buddy's view of this User's shared Plans and Follow-ups in
   * line with the current data: invites new recipients, updates changed
   * details, and cancels removed recipients and deleted shares. Content is
   * hashed per recipient so an unchanged share sends nothing.
   */
  async function publishShares() {
    if (!deps.getShares || !displayName()) return
    const now = deps.now()
    const specs = deps.getShares().filter((spec) => spec.expiresAt > now)
    resolveJoinRequests(specs)
    const state = store.getState()
    if (specs.length === 0 && Object.keys(state.outgoingShares).length === 0)
      return
    const me = identity()
    const activeBuddy = (inboxId: string) =>
      store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
    let failure: unknown = null

    /** Sends one event; false when it should be retried on the next publish. */
    const deliver = async (
      inboxId: string,
      kind: string,
      body: unknown,
      push = true
    ) => {
      const buddy = activeBuddy(inboxId)
      if (!buddy) return true
      if (!hasShareBudget(inboxId)) return false
      try {
        await sendEvent(me, buddy, kind, body, push)
        spendShareBudget(inboxId)
        return true
      } catch (error) {
        if (isRelayError(error, 'gone')) {
          forgetBuddy(inboxId)
          return true
        }
        failure ??= error
        return false
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
      const shareId = shareIdFor(me, spec.key)
      const prefix = SHARE_KIND_PREFIX[spec.type]
      const hash = toB64u(
        sha256(
          json({
            type: spec.type,
            details: spec.details,
            expiresAt: spec.expiresAt,
          })
        )
      )
      // Only a change to when or where pushes; a new title or note arrives
      // quietly, sparing the relay's daily push budget for what matters.
      const { d, s, m, location } = spec.details
      const timing = toB64u(sha256(json({ d, s, m, location })))
      const recipients = new Set(spec.recipients.filter(activeBuddy))
      const previous = store.getState().outgoingShares[spec.key]
      const sent = { ...previous?.sent }
      const sentTiming = { ...previous?.sentTiming }
      const body = fitEvent({
        v: 1,
        id: shareId,
        rev: now,
        type: spec.type,
        expiresAt: spec.expiresAt,
        details: spec.details,
      })
      for (const inboxId of recipients) {
        if (sent[inboxId] === hash) continue
        const update = sent[inboxId] !== undefined
        const kind = `${prefix}.${update ? 'update' : 'invite'}`
        const push = !update || sentTiming[inboxId] !== timing
        if (await deliver(inboxId, kind, body, push)) {
          sent[inboxId] = hash
          sentTiming[inboxId] = timing
        }
      }
      for (const inboxId of Object.keys(sent)) {
        if (recipients.has(inboxId)) continue
        const cancel = { v: 1, id: shareId, rev: now }
        if (await deliver(inboxId, `${prefix}.cancel`, cancel)) {
          delete sent[inboxId]
          delete sentTiming[inboxId]
        }
      }
      saveSent(spec.key, {
        shareId,
        type: spec.type,
        expiresAt: spec.expiresAt,
        sent,
        sentTiming,
      })
    }

    const wanted = new Set(specs.map((spec) => spec.key))
    for (const [key, share] of Object.entries(
      store.getState().outgoingShares
    )) {
      if (wanted.has(key)) continue
      const sent = { ...share.sent }
      if (share.expiresAt > now) {
        const cancel = { v: 1, id: share.shareId, rev: now }
        for (const inboxId of Object.keys(sent)) {
          const kind = `${SHARE_KIND_PREFIX[share.type]}.cancel`
          if (await deliver(inboxId, kind, cancel)) delete sent[inboxId]
        }
      }
      saveSent(
        key,
        share.expiresAt > now && Object.keys(sent).length > 0
          ? { ...share, sent }
          : null
      )
    }
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
        applyCancel(buddy, source, cancel.id, cancel.rev)
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
    if (invite.expiresAt <= deps.now()) return
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
      expiresAt: invite.expiresAt,
      receivedAt: deps.now(),
      status: reopened ? 'pending' : existing.status,
      unsentReplyRev: reopened ? undefined : existing.unsentReplyRev,
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
    if (!changed) return
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
    shareId: string,
    rev: number
  ) {
    const key = incomingShareKey(buddy.inboxId, shareId)
    const existing = store.getState().incomingShares[key]
    // A cancel wins a tie with the invite it follows.
    if (!existing || existing.rev > rev || existing.status === 'cancelled')
      return
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: { ...existing, rev, status: 'cancelled' },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
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
  async function deliverReplies() {
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
        await sendEvent(me, buddy, 'share.reply', {
          v: 1,
          id: share.shareId,
          rev,
          status: share.status,
        })
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
      const { joinRequestNotifications, mutedJoinRequests } = store.getState()
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
        !!existing ||
          !joinRequestNotifications ||
          mutedJoinRequests.includes(buddy.inboxId)
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
    store.setState((state) => ({
      joinRequests: {
        ...state.joinRequests,
        [key]: { ...request, dismissed: true },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
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
  function joinRequestPushKinds(): JoinRequestPushKind[] {
    const { buddies, joinRequestNotifications, mutedJoinRequests } =
      store.getState()
    if (!joinRequestNotifications) return []
    const me = identity()
    return buddies
      .filter(
        (buddy) =>
          buddy.status === 'active' &&
          !mutedJoinRequests.includes(buddy.inboxId)
      )
      .map((buddy) => joinRequestKind(pairKeys(me, buddy).incoming.slotId))
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
    if (best.size === 0 || !sharesBadges()) return
    const state = store.getState()
    // Buddies never started here: no one to tell, and no seed to create.
    if (state.registeredInboxId === null) return
    const recipients = state.buddies
      .filter((buddy) => buddy.status === 'active')
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

  /** Drops badge news that's delivered, a week old, or no longer shared. */
  function pruneBadgeAnnouncements() {
    const now = deps.now()
    const { badgeAnnouncements } = store.getState()
    const kept = sharesBadges()
      ? badgeAnnouncements.filter(
          (announcement) =>
            announcement.createdAt + BADGE_ANNOUNCEMENT_TTL_MS > now &&
            announcement.recipients.some((id) => !announcement.sent[id])
        )
      : []
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
        // Waits for the hourly budget; retried on every sync.
        if (!buddy || !hasShareBudget(inboxId)) continue
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
      // Listed, but not calling for attention: badge alerts are off here, or
      // it's old news (a day or more, or a new device's whole backlog).
      !store.getState().badgeNotifications || firstSync || at <= now - DAY_MS
    )
  }

  /**
   * The badge push kinds (new badges, reactions), while badge alerts are on for
   * this device.
   */
  function badgePushKinds(): BadgePushKind[] {
    const { badgeNotifications } = store.getState()
    return badgeNotifications && (deps.showBadges?.() ?? true)
      ? [BADGE_PUSH_KIND, BADGE_REACTION_PUSH_KIND]
      : []
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
      // Listed, but not calling for attention: badge alerts are off here, or
      // it's old news (a day or more, or a new device's whole backlog).
      !store.getState().badgeNotifications || firstSync || at <= now - DAY_MS
    )
  }

  function markNotificationsRead() {
    if (store.getState().notifications.every((n) => n.read)) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.read ? n : { ...n, read: true }
      ),
    }))
  }

  /**
   * Seen in the tray. A later change to a seen invitation then reads as a
   * change rather than a new invitation.
   */
  function markNotificationRead(id: string) {
    const entry = store.getState().notifications.find((n) => n.id === id)
    if (!entry || entry.read) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  }

  /**
   * Removes a queue entry, except a request still waiting on an answer: the
   * tray is where it's answered, and answering is what clears it.
   */
  function dismissNotification(id: string) {
    const state = store.getState()
    const entry = state.notifications.find((n) => n.id === id)
    if (!entry || awaitsAnswer(entry, state)) return
    if (entry.kind === 'joinRequest' && entry.shareKey) {
      dismissJoinRequest(entry.shareKey)
      return
    }
    store.setState((current) => ({
      notifications: current.notifications.filter((n) => n.id !== id),
    }))
  }

  /** The id buddies know one of this User's shares by. */
  function shareIdForKey(key: string): string {
    return shareIdFor(identity(), key)
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
    const known = new Set(state.buddies.map((b) => b.inboxId))
    const usedColors = new Set(state.buddies.map((b) => b.colorIndex))
    const added: Buddy[] = []
    for (const buddy of remote.buddies) {
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
      added.push({ ...buddy, colorIndex })
    }
    // Another of this User's devices ended these pairings.
    const endedHere = state.buddies.filter(ended)
    const buddies = [
      ...state.buddies
        .filter((local) => !ended(local))
        .map((local): Buddy => {
          const theirs = remote.buddies.find((b) => b.inboxId === local.inboxId)
          // Another device already applied this pairing's confirmation.
          return local.status === 'awaitingConfirm' &&
            theirs?.status === 'active' &&
            theirs.inviteSecret === local.inviteSecret
            ? {
                ...local,
                name: theirs.name,
                tenure: theirs.tenure,
                status: 'active',
                expiresAt: undefined,
              }
            : local
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
      sharing: mergeSharing(state.sharing, remote.sharing),
    })
    // Withdraw their slots from here too, in case that device can't finish.
    if (endedHere.length > 0) queueRemoval(endedHere)
    return added.map((b) => b.inboxId)
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
  async function restoreInbox(me: BuddyIdentity) {
    store.setState({ slotsNeedRestore: true })
    await relay.registerInbox(ownerAuth(me))
    store.setState({ syncSeq: 0, pushRegistrationKey: null })
    for (const buddy of store.getState().buddies)
      await addSlot(me, pairKeys(me, buddy).incoming)
    store.setState({ slotsNeedRestore: false })
    await saveRoster(me)
  }

  async function fetchInbox(me: BuddyIdentity, since: number) {
    try {
      return await relay.syncInbox(ownerAuth(me), since)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
      // Wiped for inactivity, or deleted by another of this User's devices.
      await restoreInbox(me)
      return relay.syncInbox(ownerAuth(me), 0)
    }
  }

  async function runSync() {
    expireLocal()
    const firstSync = store.getState().lastSyncAt === 0
    const me = await ensureInbox()
    slotsAddedDuringSync.clear()
    if (store.getState().slotsNeedRestore) await restoreInbox(me)
    const since = store.getState().syncSeq
    let response = await fetchInbox(me, since)

    const readBack = response.roster
      ? readRoster(me, response.roster.blob)
      : null
    // A stale roster is ignored, and this device's own is written back over it.
    const staleRoster = readBack !== null && isStaleRoster(readBack)
    const remoteRoster = staleRoster ? null : readBack
    if (remoteRoster) {
      const learned = mergeRoster(me, remoteRoster)
      // This device already synced past the new buddies' cards and events.
      if (learned.length > 0 && since > 0) response = await fetchInbox(me, 0)
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
    await flushRemovals(me)
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
    store.setState({ syncSeq: response.seq, lastSyncAt: deps.now() })
    // Write the merged roster back when another device's copy lacks
    // something, which also heals a concurrent last-writer-wins overwrite.
    if (
      remoteRoster &&
      rosterSignature(remoteRoster) !== rosterSignature(store.getState())
    )
      rosterChanged = true
    if (rosterChanged) await saveRoster(me)
    await publishCards()
    await publishShares()
  }

  /**
   * Coalesces concurrent callers. A call made while a sync runs may announce an
   * event that sync already fetched past, so it gets one more sync afterwards,
   * shared by everyone who asked meanwhile.
   */
  function sync(): Promise<void> {
    if (!syncInFlight) {
      syncInFlight = runSync().finally(() => {
        syncInFlight = null
      })
      return syncInFlight
    }
    syncQueued ??= syncInFlight
      .catch(() => {
        // The follow-up runs either way; its own outcome is what callers see.
      })
      .then(() => {
        syncQueued = null
        return sync()
      })
    return syncQueued
  }

  /** Opens this inbox's live signal, which says when to sync. */
  async function openLive() {
    return relay.openLive(ownerAuth(await ensureInbox()))
  }

  /**
   * Reads the inbox from this device's cursor and applies nothing: proof the
   * relay accepts this device's signature, for Tools' relay check.
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
   * Null until Buddies has started here.
   */
  function alertContext(): BuddyAlertContext | null {
    const state = store.getState()
    if (state.registeredInboxId === null) return null
    const me = identity()
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
          ...(state.mutedJoinRequests.includes(buddy.inboxId)
            ? { joinMuted: true as const }
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
            shareIdFor(me, spec.key),
            shareWhen(spec.type, spec.details),
          ])
      ),
      badgeAlerts: state.badgeNotifications && (deps.showBadges?.() ?? true),
      joinAlerts: state.joinRequestNotifications,
      catalog: {
        order: [...ANNOUNCE_ORDER],
        oneTime: [...ONE_TIME_BADGE_IDS],
      },
    }
  }

  /**
   * Opens the event a push is about and says how to word its alert: from the
   * push itself when the event fit, or fetched from the inbox by its `seq`.
   * Reads only; the sync that follows a push applies the event as usual.
   */
  async function describePush(
    marker: BuddiesPushMarker
  ): Promise<BuddyAlertOutcome> {
    const context = alertContext()
    if (!context) return { failed: 'noContext' }
    let event: SealedEvent | undefined =
      marker.eventId !== undefined && marker.blob !== undefined
        ? { eventId: marker.eventId, kind: marker.kind, blob: marker.blob }
        : undefined
    if (!event && marker.seq !== undefined && marker.seq > 0) {
      const { events } = await relay.syncInbox(
        ownerAuth(identity()),
        marker.seq - 1
      )
      event = events.find((candidate) => candidate.seq === marker.seq)
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
    }
  ): Promise<PushRegistrationOutcome> {
    const me = await ensureInbox()
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
      await relay.registerDevice(ownerAuth(me), { deviceId, ...device })
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
   * Removes this User from every buddy, then wipes the relay and the seed. The
   * seed is the only way to retry a removal, so nothing is wiped until every
   * buddy has been left.
   */
  async function deleteEverything() {
    const me = identity()
    queueRemoval(store.getState().buddies)
    await flushRemovals(me)
    if (store.getState().pendingRemovals.length > 0)
      throw new BuddyRemovalPendingError('everything')
    try {
      await relay.deleteInbox(ownerAuth(me))
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
    }
    deps.deleteRootSeed()
    cachedIdentity = null
    pairCache.clear()
    shareSends.clear()
    lastAlertSentAt.clear()
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
    publishCards,
    publishShares,
    replyToShare,
    deliverReplies,
    sendHeldReplies,
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
    openLive,
    probeInbox,
    registerPush,
    alertContext,
    describePush,
    deleteEverything,
  }
}

export type BuddiesEngine = ReturnType<typeof createBuddiesEngine>
