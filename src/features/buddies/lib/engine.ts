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
  type CarCancelEvent,
  carCancelEventSchema,
  type CarInviteEvent,
  carInviteEventSchema,
  type CarReply,
  type CarReplyEvent,
  carReplyEventSchema,
  joinRequestSchema,
  MAX_GUEST_AVATAR_CHARS,
  MAX_SHARED_PHOTOS,
  pairConfirmedSchema,
  PairingCard,
  pairingCardSchema,
  type ProfilePhoto,
  Roster,
  rosterSchema,
  ShareCancel,
  shareCancelSchema,
  type ShareGuest,
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
  CAR_REPLY_TTL_MS,
  cappedQueue,
  type CarEventKind,
  IncomingShare,
  type IncomingCarInvite,
  incomingCarInviteKey,
  INCOMING_CAR_INVITE_MAX_MS,
  type OutgoingCarEvent,
  incomingJoinRequestKey,
  JOIN_REQUEST_ALERTS_PER_DAY,
  JOIN_REQUEST_LEAD_MS,
  MAX_OPEN_JOIN_REQUESTS,
  type OutgoingInvite,
  OutgoingJoinRequest,
  OutgoingShare,
  type ReceivedReply,
  incomingShareKey,
  initialBuddiesState,
  INVITE_TTL_MS,
  MAX_BUDDIES,
  MAX_ROSTER_PLAINTEXT_BYTES,
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
  SEEN_CAR_EVENT_TTL_MS,
  unexpiredCarEvents,
  neededInviteSecrets,
  receivedInviteSecretId,
  sentInviteSecretId,
} from '@/features/buddies/lib/state'
import {
  LEGACY_SHARE_RETENTION_MS,
  shareEventExpiry,
} from '@/features/buddies/lib/shares'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'
import { guestTag } from '@/features/buddies/lib/guests'
import { ANNOUNCE_ORDER, parseBadgeKey } from '@/lib/badges/catalog'
import {
  CAR_INVITE_NAME_MAX,
  type OpenCarInvite,
  rosterSharedCarMemberships,
} from '@/lib/mileage/sharedCar'
import { inviteEventId } from '@/lib/sharedSpaces/crypto'
import {
  createInviteSecretStore,
  type InviteSecrets,
  type InviteSecretStore,
  memoryInviteSecretStorage,
} from '@/lib/sharedSpaces/deviceInviteSecrets'
import type { CarInvitePayload, SharedCarMemberships } from '@/types/sharedCars'
import {
  atMinutesOfDay,
  DEFAULT_START_TIME_IN_MINUTES,
} from '@/lib/normalizeDate'
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

export type CarEventNotice = {
  kind: CarEventKind

  from: string
  spaceId: string
  inviteId: string

  status?: CarReply
}

export type LostCarInvite = { to: string; spaceId: string; inviteId: string }

export type BuddiesCarsDeps = {
  memberships: () => SharedCarMemberships

  mergeMemberships: (remote: SharedCarMemberships) => void

  openInvitesTo: (inboxId: string) => OpenCarInvite[]

  replyApplies: (reply: {
    from: string
    spaceId: string
    inviteId: string
  }) => boolean

  isOnCar?: (spaceId: string) => boolean

  inviteOpen?: (spaceId: string, inviteId: string) => boolean

  onEvent?: (notice: CarEventNotice) => void

  onInviteLost?: (invite: LostCarInvite) => void

  onBuddyGone?: (inboxId: string) => void

  leaveAll?: () => Promise<{ pending: number; notLeft?: { name: string }[] }>

  finishPending?: () => Promise<{ pending: number }>

  forgetLocal?: () => void
}

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

  getRootSeed: () => Promise<Uint8Array>
  deleteRootSeed: () => Promise<void>

  account?: {
    forget: () => void
  }
  getPlans: () => { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }

  getProfile: () => BuddyProfile

  getStreak?: () => BuddyStreak | undefined

  getPet?: () => BuddyPet | undefined

  getShares?: () => OutgoingShareSpec[]

  shrinkAvatar?: (jpegBase64: string) => Promise<string | undefined>

  withdrawnAt?: (key: string) => number | undefined

  shareEndsAt?: (key: string) => number | undefined

  platform?: BuddyPlatform

  onPaired?: (pairing: BuddyPairing) => void

  showBadges?: () => boolean

  isEnabled?: () => boolean

  later?: (run: () => void, ms: number) => void

  readSharedPhoto?: (
    image: RichTextImageAttrs
  ) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>

  hasSharedPhoto?: (localId: string) => Promise<boolean>

  saveSharedPhoto?: (localId: string, bytes: Uint8Array) => Promise<void>

  onSharedPhotosSaved?: () => void

  readProfilePhoto?: () => Promise<Uint8Array | null>

  keepBuddyPhotos?: (blobIds: string[]) => Promise<void>

  dismissAlerts?: (seqs: number[]) => void

  cars?: BuddiesCarsDeps

  inviteSecrets?: InviteSecretStore

  onSharesNotSent?: (notSent: {
    reason: UnsentShareReason
    names: string[]
  }) => void
}

export type BuddiesSyncOptions = RelayCallOptions & {
  minSeq?: number

  automatic?: boolean
}

export type SyncOutcome = 'synced' | 'skipped'

const RATE_LIMIT_COOL_DOWN_MS = 60 * 1000

export const DISABLED_COOL_DOWN_MS = 15 * 60 * 1000

export const SUSPENDED_COOL_DOWN_MS = 60 * 1000

const REMOVAL_RETRY_BASE_MS = 60 * 1000
const REMOVAL_RETRY_MAX_MS = 60 * 60 * 1000

const RECENT_EVENTS = 50

export type BuddyPairing = {
  role: 'inviter' | 'invitee'

  buddyPlatform?: BuddyPlatform
}

export type BuddyInviteErrorReason =
  | 'invalid'
  | 'unavailable'
  | 'own'
  | 'alreadyBuddies'
  | 'limit'
  | 'openInvites'
  | 'nameRequired'

export class BuddyInviteError extends Error {
  constructor(readonly reason: BuddyInviteErrorReason) {
    super(`Buddy invite: ${reason}`)
    this.name = 'BuddyInviteError'
  }
}

export class BuddyRemovalPendingError extends Error {
  constructor(
    readonly scope: 'buddy' | 'everything',
    readonly cars: readonly string[] = []
  ) {
    super(`Buddy removal pending: ${scope}`)
    this.name = 'BuddyRemovalPendingError'
  }
}

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

export const BADGE_PUSH_KIND = 'badge.new'
export const BADGE_REACTION_PUSH_KIND = 'badge.reaction'
export type BadgePushKind =
  | typeof BADGE_PUSH_KIND
  | typeof BADGE_REACTION_PUSH_KIND

export const CAR_PUSH_KINDS = ['car.invite', 'car.reply'] as const
export type CarPushKind = (typeof CAR_PUSH_KINDS)[number]

const CAR_EVENT_KINDS: readonly string[] = [
  'car.invite',
  'car.cancel',
  'car.reply',
] satisfies CarEventKind[]

export type PushRegistrationOutcome = 'registered' | 'refreshed' | 'unchanged'

export const PUSH_REGISTRATION_REFRESH_MS = 24 * 60 * 60 * 1000

const MAX_EVENT_PLAINTEXT_BYTES = 8 * 1024 - 29

const SHARE_EVENTS_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const MAX_BADGE_ANNOUNCEMENTS = 20

const RELAY_ALERT_SPACING_MS = 65 * 1000

const SEEN_BADGE_EVENT_TTL_MS = 31 * DAY_MS

const ROSTER_SAVE_DELAY_MS = 2000

const MIN_SHARE_VERSION = Date.UTC(2020, 0, 1)

const SHARE_KIND_PREFIX: Record<ShareType, string> = {
  plan: 'plan',
  followUp: 'followup',
}

const JOIN_REQUEST_KIND_PREFIX = 'join.request.'
const JOIN_CANCEL_KIND = 'join.cancel'

const MAX_ALERT_SEQS = 10
export type JoinRequestPushKind = `${typeof JOIN_REQUEST_KIND_PREFIX}${string}`

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

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

type OutgoingCarEventInput = Omit<OutgoingCarEvent, 'queuedAt' | 'attempted'>

type EventSource = { id: string; seq: number }
type PairParty = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

function unionBy<T>(local: T[], remote: T[], key: (item: T) => string) {
  const seen = new Set(local.map(key))
  return [...local, ...remote.filter((item) => !seen.has(key(item)))]
}

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
    petVisits,
    petVisitsUpdatedAt,
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

    [badges ?? true, badgesUpdatedAt ?? 0],

    [pet ?? true, petUpdatedAt ?? 0],

    [
      plans ?? true,
      planTimes ?? 'exact',
      pausedUntil ?? 0,
      plansUpdatedAt ?? 0,
    ],
    [showOnCalendar ?? true, calendarUpdatedAt ?? 0],
    [petVisits ?? true, petVisitsUpdatedAt ?? 0],
    Object.entries(roster.answers)
      .map(([key, { s, v, r }]) => `${key}:${s}:${v}:${r}`)
      .sort(),
    Object.keys(roster.read).sort(),
    Object.keys(roster.dismissed).sort(),

    roster.card ? [roster.card.name, roster.card.updatedAt] : null,

    Object.entries(roster.cars)
      .map(([spaceId, { at }]) => `${spaceId}:${at}`)
      .sort(),
    Object.entries(roster.leftCars)
      .map(([spaceId, at]) => `${spaceId}:${at}`)
      .sort(),
  ])
}

function shareTiming(details: OutgoingShareSpec['details']) {
  const { d, s, m, location } = details
  return toB64u(sha256(utf8(JSON.stringify({ d, s, m, location }))))
}

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

function compactAvatar(avatar: BuddyAvatar | undefined) {
  return avatar?.t === 'emoji' ? avatar : undefined
}

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

function releasingInviteSecrets(
  store: Store,
  secrets: InviteSecretStore
): Store {
  return {
    getState: () => store.getState(),
    setState: (partial) => {
      const before = store.getState()
      store.setState(partial)
      const after = store.getState()
      if (
        after.carEvents !== before.carEvents ||
        after.carInvites !== before.carInvites
      )
        secrets.retain(() => neededInviteSecrets(store.getState()))
    },
  }
}

function answeredCarInvite(
  invite: IncomingCarInvite,
  status: CarReply | 'cancelled',
  at: number
): IncomingCarInvite {
  const { join: _join, ...rest } = invite
  return {
    ...rest,
    status,
    ...(status === 'cancelled' ? {} : { answeredAt: at }),
  }
}

function settledCarInvites(
  carInvites: Record<string, IncomingCarInvite>,
  isOnCar: ((spaceId: string) => boolean) | undefined,
  now: number
): { carInvites: Record<string, IncomingCarInvite>; settled: string[] } {
  if (!isOnCar) return { carInvites, settled: [] }
  const settled = Object.entries(carInvites)
    .filter(
      ([, invite]) =>
        (invite.status === 'pending' || invite.status === 'declined') &&
        isOnCar(invite.spaceId)
    )
    .map(([key]) => key)
  if (settled.length === 0) return { carInvites, settled }
  return {
    carInvites: {
      ...carInvites,
      ...Object.fromEntries(
        settled.map((key) => [
          key,
          answeredCarInvite(carInvites[key], 'joined', now),
        ])
      ),
    },
    settled,
  }
}

function carsNotLeft(
  cars:
    | Awaited<ReturnType<NonNullable<BuddiesCarsDeps['leaveAll']>>>
    | undefined
): string[] {
  if (!cars) return []
  const names = (cars.notLeft ?? []).map((car) => car.name)
  const unnamed = Math.max(0, cars.pending - names.length)
  return [...names, ...Array.from({ length: unnamed }, () => '')]
}

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

function newPairedAt(state: BuddiesState, inboxId: string, now: number) {
  return Math.max(now, (state.removedBuddies[inboxId] ?? -1) + 1)
}

export function createBuddiesEngine(deps: BuddiesEngineDeps) {
  const { relay } = deps
  const inviteSecrets =
    deps.inviteSecrets ?? createInviteSecretStore(memoryInviteSecretStorage())
  const store = releasingInviteSecrets(deps.store, inviteSecrets)

  inviteSecrets.retain(() => neededInviteSecrets(store.getState()))
  let cachedIdentity: { seed: string; identity: BuddyIdentity } | null = null

  const accountKeys = new WeakMap<BuddyIdentity, Uint8Array>()
  let identityLoad: Promise<BuddyIdentity> | null = null
  let registering: Promise<BuddyIdentity> | null = null

  const deletedIdentities = new WeakSet<BuddyIdentity>()

  const leftInboxes = new Set<string>()
  const pairCache = new Map<string, PairKeys>()
  let syncInFlight: Promise<SyncOutcome> | null = null

  let followUp: {
    promise: Promise<SyncOutcome>
    minSeq: number
    automatic: boolean
  } | null = null

  let coolDownUntil = 0

  const removalRetries = new Map<string, { failures: number; at: number }>()

  const recentEvents = new Map<number, SealedEvent>()

  let inboxRead: Promise<void> | null = null

  const shareSends = new Map<string, number[]>()

  const slotsAddedDuringSync = new Set<string>()

  let joinDelivery: Promise<void> = Promise.resolve()

  let badgeDelivery: Promise<void> = Promise.resolve()

  let badgeRetryAt: number | null = null

  let carDelivery: Promise<void> = Promise.resolve()

  const lastAlertSentAt = new Map<string, number>()

  const json = (value: unknown) => utf8(JSON.stringify(value))
  const nonce = () => deps.randomBytes(12)
  const newId = () => toB64u(deps.randomBytes(16))
  const decode = (bytes: Uint8Array): unknown => JSON.parse(fromUtf8(bytes))

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

  function dropIdentity() {
    cachedIdentity = null
    pairCache.clear()
    leftInboxes.clear()
  }

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

  function cardName(): CardName {
    const { cardName: known, startedAt } = store.getState()
    return (
      known ?? {
        name: deps.getProfile().name.trim(),

        updatedAt: -(startedAt ?? 0),
      }
    )
  }

  function adoptCardName(state: BuddiesState, remote: CardName | undefined) {
    if (!remote) return state.cardName
    const local = cardName()
    if (mergeCardName(local, remote) !== remote) return state.cardName
    return state.cardName === null && remote.name === local.name ? null : remote
  }

  function setCardName(name: string) {
    store.setState({ cardName: { name: name.trim(), updatedAt: deps.now() } })
    saveRosterSoon()
  }

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

  function settingsFor(buddy: Pick<Buddy, 'overrides'>): BuddySettings {
    return buddySettings(store.getState().sharing, buddy).settings
  }

  function sharingPaused(): boolean {
    return isSharingPaused(store.getState().sharing, deps.now())
  }

  function badgesGoTo(buddy: Pick<Buddy, 'overrides'>): boolean {
    return (deps.showBadges?.() ?? true) && settingsFor(buddy).badges
  }

  function alertsFor(inboxId: string) {
    return buddyAlertSettings(store.getState(), inboxId).settings
  }

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

  function eventIdFor(...parts: (string | number)[]): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/event|${parts.join('|')}`)).slice(0, 16)
    )
  }

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
    outboxTail = next.catch(() => {})
    return next
  }

  async function addSlot(me: BuddyIdentity, keys: DirectionKeys) {
    await relay.addSlot(ownerAuth(me), keys.slotId, keys.writerPub)
    slotsAddedDuringSync.add(keys.slotId)
  }

  function rosterContent(state: BuddiesState): Omit<Roster, 'v' | 'version'> {
    const now = deps.now()
    const marks = mergeNotificationMarks(
      state.notificationMarks,
      { read: {}, dismissed: {} },
      now
    )
    const content = {
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

    const room =
      MAX_ROSTER_PLAINTEXT_BYTES -
      json({
        v: 1,
        version: Number.MAX_SAFE_INTEGER,
        ...content,
        cars: {},
        leftCars: {},
      }).length
    return {
      ...content,
      ...rosterSharedCarMemberships(
        deps.cars?.memberships() ?? { cars: {}, leftCars: {} },
        room
      ),
    }
  }

  async function saveRoster(me: BuddyIdentity) {
    const state = store.getState()
    const version = state.rosterVersion + 1
    const roster: Roster = { v: 1, version, ...rosterContent(state) }
    try {
      await relay.putRoster(
        ownerAuth(me),
        seal(me.rosterKey, json(roster), aad.roster(me.inboxId), nonce())
      )

      store.setState((current) => ({
        rosterVersion: Math.max(current.rosterVersion, version),
      }))
    } catch {}
  }

  let rosterSaveQueued = false

  function saveRosterSoon() {
    if (rosterSaveQueued || !deps.later) return
    if (store.getState().registeredInboxId === null) return
    rosterSaveQueued = true
    deps.later(() => {
      rosterSaveQueued = false

      if (store.getState().registeredInboxId === null) return
      void ensureInbox()
        .then(saveRoster)
        .catch(() => {})
    }, ROSTER_SAVE_DELAY_MS)
  }

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
      guestAvatars: omitKey(state.guestAvatars, inboxId),
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

      badgeAnnouncements: state.badgeAnnouncements.map((announcement) => ({
        ...announcement,
        recipients: announcement.recipients.filter((id) => id !== inboxId),
      })),
      lastBadgeAlertAt: omitKey(state.lastBadgeAlertAt, inboxId),

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

      carInvites: Object.fromEntries(
        Object.entries(state.carInvites).filter(
          ([, invite]) => invite.from !== inboxId
        )
      ),
      carEvents: Object.fromEntries(
        Object.entries(state.carEvents).filter(
          ([, event]) => event.to !== inboxId
        )
      ),
    }))
    deps.cars?.onBuddyGone?.(inboxId)
  }

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

  async function previewInvite(link: string) {
    const { card, expiresAt } = await readInvite(link)
    return {
      name: card.name,
      avatar: compactAvatar(card.avatar),
      tenure: card.tenure,
      expiresAt,
    }
  }

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

      removedBuddies: omitKey(state.removedBuddies, card.inboxId),

      onboardingComplete: true,
    }))
    await saveRoster(me)
    return { name: card.name }
  }

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

      await relay.removeSlot(ownerAuth(me), incoming.slotId).catch(() => {})
      await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
      dropInvite(inviteId)
      await saveRoster(me)
      throw new BuddyInviteError('unavailable')
    }
    store.setState((current) => ({
      buddies: [...current.buddies, buddy],

      removedBuddies: omitKey(current.removedBuddies, buddy.inboxId),
    }))
    dropInvite(inviteId)
    deps.onPaired?.({ role: 'inviter', buddyPlatform: claim.platform })
    await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
    await saveRoster(me)
    addCardEdits(new Set([buddy.inboxId]))
    await publishCards().catch(() => {})
  }

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

  async function removeBuddy(inboxId: string) {
    const buddy = store.getState().buddies.find((b) => b.inboxId === inboxId)
    if (!buddy) return
    const me = await ensureInbox()
    if (buddy.status === 'active') {
      queueCarCancelsTo(me, inboxId)
      await deliverCarEvents().catch(() => {})
    }

    queueRemoval([buddy], deps.now())
    await flushRemovals(me, { force: true })
    await saveRoster(me)
    if (isPendingRemoval(inboxId)) throw new BuddyRemovalPendingError('buddy')
  }

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

  function setShowOnCalendar(inboxId: string, showOnCalendar: boolean) {
    const followsAll =
      store.getState().sharing.showOnCalendar === showOnCalendar
    void setBuddySetting(
      inboxId,
      'showOnCalendar',
      followsAll ? undefined : showOnCalendar
    ).catch(() => {})
  }

  function setPetVisits(inboxId: string, petVisits: boolean) {
    const followsAll = store.getState().sharing.petVisits === petVisits
    void setBuddySetting(
      inboxId,
      'petVisits',
      followsAll ? undefined : petVisits
    ).catch(() => {})
  }

  async function setBuddySetting<K extends BuddySettingKey>(
    inboxId: string,
    key: K,
    value: BuddySettings[K] | undefined
  ) {
    await setBuddyOverrides(inboxId, (overrides) =>
      withOverride(overrides, key, value)
    )
  }

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

  function setBuddyAlert(
    inboxId: string,
    key: BuddyAlertKey,
    value: boolean | undefined
  ) {
    setBuddyAlerts(inboxId, (alerts) => withOverride(alerts, key, value))
  }

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

  async function setColor(inboxId: string, color: string | null) {
    setBuddyPrefs(inboxId, { color: color ?? undefined })
    await saveRoster(await ensureInbox())
  }

  async function setNickname(inboxId: string, nickname: string) {
    const trimmed = nickname.trim().slice(0, 60) || undefined
    setBuddyPrefs(inboxId, { nickname: trimmed })
    await saveRoster(await ensureInbox())
  }

  async function setSharing(
    change: Partial<
      Omit<
        BuddySharing,
        | 'updatedAt'
        | 'badgesUpdatedAt'
        | 'petUpdatedAt'
        | 'plansUpdatedAt'
        | 'calendarUpdatedAt'
        | 'petVisitsUpdatedAt'
      >
    >
  ) {
    const now = deps.now()
    store.setState((state) => ({
      sharing: {
        ...state.sharing,
        ...change,

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
        ...('petVisits' in change ? { petVisitsUpdatedAt: now } : {}),
      },
    }))

    if (change.badges === false) pruneBadgeAnnouncements()
    if (store.getState().registeredInboxId === null) return
    const me = await ensureInbox()
    await saveRoster(me)
    await publishCards({ edited: true })
  }

  let cardEdits: 'all' | Set<string> = new Set()

  function addCardEdits(edits: 'all' | Set<string>) {
    cardEdits =
      edits === 'all' || cardEdits === 'all'
        ? 'all'
        : new Set([...cardEdits, ...edits])
  }

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

    const { name } = cardName()
    const each = targets.map((buddy) => ({
      buddy,
      settings: settingsFor(buddy),
    }))

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

    const badges = shared.length > 0 ? shared : undefined

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

  async function withFullPhoto(
    me: BuddyIdentity,
    avatar: BuddyAvatar | undefined
  ): Promise<BuddyAvatar | undefined> {
    const uploaded = store.getState().profilePhoto
    if (avatar?.t !== 'image') {
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

                badges: knownBadges(parsed.badges),

                pet: parsed.pet,
              }
            : b
        ),
      }))
    } catch {}
  }

  function shareIdFor(inboxId: string, key: string): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/share|${inboxId}|${key}`)).slice(0, 16)
    )
  }

  function hasShareBudget(inboxId: string): boolean {
    const since = deps.now() - HOUR_MS
    const recent = (shareSends.get(inboxId) ?? []).filter((at) => at > since)
    shareSends.set(inboxId, recent)
    return recent.length < SHARE_EVENTS_PER_HOUR
  }

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

  function fitEvent(invite: ShareInvite): ShareInvite {
    let fitted = invite
    const withDetails = (details: Partial<ShareInvite['details']>) => {
      fitted = { ...fitted, details: { ...fitted.details, ...details } }
    }
    for (;;) {
      const over = json(fitted).length - MAX_EVENT_PLAINTEXT_BYTES
      if (over <= 0) return fitted

      const pictured = fitted.people?.findLastIndex((guest) => guest.a)
      if (fitted.people && pictured !== undefined && pictured >= 0) {
        fitted = {
          ...fitted,
          people: fitted.people.map((guest, index) =>
            index === pictured ? { t: guest.t, n: guest.n } : guest
          ),
        }
        continue
      }
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

      const kept = note
        .slice(0, Math.max(0, note.length - Math.ceil(over / 6)))
        .replace(/[\uD800-\uDBFF]$/, '')
      withDetails({ note: kept || undefined })
    }
  }

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
      }
    }
    if (saved) deps.onSharedPhotosSaved?.()
  }

  function shareRevs(
    previous: OutgoingShare | undefined,
    hash: string,
    now: number,
    version?: number
  ) {
    const kept = previous?.pending?.hash === hash ? previous.pending.revs : {}
    const floor = (previous?.lastRev ?? 0) + 1
    const fresh = Math.max(now, floor)

    const settled =
      version !== undefined && version >= MIN_SHARE_VERSION
        ? Math.max(version, floor)
        : fresh
    let lastRev = previous?.lastRev ?? 0
    const undone: Record<string, number> = {}
    return {
      fresh,

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

  function publishShares(): Promise<void> {
    return outbox('shares', sendShares)
  }

  async function guestList(
    shareId: string,
    going: string[],
    replies: Record<string, ReceivedReply>
  ): Promise<{ inboxId: string; guest?: ShareGuest }[]> {
    const list: { inboxId: string; guest?: ShareGuest }[] = []
    for (const inboxId of going) {
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
      const name = buddy?.name.trim().slice(0, 60)
      if (!buddy || !name || !replies[inboxId]?.listed) {
        list.push({ inboxId })
        continue
      }
      const avatar = replies[inboxId].photo
        ? await guestAvatar(buddy)
        : undefined
      list.push({
        inboxId,
        guest: {
          t: guestTag(shareId, inboxId),
          n: name,
          ...(avatar ? { a: avatar } : {}),
        },
      })
    }

    return list.sort((a, b) =>
      (a.guest?.n ?? '') + a.inboxId < (b.guest?.n ?? '') + b.inboxId ? -1 : 1
    )
  }

  async function guestAvatar(buddy: Buddy): Promise<ShareGuest['a']> {
    const { avatar } = buddy
    if (!avatar) return undefined
    if (avatar.t === 'emoji') return { t: 'emoji', v: avatar.v }
    if (!deps.shrinkAvatar) return undefined
    const source = toB64u(sha256(utf8(avatar.v))).slice(0, 22)
    const kept = store.getState().guestAvatars[buddy.inboxId]
    if (kept?.source === source) return { t: 'image', v: kept.data }
    const data = await deps.shrinkAvatar(avatar.v).catch(() => undefined)
    if (!data || data.length > MAX_GUEST_AVATAR_CHARS) return undefined
    store.setState((state) => ({
      guestAvatars: {
        ...state.guestAvatars,
        [buddy.inboxId]: { source, data },
      },
    }))
    return { t: 'image', v: data }
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

    const notSent: Record<UnsentShareReason, Set<string>> = {
      suspended: new Set(),
      gone: new Set(),
    }

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
        if (isRelayError(error, 'gone')) {
          forgetBuddy(inboxId)
          return 'dropped'
        }
        const name = buddy.nickname ?? buddy.name

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
      const shareId = shareIdFor(me.inboxId, spec.key)
      const recipients = new Set(spec.recipients.filter(activeBuddy))
      const replies =
        spec.type === 'plan' ? store.getState().shareReplies[shareId] : {}

      const going = [...recipients].filter(
        (inboxId) => replies?.[inboxId]?.status === 'going'
      )
      const listed = going.length > 0

      if (
        previous?.adopted !== undefined &&
        previous.adopted === adoptionHash(spec, activeBuddy) &&
        !listed
      )
        continue

      const ended = spec.endsAt <= now
      if (ended && !Object.keys(previous?.sent ?? {}).length) continue
      const prefix = SHARE_KIND_PREFIX[spec.type]
      const details = await sharedDetails(me, spec)
      const content = { type: spec.type, details, expiresAt: spec.expiresAt }
      const hashOf = (value: unknown) => toB64u(sha256(json(value)))
      const hash = hashOf(content)
      const guests = listed
        ? await guestList(shareId, going, replies ?? {})
        : []

      const contentFor = (inboxId: string) => {
        if (!listed) return content
        const others = guests.filter((guest) => guest.inboxId !== inboxId)
        const people = others.flatMap(({ guest }) => (guest ? [guest] : []))
        const more = others.length - people.length
        return {
          ...content,
          ...(people.length > 0 ? { people } : {}),
          ...(more > 0 ? { more } : {}),
        }
      }

      const revs = shareRevs(
        previous,
        listed
          ? hashOf([...recipients].sort().map((id) => [id, contentFor(id)]))
          : hash,
        now,
        spec.version
      )

      const timing = shareTiming(details)
      const sent = { ...previous?.sent }
      const sentTiming = { ...previous?.sentTiming }
      const unsent = store.getState().unsentShares[spec.key] ?? {}
      const unsentChanges: [string, string, UnsentShare | null][] = []
      const body = {
        v: 1 as const,
        id: shareId,
        type: spec.type,
        ...shareEventExpiry(spec),
        details,
      }
      for (const inboxId of recipients) {
        const theirs = contentFor(inboxId)
        const theirHash = theirs === content ? hash : hashOf(theirs)
        if (sent[inboxId] === theirHash) continue

        if (unsent[inboxId]?.hash === theirHash) continue
        const update = sent[inboxId] !== undefined
        if (ended && !update) continue
        const kind = `${prefix}.${update ? 'update' : 'invite'}`
        const push = !ended && (!update || sentTiming[inboxId] !== timing)
        const rev = revs.take(inboxId, kind, push)
        const { people, more } = theirs as {
          people?: ShareGuest[]
          more?: number
        }
        const outcome = await deliver(
          inboxId,
          kind,
          fitEvent({ ...body, rev, people, more }),
          push,
          (reason, name) =>
            unsentChanges.push([
              spec.key,
              inboxId,
              { reason, name, hash: theirHash, at: now },
            ])
        )
        if (outcome === 'sent') {
          sent[inboxId] = theirHash
          sentTiming[inboxId] = timing
          if (unsent[inboxId]) unsentChanges.push([spec.key, inboxId, null])
        } else if (outcome === 'retry') revs.leave(inboxId, kind, rev)
      }

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
    } catch {}
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
      ...(invite.people ? { people: invite.people } : {}),
      ...(invite.more ? { more: invite.more } : {}),
      alertSeqs: [...(existing?.alertSeqs ?? []), source.seq].slice(
        -MAX_ALERT_SEQS
      ),
    }
    store.setState((state) => ({
      incomingShares: { ...state.incomingShares, [key]: share },

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

    if (!changed || hasSharedEventEnded(share, deps.now())) return

    const unseenInvite = store
      .getState()
      .notifications.some(
        (n) => n.shareKey === key && n.kind === 'shareInvite' && !n.read
      )

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

    if (!existing || existing.rev > rev || existing.status === 'cancelled')
      return
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: { ...existing, rev, status: 'cancelled', cancelledRev: rev },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))

    if (store.getState().answerMarks[key])
      markAnswer(key, { s: 'none', v: rev, r: 0, x: existing.expiresAt })

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
    reply: {
      id: string
      rev: number
      status: ShareReply
      listed?: true
      photo?: true
    }
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
            ...(reply.status === 'going' && reply.listed
              ? { listed: true, ...(reply.photo ? { photo: true } : {}) }
              : {}),
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

  async function replyToShare(
    key: string,
    status: ShareReply,
    { holdMs = 0 }: { holdMs?: number } = {}
  ) {
    const share = store.getState().incomingShares[key]
    if (!share || share.status === 'cancelled') return
    const now = deps.now()

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

    markAnswer(key, { s: status, v: share.rev, r: now, x: share.expiresAt })
    markNotifications(
      store
        .getState()
        .notifications.filter((n) => n.shareKey === key)
        .map((n) => n.id),
      'read'
    )
    if (holdMs > 0) return
    await deliverReplies().catch(() => {})
  }

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

      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        await sendEvent(
          me,
          buddy,
          'share.reply',
          {
            v: 1,
            id: share.shareId,
            rev,
            status: share.status,

            ...(share.status === 'going'
              ? {
                  listed: true,
                  ...(store.getState().sharing.photo ? { photo: true } : {}),
                }
              : {}),
          },
          true,

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
    await deliverJoinRequests().catch(() => {})
  }

  function nextRev(request: OutgoingJoinRequest | undefined) {
    return Math.max(deps.now(), (request?.rev ?? 0) + 1)
  }

  async function withdrawJoinRequest(id: string) {
    withdrawJoinRequests([id])
    await deliverJoinRequests().catch(() => {})
  }

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

  function deliverJoinRequests(): Promise<void> {
    const run = joinDelivery.then(sendJoinRequests)
    joinDelivery = run.catch(() => {})
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

      if (
        !request.withdrawn &&
        request.expiresAt - deps.now() < JOIN_REQUEST_LEAD_MS
      ) {
        withdrawJoinRequests([request.id])
        request = store.getState().askedToJoin[request.id]
      }

      if (request.withdrawn && !request.attempted) {
        markSent(request.id, request.rev)
        continue
      }

      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        if (request.withdrawn) {
          const cancel = { v: 1, id: request.id, rev: request.rev }
          await sendEvent(me, buddy, JOIN_CANCEL_KIND, cancel, false)
        } else {
          const alert = shouldAlert(request)
          const eventId = alert ? (request.alertEventId ?? newId()) : newId()

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

        if (!existing || existing.rev > cancel.rev) return

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

      const start = atMinutesOfDay(
        moment(request.d, 'YYYY-MM-DD'),
        request.s ?? DEFAULT_START_TIME_IN_MINUTES
      ).valueOf()
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

        !!existing || !alertsFor(buddy.inboxId).joinRequests
      )
    } catch {}
  }

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

  async function announceBadges(keys: readonly BadgeKey[]) {
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
    await deliverBadgeAnnouncements().catch(() => {})
  }

  function dropBadgeAnnouncements() {
    if (store.getState().badgeAnnouncements.length > 0)
      store.setState({ badgeAnnouncements: [] })
  }

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

  function deliverBadgeAnnouncements(): Promise<void> {
    const run = badgeDelivery.then(sendBadgeAnnouncements)
    badgeDelivery = run.catch(() => {})
    return run
  }

  function retryBadgesAt(at: number) {
    if (!deps.later || (badgeRetryAt !== null && badgeRetryAt <= at)) return
    badgeRetryAt = at
    deps.later(
      () => {
        if (badgeRetryAt === at) badgeRetryAt = null
        void deliverBadgeAnnouncements().catch(() => {})
        void deliverBadgeReactions().catch(() => {})
      },
      Math.max(0, at - deps.now())
    )
  }

  async function sendBadgeAnnouncements() {
    pruneBadgeAnnouncements()
    if (store.getState().badgeAnnouncements.length === 0) return

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

  function applyBadgeEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number],

    firstSync: boolean
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return

    if (store.getState().seenBadgeEvents[event.eventId] !== undefined) return
    let badges: SharedBadge[]
    try {
      const body = badgeNewSchema.parse(openEvent(me, buddy, event))
      badges = sortedForAnnouncement(knownBadges(body.badges))
    } catch {
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

      !alertsFor(buddy.inboxId).badges || firstSync || at <= now - DAY_MS
    )
  }

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

  async function reactToBadge(
    inboxId: string,
    badge: SharedBadge,
    emoji: BadgeReactionEmoji
  ) {
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
    await deliverBadgeReactions().catch(() => {})
  }

  function deliverBadgeReactions(): Promise<void> {
    const run = badgeDelivery.then(sendBadgeReactions)
    badgeDelivery = run.catch(() => {})
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
      const reaction = store.getState().sentBadgeReactions[inboxId]?.[key]
      const parsed = parseBadgeKey(key)
      if (!reaction || !parsed || reaction.sentRev === reaction.rev) continue
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')

      if (!buddy || !hasShareBudget(inboxId)) continue
      const { rev } = reaction

      const lastAlert = store.getState().lastBadgeReactionAlertAt[inboxId]
      const alert =
        reaction.alertRev === rev ||
        lastAlert === undefined ||
        deps.now() - lastAlert >= BADGE_ALERT_INTERVAL_MS

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

  function applyBadgeReactionEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number],

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
      return
    }
    if (!(deps.showBadges?.() ?? true)) return
    if (!holdsBadge(deps.getProfile().badges, body.badge)) return
    const key = sharedBadgeKey(body.badge)
    const existing = store.getState().badgeReactions[key]?.[buddy.inboxId]

    if (existing && existing.rev >= body.rev) return
    const now = deps.now()
    const at = Number.isFinite(event.createdAt)
      ? Math.min(event.createdAt, now)
      : now

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

      !alertsFor(buddy.inboxId).badges || firstSync || at <= now - DAY_MS
    )
  }

  const activeBuddy = (inboxId: string) =>
    store
      .getState()
      .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')

  function queueCarEvent(
    me: BuddyIdentity,
    event: Omit<OutgoingCarEventInput, 'eventId'>
  ) {
    const eventId = inviteEventId(
      event.kind,
      me.inboxId,
      event.to,
      event.inviteId
    )
    store.setState((state) => ({
      carEvents: {
        ...state.carEvents,
        [eventId]: {
          ...event,
          eventId,
          queuedAt: deps.now(),

          ...(state.carEvents[eventId]?.attempted ? { attempted: true } : {}),
        },
      },
    }))
  }

  async function sendCarInvite(
    to: string,
    invite: CarInvitePayload
  ): Promise<boolean> {
    if (!activeBuddy(to)) return false
    const me = await ensureInbox()

    if (!activeBuddy(to)) return false

    inviteSecrets.put(sentInviteSecretId(invite.inviteId), {
      joinSecret: invite.joinSecret,
      key: invite.key,
    })
    queueCarEvent(me, {
      kind: 'car.invite',
      to,
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      body: {
        v: 1,
        id: invite.spaceId,
        rev: deps.now(),
        inviteId: invite.inviteId,
        epoch: invite.epoch,
        name: invite.name,
        people: invite.people,
        expiresAt: invite.expiresAt,
      },
      push: true,
      expiresAt: invite.expiresAt,
    })
    await deliverCarEvents().catch(() => {})
    return true
  }

  async function carInviteSecrets(key: string): Promise<InviteSecrets | null> {
    if (!(await inviteSecrets.ready()))
      throw new Error('Car invitation secrets unreadable')
    const invite = store.getState().carInvites[key]
    if (invite?.status !== 'pending') return null
    const secrets = inviteSecrets.get(receivedInviteSecretId(key))
    if (!secrets) dropUnjoinableCarInvites()
    return secrets
  }

  function dropUnjoinableCarInvites() {
    const lost = Object.entries(store.getState().carInvites).filter(
      ([key, invite]) =>
        invite.status === 'pending' &&
        !inviteSecrets.get(receivedInviteSecretId(key))
    )
    if (lost.length === 0) return
    const keys = new Set(lost.map(([key]) => key))
    store.setState((state) => ({
      carInvites: Object.fromEntries(
        Object.entries(state.carInvites).filter(([key]) => !keys.has(key))
      ),
      notifications: state.notifications.filter(
        (n) => n.kind !== 'carInvite' || !keys.has(n.shareKey ?? '')
      ),
    }))
    const alerts = lost.flatMap(([, invite]) => invite.alertSeqs ?? [])
    if (alerts.length > 0) deps.dismissAlerts?.(alerts)
  }

  async function sendCarCancel(
    to: string,
    invite: Pick<OpenCarInvite, 'spaceId' | 'inviteId' | 'expiresAt'>
  ) {
    if (!activeBuddy(to)) return
    const me = await ensureInbox()
    if (!queueCarCancel(me, to, invite)) return
    await deliverCarEvents().catch(() => {})
  }

  function queueCarCancel(
    me: BuddyIdentity,
    to: string,
    {
      spaceId,
      inviteId,
      expiresAt,
    }: Pick<OpenCarInvite, 'spaceId' | 'inviteId' | 'expiresAt'>
  ): boolean {
    const inviteEvent = inviteEventId('car.invite', me.inboxId, to, inviteId)
    const waiting = store.getState().carEvents[inviteEvent]
    if (waiting)
      store.setState((state) => ({
        carEvents: omitKey(state.carEvents, inviteEvent),
      }))
    if (waiting && !waiting.attempted) return false
    queueCarEvent(me, {
      kind: 'car.cancel',
      to,
      spaceId,
      inviteId,
      body: { v: 1, id: spaceId, rev: deps.now(), inviteId },
      push: false,
      expiresAt,
    })
    return true
  }

  async function answerCarInvite(
    key: string,
    answer: CarReply,
    options: { confirmedJoin?: boolean } = {}
  ): Promise<boolean> {
    const answerable = (invite: IncomingCarInvite | undefined) =>
      invite?.status === 'pending' ||
      (options.confirmedJoin === true &&
        answer === 'joined' &&
        invite?.status === 'joined' &&
        !store.getState().answerMarks[key])
    if (!answerable(store.getState().carInvites[key])) return false
    const me = await ensureInbox()
    const now = deps.now()

    const answered = store.getState().carInvites[key]
    if (!answered || !answerable(answered)) return false
    store.setState((state) => ({
      carInvites: {
        ...state.carInvites,
        [key]: answeredCarInvite(answered, answer, now),
      },
      notifications: state.notifications.map((n) =>
        n.shareKey === key && !n.read ? { ...n, read: true } : n
      ),
    }))
    markAnswer(key, {
      s: answer === 'joined' ? 'going' : 'declined',
      v: answered.rev,
      r: now,
      x: answered.expiresAt,
    })
    markNotifications(
      store
        .getState()
        .notifications.filter((n) => n.shareKey === key)
        .map((n) => n.id),
      'read'
    )
    if (!activeBuddy(answered.from)) return true
    queueCarEvent(me, {
      kind: 'car.reply',
      to: answered.from,
      spaceId: answered.spaceId,
      inviteId: answered.inviteId,
      body: {
        v: 1,
        id: answered.spaceId,
        rev: now,
        inviteId: answered.inviteId,
        status: answer,
      },
      push: answer === 'joined',
      expiresAt: now + CAR_REPLY_TTL_MS,
    })
    await deliverCarEvents().catch(() => {})
    return true
  }

  function deliverCarEvents(): Promise<void> {
    const run = carDelivery.then(sendCarEvents)
    carDelivery = run.catch(() => {})
    return run
  }

  async function sendCarEvents() {
    const now = deps.now()
    store.setState((state) => {
      const carEvents = unexpiredCarEvents(state.carEvents, now)
      return carEvents === state.carEvents ? state : { carEvents }
    })
    if (Object.keys(store.getState().carEvents).length === 0) return
    const me = await ensureInbox()
    await dropLostCarInvites(me)
    const waiting = Object.values(store.getState().carEvents).sort(
      (a, b) => a.queuedAt - b.queuedAt || a.eventId.localeCompare(b.eventId)
    )
    const drop = (eventId: string) =>
      store.setState((state) => ({
        carEvents: omitKey(state.carEvents, eventId),
      }))

    const notSent: Record<UnsentShareReason, Set<string>> = {
      suspended: new Set(),
      gone: new Set(),
    }
    let failure: unknown = null
    for (const { eventId } of waiting) {
      const event = store.getState().carEvents[eventId]
      if (!event) continue
      const buddy = activeBuddy(event.to)
      if (!buddy) {
        drop(eventId)
        continue
      }
      const invitation = event.kind === 'car.invite'

      if (
        invitation &&
        deps.cars?.inviteOpen?.(event.spaceId, event.inviteId) === false
      ) {
        drop(eventId)
        continue
      }
      let body = event.body
      if (invitation) {
        const secrets = inviteSecrets.get(sentInviteSecretId(event.inviteId))
        if (!secrets) continue
        body = { ...body, ...secrets }
      }

      if (!hasShareBudget(buddy.inboxId)) continue

      store.setState((state) => ({
        carEvents: state.carEvents[eventId]
          ? {
              ...state.carEvents,
              [eventId]: { ...state.carEvents[eventId], attempted: true },
            }
          : state.carEvents,
      }))
      try {
        await sendEvent(me, buddy, event.kind, body, event.push, event.eventId)
        spendShareBudget(buddy.inboxId)
        drop(eventId)
      } catch (error) {
        const name = buddy.nickname ?? buddy.name

        if (isRelayError(error, 'gone')) {
          if (invitation) notSent.gone.add(name)
          forgetBuddy(buddy.inboxId)
        } else if (isRelayError(error, 'not_found')) {
          if (invitation) notSent.gone.add(name)
          drop(eventId)
        } else if (invitation && isRelayError(error, 'suspended')) {
          notSent.suspended.add(name)
          drop(eventId)
        } else failure ??= error
      }
    }
    for (const reason of ['suspended', 'gone'] as const)
      if (notSent[reason].size > 0)
        deps.onSharesNotSent?.({ reason, names: [...notSent[reason]] })
    if (failure) throw failure
  }

  async function dropLostCarInvites(me: BuddyIdentity) {
    const invites = () =>
      Object.values(store.getState().carEvents).filter(
        (event) => event.kind === 'car.invite'
      )
    if (invites().length === 0 || !(await inviteSecrets.ready())) return
    const lost = invites().filter(
      (event) =>
        !inviteSecrets.get(sentInviteSecretId(event.inviteId)) &&
        activeBuddy(event.to) &&
        deps.cars?.inviteOpen?.(event.spaceId, event.inviteId) !== false
    )
    for (const event of lost) queueCarCancel(me, event.to, event)
    for (const { to, spaceId, inviteId } of lost)
      deps.cars?.onInviteLost?.({ to, spaceId, inviteId })
  }

  function applyCarEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number],
    firstSync: boolean
  ) {
    if (!deps.cars) return
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    if (store.getState().seenCarEvents[event.eventId] !== undefined) return
    let notice: CarEventNotice | null
    try {
      const body = openEvent(me, buddy, event)
      const source = { id: event.eventId, seq: event.seq }
      const now = deps.now()
      const at = Number.isFinite(event.createdAt)
        ? Math.min(event.createdAt, now)
        : now
      notice =
        event.kind === 'car.invite'
          ? applyCarInvite(buddy, source, carInviteEventSchema.parse(body), {
              at,
              read: firstSync,
            })
          : event.kind === 'car.cancel'
            ? applyCarCancel(buddy, carCancelEventSchema.parse(body))
            : applyCarReply(buddy, source, carReplyEventSchema.parse(body), {
                at,
                read: firstSync,
              })
    } catch {
      return
    }
    const now = deps.now()
    store.setState((state) => ({
      seenCarEvents: {
        ...Object.fromEntries(
          Object.entries(state.seenCarEvents).filter(
            ([, seenAt]) => seenAt + SEEN_CAR_EVENT_TTL_MS > now
          )
        ),
        [event.eventId]: now,
      },
    }))
    if (notice) deps.cars.onEvent?.(notice)
  }

  function applyCarInvite(
    buddy: Buddy,
    source: EventSource,
    invite: CarInviteEvent,
    { at, read }: { at: number; read: boolean }
  ): CarEventNotice | null {
    const now = deps.now()
    const expiresAt = Math.min(
      invite.expiresAt,
      now + INCOMING_CAR_INVITE_MAX_MS
    )
    if (expiresAt <= now) return null
    const key = incomingCarInviteKey(buddy.inboxId, invite.inviteId)
    const state = store.getState()

    if (state.carInvites[key]) return null
    const onCar = deps.cars?.isOnCar?.(invite.id) ?? false
    const replaced = Object.entries(state.carInvites).filter(
      ([, other]) =>
        other.from === buddy.inboxId &&
        other.spaceId === invite.id &&
        other.status === 'pending'
    )
    const replacedKeys = new Set(replaced.map(([other]) => other))
    const wasRead = state.notifications.some(
      (n) => n.shareKey !== undefined && replacedKeys.has(n.shareKey) && n.read
    )

    if (!onCar)
      inviteSecrets.put(receivedInviteSecretId(key), {
        joinSecret: invite.joinSecret,
        key: invite.key,
      })
    store.setState((current) => ({
      carInvites: {
        ...Object.fromEntries(
          Object.entries(current.carInvites).map(([other, candidate]) => [
            other,
            replacedKeys.has(other)
              ? answeredCarInvite(candidate, 'cancelled', now)
              : candidate,
          ])
        ),
        [key]: {
          from: buddy.inboxId,
          spaceId: invite.id,
          inviteId: invite.inviteId,
          rev: invite.rev,
          name: Array.from(invite.name.trim())
            .slice(0, CAR_INVITE_NAME_MAX)
            .join(''),
          people: invite.people,
          expiresAt,
          receivedAt: now,
          ...(onCar
            ? { status: 'joined', answeredAt: now }
            : { status: 'pending', join: { epoch: invite.epoch } }),
          alertSeqs: [source.seq],
        },
      },
      notifications: current.notifications.filter(
        (n) => n.shareKey === undefined || !replacedKeys.has(n.shareKey)
      ),
    }))
    for (const [, other] of replaced)
      if (other.alertSeqs?.length) deps.dismissAlerts?.(other.alertSeqs)
    notify(
      {
        ...source,
        kind: 'carInvite',
        from: buddy.inboxId,
        name: buddy.name,
        shareKey: key,
        at,
      },
      read || wasRead || onCar
    )
    return {
      kind: 'car.invite',
      from: buddy.inboxId,
      spaceId: invite.id,
      inviteId: invite.inviteId,
    }
  }

  function applyCarCancel(
    buddy: Buddy,
    cancel: CarCancelEvent
  ): CarEventNotice {
    const now = deps.now()
    const key = incomingCarInviteKey(buddy.inboxId, cancel.inviteId)
    const existing = store.getState().carInvites[key]
    const notice: CarEventNotice = {
      kind: 'car.cancel',
      from: buddy.inboxId,
      spaceId: cancel.id,
      inviteId: cancel.inviteId,
    }
    if (existing?.status === 'joined' || existing?.status === 'cancelled')
      return notice
    store.setState((state) => ({
      carInvites: {
        ...state.carInvites,
        [key]: existing
          ? answeredCarInvite(existing, 'cancelled', now)
          : {
              from: buddy.inboxId,
              spaceId: cancel.id,
              inviteId: cancel.inviteId,
              rev: cancel.rev,
              name: '',
              people: 0,

              expiresAt: now + INCOMING_CAR_INVITE_MAX_MS,
              receivedAt: now,
              status: 'cancelled',
            },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
    if (existing?.alertSeqs?.length) deps.dismissAlerts?.(existing.alertSeqs)
    return notice
  }

  function applyCarReply(
    buddy: Buddy,
    source: EventSource,
    reply: CarReplyEvent,
    { at, read }: { at: number; read: boolean }
  ): CarEventNotice | null {
    const ref = {
      from: buddy.inboxId,
      spaceId: reply.id,
      inviteId: reply.inviteId,
    }
    if (!deps.cars?.replyApplies(ref)) return null
    if (reply.status === 'joined')
      notify(
        {
          ...source,
          kind: 'carJoined',
          from: buddy.inboxId,
          name: buddy.name,
          spaceId: reply.id,
          at,
        },
        read
      )
    return { kind: 'car.reply', ...ref, status: reply.status }
  }

  function noteCarMemberships() {
    saveRosterSoon()
  }

  function queueCarCancelsTo(me: BuddyIdentity, inboxId: string) {
    for (const invite of deps.cars?.openInvitesTo(inboxId) ?? [])
      queueCarCancel(me, inboxId, invite)
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

  function dismissNotification(id: string) {
    settleCarInvites()
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
      return null
    }
  }

  function isStaleRoster(roster: Roster): boolean {
    return (
      roster.version !== undefined &&
      roster.version < store.getState().rosterVersion
    )
  }

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

    const endedHere = state.buddies.filter(ended)

    for (const buddy of endedHere) noteUnsentTo(buddy.inboxId)
    const buddies = [
      ...state.buddies
        .filter((local) => !ended(local))
        .map((local): Buddy => {
          const theirs = remote.buddies.find((b) => b.inboxId === local.inboxId)

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

    deps.cars?.mergeMemberships({
      cars: remote.cars,
      leftCars: remote.leftCars,
    })
    applyMarks()

    if (endedHere.length > 0) queueRemoval(endedHere)
    return added.map((b) => b.inboxId)
  }

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

    const isOnCar = deps.cars?.isOnCar
    let carInvites = state.carInvites
    let carEvents = state.carEvents
    for (const [key, mark] of Object.entries(answerMarks)) {
      const invite = carInvites[key]
      if (!invite || invite.status === 'cancelled' || mark.s === 'none')
        continue
      if (invite.status !== 'pending' && mark.r <= (invite.answeredAt ?? 0))
        continue
      const status = mark.s === 'going' ? 'joined' : 'declined'
      if (status === 'declined' && isOnCar?.(invite.spaceId)) continue
      answered.add(key)
      carInvites = {
        ...carInvites,
        [key]: answeredCarInvite(invite, status, mark.r),
      }
      const waiting = Object.values(carEvents).find(
        (event) =>
          event.kind === 'car.reply' &&
          event.to === invite.from &&
          event.inviteId === invite.inviteId
      )
      if (waiting) carEvents = omitKey(carEvents, waiting.eventId)
    }

    const onCars = settledCarInvites(carInvites, isOnCar, deps.now())
    carInvites = onCars.carInvites
    for (const key of onCars.settled) answered.add(key)
    const { read, dismissed } = notificationMarks
    const answerState = {
      incomingClaims: state.incomingClaims,
      incomingShares,
      carInvites,
    }
    const now = deps.now()

    const passedOver = new Set(
      state.notifications
        .filter(
          (n) => n.id in dismissed && n.kind === 'joinRequest' && !!n.shareKey
        )
        .map((n) => n.shareKey!)
    )
    const notifications = state.notifications
      .filter((n) => !(n.id in dismissed) || awaitsAnswer(n, answerState, now))
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
      carInvites !== state.carInvites ||
      carEvents !== state.carEvents ||
      notifications.length !== state.notifications.length ||
      notifications.some((n, index) => n !== state.notifications[index])
    if (changed)
      store.setState({
        incomingShares,
        notifications,
        joinRequests,
        carInvites,
        carEvents,
      })
  }

  function settleCarInvites() {
    const state = store.getState()
    const { carInvites, settled } = settledCarInvites(
      state.carInvites,
      deps.cars?.isOnCar,
      deps.now()
    )
    if (settled.length === 0) return
    const keys = new Set(settled)
    store.setState({
      carInvites,
      notifications: state.notifications.map((n) =>
        !n.read && n.shareKey !== undefined && keys.has(n.shareKey)
          ? { ...n, read: true }
          : n
      ),
    })
  }

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

  function expireLocal() {
    settleCarInvites()
    const now = deps.now()
    const lapsedAlerts = Object.values(store.getState().carInvites)
      .filter(
        (invite) => invite.status === 'pending' && invite.expiresAt <= now
      )
      .flatMap((invite) => invite.alertSeqs ?? [])
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
    if (lapsedAlerts.length > 0) deps.dismissAlerts?.(lapsedAlerts)
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

  async function restoreInbox(me: BuddyIdentity, call?: RelayCallOptions) {
    store.setState({ slotsNeedRestore: true })

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

    const current = await identity({ fresh: true })
    const registered = store.getState().registeredInboxId

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

    const staleRoster = readBack !== null && isStaleRoster(readBack)
    const remoteRoster = staleRoster ? null : readBack
    if (remoteRoster) {
      const learned = mergeRoster(me, remoteRoster)

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
      } else if (CAR_EVENT_KINDS.includes(event.kind)) {
        applyCarEvent(me, event, firstSync)
      }
    }
    for (const card of response.cards) applyCard(me, card)

    applyMarks()

    if (
      Object.values(store.getState().carInvites).some(
        (invite) => invite.status === 'pending'
      ) &&
      (await inviteSecrets.ready())
    )
      dropUnjoinableCarInvites()

    const liveSlots = new Set(response.slots.map((slot) => slot.slotId))
    for (const buddy of store.getState().buddies) {
      const { slotId } = pairKeys(me, buddy).incoming
      if (!liveSlots.has(slotId) && !slotsAddedDuringSync.has(slotId)) {
        forgetBuddy(buddy.inboxId)
        rosterChanged = true
      }
    }

    rosterChanged = expireStale() || rosterChanged

    if (firstSync) adoptShares()

    store.setState({ syncSeq: response.seq, lastSyncAt: deps.now() })
    onRead()

    coolDownUntil = 0
    cancelled(call)
    await flushRemovals(me)
    if (await confirmUnsureInvites()) rosterChanged = true
    await deliverReplies().catch(() => {})
    await deliverJoinRequests().catch(() => {})
    await deliverBadgeAnnouncements().catch(() => {})
    await deliverBadgeReactions().catch(() => {})
    await deliverCarEvents().catch(() => {})

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

  function coolingDown(): boolean {
    return deps.now() < coolDownUntil
  }

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
      .catch(() => {})
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

  async function openLive() {
    return relay.openLive(ownerAuth(await ensureInbox()))
  }

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

  async function registerPush(
    device: PushAddress & {
      templates: Partial<
        Record<BuddyPushKind | BadgePushKind | CarPushKind, PushTemplate>
      > &
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
      store.setState({ pushRegistrationKey: null })
      throw error
    }
    store.setState({
      pushRegistrationKey: registrationKey,
      pushRegisteredAt: deps.now(),
    })
    return unchanged ? 'refreshed' : 'registered'
  }

  async function currentIdentity(): Promise<BuddyIdentity> {
    const me = await identity({ fresh: true })
    const registered = store.getState().registeredInboxId
    if (registered !== null && registered !== me.inboxId) {
      await syncInFlight?.catch(() => undefined)
      await resetLocalState()
    }
    return me
  }

  async function deleteEverything() {
    const me = await currentIdentity()
    const cars = await deps.cars?.leaveAll?.()
    const notLeft = carsNotLeft(cars)
    if (notLeft.length > 0)
      throw new BuddyRemovalPendingError('everything', notLeft)
    queueRemoval(store.getState().buddies)
    await flushRemovals(me, { force: true })
    if (store.getState().pendingRemovals.length > 0)
      throw new BuddyRemovalPendingError('everything')

    deletedIdentities.add(me)
    try {
      try {
        await relay.deleteInbox(ownerAuth(me))
      } catch (error) {
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

  async function leaveThisDevice() {
    const me = await currentIdentity()
    const cars = await deps.cars?.finishPending?.()
    if (store.getState().pendingRemovals.length > 0)
      await flushRemovals(me, { force: true })
    if (store.getState().pendingRemovals.length > 0 || (cars?.pending ?? 0) > 0)
      throw new BuddyRemovalPendingError('everything')

    await deliverCarEvents().catch(() => {})

    leftInboxes.add(me.inboxId)
    const { deviceId, registeredInboxId } = store.getState()
    if (deviceId && registeredInboxId === me.inboxId) {
      try {
        await relay.unregisterDevice(ownerAuth(me), deviceId)
      } catch (error) {
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

  async function resetLocalState() {
    deps.cars?.forgetLocal?.()
    inviteSecrets.clear()
    shareSends.clear()
    lastAlertSentAt.clear()
    removalRetries.clear()
    recentEvents.clear()
    slotsAddedDuringSync.clear()
    coolDownUntil = 0

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
    setPetVisits,
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
    sendCarInvite,
    sendCarCancel,
    answerCarInvite,
    carInviteSecrets,
    deliverCarEvents,
    noteCarMemberships,

    ownCardName: () => cardName().name,
    expire: expireLocal,
    shareIdForKey,
    markNotificationsRead,
    markNotificationRead,
    dismissNotification,
    sync,
    coolingDown,

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
