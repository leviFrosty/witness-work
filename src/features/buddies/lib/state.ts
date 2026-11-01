import type { RichTextDoc } from '@/types/richText'
import type {
  BuddyAvatar,
  BuddyCardDay,
  CarReply,
  BuddyPet,
  BuddyPlanTimes,
  BuddyPlatform,
  BuddyStreak,
  BuddyTenure,
  Roster,
  ShareDetails,
  ShareGuest,
  ShareReply,
  ShareType,
} from '@/features/buddies/lib/schemas'
import type { BadgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import type { SharedBadge } from '@/types/badges'
import type { BuddyShareRef } from '@/types/timeEntry'
import { SPACE_LIMITS } from '@/lib/sharedSpaces/client'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'

export const MAX_BUDDIES = 5
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const MAX_OPEN_INVITES = 3

export type BuddyProfile = {
  name: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure

  badges?: SharedBadge[]

  photoUnavailable?: boolean
}

export type BuddySharing = {
  photo: boolean
  tenure: boolean
  streak: boolean

  updatedAt: number

  badges: boolean

  badgesUpdatedAt: number

  pet: boolean

  petUpdatedAt: number

  plans: boolean

  planTimes: BuddyPlanTimes

  pausedUntil: number

  plansUpdatedAt: number

  showOnCalendar: boolean

  calendarUpdatedAt: number

  petVisits: boolean

  petVisitsUpdatedAt: number
}

export type BuddySettings = Pick<
  BuddySharing,
  | 'photo'
  | 'tenure'
  | 'streak'
  | 'badges'
  | 'pet'
  | 'plans'
  | 'planTimes'
  | 'showOnCalendar'
  | 'petVisits'
>
export type BuddySettingKey = keyof BuddySettings

export type BuddyOverrides = Partial<BuddySettings>

export type BuddyAlertSettings = {
  joinRequests: boolean

  badges: boolean
}
export type BuddyAlertKey = keyof BuddyAlertSettings
export type BuddyAlertOverrides = Partial<BuddyAlertSettings>

export type BuddySettingSource = 'buddy' | 'all'

export type ResolvedSettings<T> = {
  settings: T
  sources: Record<keyof T, BuddySettingSource>
}

export function resolveSettings<T extends object>(
  defaults: T,
  overrides: Partial<T> | undefined
): ResolvedSettings<T> {
  const settings = { ...defaults }
  const sources = {} as Record<keyof T, BuddySettingSource>
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const own = overrides?.[key]
    if (own !== undefined) settings[key] = own as T[keyof T]
    sources[key] = own !== undefined ? 'buddy' : 'all'
  }
  return { settings, sources }
}

export function allBuddiesSettings(sharing: BuddySharing): BuddySettings {
  return {
    photo: sharing.photo,
    tenure: sharing.tenure,
    streak: sharing.streak,
    badges: sharing.badges,
    pet: sharing.pet,
    plans: sharing.plans,
    planTimes: sharing.planTimes,
    showOnCalendar: sharing.showOnCalendar,
    petVisits: sharing.petVisits,
  }
}

export function buddySettings(
  sharing: BuddySharing,
  buddy: Pick<Buddy, 'overrides'>
): ResolvedSettings<BuddySettings> {
  return resolveSettings(allBuddiesSettings(sharing), buddy.overrides)
}

export function buddyAlertSettings(
  state: Pick<
    BuddiesState,
    'joinRequestNotifications' | 'badgeNotifications' | 'alertOverrides'
  >,
  inboxId: string
): ResolvedSettings<BuddyAlertSettings> {
  return resolveSettings(
    {
      joinRequests: state.joinRequestNotifications,
      badges: state.badgeNotifications,
    },
    state.alertOverrides[inboxId]
  )
}

export function ownSettingsCount(
  buddy: Pick<Buddy, 'inboxId' | 'overrides'>,
  alertOverrides: BuddiesState['alertOverrides']
): number {
  return (
    Object.keys(buddy.overrides ?? {}).length +
    Object.keys(alertOverrides[buddy.inboxId] ?? {}).length
  )
}

export function withOverride<T extends object, K extends keyof T>(
  overrides: Partial<T> | undefined,
  key: K,
  value: T[K] | undefined
): Partial<T> | undefined {
  const next: Partial<T> = { ...overrides }
  if (value === undefined) delete next[key]
  else next[key] = value
  return Object.keys(next).length > 0 ? next : undefined
}

export function rosterOverrides(
  entry: { showOnCalendar: boolean; overrides?: BuddyOverrides },
  sharing: BuddySharing,
  previous: BuddyOverrides | undefined
): BuddyOverrides | undefined {
  if (entry.overrides) {
    const own = Object.fromEntries(
      Object.entries(entry.overrides).filter(([, value]) => value !== undefined)
    )
    return Object.keys(own).length > 0 ? own : undefined
  }
  const shown = previous?.showOnCalendar ?? sharing.showOnCalendar
  return entry.showOnCalendar === shown
    ? previous
    : withOverride(previous, 'showOnCalendar', entry.showOnCalendar)
}

export const PAUSED_INDEFINITELY = Number.MAX_SAFE_INTEGER

export function isSharingPaused(
  sharing: Pick<BuddySharing, 'pausedUntil'>,
  now: number
): boolean {
  return sharing.pausedUntil > now
}

const PLAN_TIMES_PRIVACY: Record<BuddyPlanTimes, number> = {
  exact: 0,
  timeOfDay: 1,
  daysOnly: 2,
}

export function mergeCardName(local: CardName, remote: CardName | undefined) {
  return remote && remote.updatedAt >= local.updatedAt ? remote : local
}

function mergeStampedChoice(
  local: { on: boolean; at: number },
  remote: { on: boolean | undefined; at: number | undefined }
): { on: boolean; at: number } {
  if (remote.on === undefined) return local
  const remoteAt = remote.at ?? 0
  return {
    on:
      remoteAt === local.at
        ? local.on && remote.on
        : remoteAt > local.at
          ? remote.on
          : local.on,
    at: Math.max(remoteAt, local.at),
  }
}

export function mergeSharing(
  local: BuddySharing,
  remote: Roster['sharing']
): BuddySharing {
  const later = remote.updatedAt > local.updatedAt
  const badges = mergeStampedChoice(
    { on: local.badges, at: local.badgesUpdatedAt },
    { on: remote.badges, at: remote.badgesUpdatedAt }
  )
  const pet = mergeStampedChoice(
    { on: local.pet, at: local.petUpdatedAt },
    { on: remote.pet, at: remote.petUpdatedAt }
  )
  const petVisits = mergeStampedChoice(
    { on: local.petVisits, at: local.petVisitsUpdatedAt },
    { on: remote.petVisits, at: remote.petVisitsUpdatedAt }
  )
  return {
    photo: later ? remote.photo : local.photo,
    tenure: later ? remote.tenure : local.tenure,
    streak: later ? remote.streak : local.streak,
    updatedAt: later ? remote.updatedAt : local.updatedAt,
    badges: badges.on,
    badgesUpdatedAt: badges.at,
    pet: pet.on,
    petUpdatedAt: pet.at,
    ...mergePlanSharing(local, remote),
    ...mergeCalendarSharing(local, remote),
    petVisits: petVisits.on,
    petVisitsUpdatedAt: petVisits.at,
  }
}

function mergePlanSharing(
  local: BuddySharing,
  remote: Roster['sharing']
): Pick<
  BuddySharing,
  'plans' | 'planTimes' | 'pausedUntil' | 'plansUpdatedAt'
> {
  const mine = {
    plans: local.plans,
    planTimes: local.planTimes,
    pausedUntil: local.pausedUntil,
    plansUpdatedAt: local.plansUpdatedAt,
  }
  const remoteAt = remote.plansUpdatedAt
  if (remoteAt === undefined || remoteAt < local.plansUpdatedAt) return mine
  const plans = remote.plans ?? true
  const planTimes = remote.planTimes ?? 'exact'
  const pausedUntil = remote.pausedUntil ?? 0
  if (remoteAt > local.plansUpdatedAt)
    return { plans, planTimes, pausedUntil, plansUpdatedAt: remoteAt }
  return {
    plans: plans && local.plans,
    planTimes:
      PLAN_TIMES_PRIVACY[planTimes] > PLAN_TIMES_PRIVACY[local.planTimes]
        ? planTimes
        : local.planTimes,
    pausedUntil: Math.max(pausedUntil, local.pausedUntil),
    plansUpdatedAt: remoteAt,
  }
}

export function migrateLegacySettings(
  restored: Partial<BuddiesState> & { mutedJoinRequests?: string[] }
): Partial<BuddiesState> {
  const { mutedJoinRequests, ...rest } = restored
  return {
    ...rest,
    ...(rest.buddies && {
      buddies: rest.buddies.map((stored) => {
        const { showOnCalendar, ...buddy } = stored as Buddy & {
          showOnCalendar?: boolean
        }
        return showOnCalendar === false &&
          buddy.overrides?.showOnCalendar === undefined
          ? { ...buddy, overrides: { ...buddy.overrides, showOnCalendar } }
          : buddy
      }),
    }),
    ...(mutedJoinRequests && {
      alertOverrides: {
        ...Object.fromEntries(
          mutedJoinRequests.map((inboxId) => [inboxId, { joinRequests: false }])
        ),
        ...rest.alertOverrides,
      },
    }),
  }
}

function mergeCalendarSharing(
  local: BuddySharing,
  remote: Roster['sharing']
): Pick<BuddySharing, 'showOnCalendar' | 'calendarUpdatedAt'> {
  const remoteAt = remote.calendarUpdatedAt
  if (remoteAt === undefined || remoteAt < local.calendarUpdatedAt)
    return {
      showOnCalendar: local.showOnCalendar,
      calendarUpdatedAt: local.calendarUpdatedAt,
    }
  const shown = remote.showOnCalendar ?? true
  return {
    showOnCalendar:
      remoteAt > local.calendarUpdatedAt
        ? shown
        : shown && local.showOnCalendar,
    calendarUpdatedAt: remoteAt,
  }
}

export type BuddyStatus = 'active' | 'awaitingConfirm'

export type Buddy = {
  inboxId: string

  name: string

  nickname?: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure

  streak?: BuddyStreak
  dhPub: string

  inviteSecret: string
  status: BuddyStatus
  pairedAt: number

  colorIndex: number

  color?: string

  overrides?: BuddyOverrides

  prefsAt?: number

  expiresAt?: number

  badges?: SharedBadge[]

  pet?: BuddyPet
}

export type OutgoingInvite = {
  inviteId: string
  secret: string
  createdAt: number
  expiresAt: number
}

export type IncomingClaim = {
  inviteId: string
  secret: string
  name: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
  dhPub: string
  inboxId: string

  platform?: BuddyPlatform
  receivedAt: number
  expiresAt: number
}

export type PendingRemoval = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

export type RemovedBuddies = Record<string, number>

export const MAX_REMOVED_BUDDIES = 200

export const MAX_ROSTER_PLAINTEXT_BYTES = 32 * 1024 - 29

export function pairingEnded(
  removedBuddies: RemovedBuddies,
  buddy: Pick<Buddy, 'inboxId' | 'pairedAt'>
): boolean {
  const removedAt = removedBuddies[buddy.inboxId]
  return removedAt !== undefined && buddy.pairedAt <= removedAt
}

export function mergeRemovedBuddies(
  local: RemovedBuddies,
  remote: RemovedBuddies
): RemovedBuddies {
  const merged = { ...local }
  for (const [inboxId, removedAt] of Object.entries(remote))
    merged[inboxId] = Math.max(merged[inboxId] ?? removedAt, removedAt)
  const entries = Object.entries(merged)
  if (entries.length <= MAX_REMOVED_BUDDIES) return merged
  return Object.fromEntries(
    entries
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .slice(0, MAX_REMOVED_BUDDIES)
  )
}

export type ReceivedCard = {
  name: string
  updatedAt: number
  receivedAt: number
  days: BuddyCardDay[]
}

export type OutgoingShareSpec = {
  key: string
  type: ShareType
  details: ShareDetails

  noteDoc?: RichTextDoc

  recipients: string[]

  endsAt: number

  expiresAt: number

  version?: number
}

export type UploadedSharedPhoto = {
  blob: string
  key: string
  token: string

  expiresAt: number
  w: number
  h: number
}

export type UploadedProfilePhoto = {
  thumbnail: string
  blob: string
  key: string
  token: string

  expiresAt: number
}

export type OutgoingShare = {
  shareId: string
  type: ShareType

  endsAt?: number
  expiresAt: number

  sent: Record<string, string>

  sentTiming?: Record<string, string>

  lastRev?: number

  pending?: { hash: string; revs: Record<string, number> }

  adopted?: string
}

export const ADOPTED_SHARE_HASH = 'adopted'

export type UnsentShareReason = 'suspended' | 'gone'

export type UnsentShare = {
  reason: UnsentShareReason

  name: string

  hash?: string

  at: number
}

export type CardName = {
  name: string

  updatedAt: number
}

export type IncomingShareStatus = 'pending' | ShareReply | 'cancelled'

export type IncomingShare = {
  from: string
  shareId: string
  type: ShareType
  rev: number
  details: ShareDetails
  expiresAt: number
  receivedAt: number
  status: IncomingShareStatus

  unsentReplyRev?: number

  replySendAt?: number

  alertSeqs?: number[]

  cancelledRev?: number

  people?: ShareGuest[]

  more?: number
}

export type AnswerMark = {
  s: ShareReply | 'none'
  v: number
  r: number
  x: number
}

export function newerAnswer(
  mark: AnswerMark,
  other: AnswerMark | undefined
): boolean {
  if (!other) return true
  if (mark.v !== other.v) return mark.v > other.v
  if ((mark.s === 'none') !== (other.s === 'none')) return mark.s === 'none'
  return mark.r > other.r
}

export function answerApplies(
  share: Pick<IncomingShare, 'status' | 'cancelledRev'>,
  mark: AnswerMark
): mark is AnswerMark & { s: ShareReply } {
  return (
    mark.s !== 'none' &&
    share.status !== 'cancelled' &&
    mark.v > (share.cancelledRev ?? -1)
  )
}

export const MAX_ANSWER_MARKS = 50

export const MAX_NOTIFICATION_MARKS = 100

export function mergeAnswerMarks(
  local: Record<string, AnswerMark>,
  remote: Record<string, AnswerMark>,
  now: number
): Record<string, AnswerMark> {
  const merged = { ...local }
  for (const [key, mark] of Object.entries(remote))
    if (newerAnswer(mark, merged[key])) merged[key] = mark
  return Object.fromEntries(
    Object.entries(merged)
      .filter(([, mark]) => mark.x > now)
      .sort(([a, x], [b, y]) => y.r - x.r || y.v - x.v || a.localeCompare(b))
      .slice(0, MAX_ANSWER_MARKS)
  )
}

export type NotificationMarks = {
  read: Record<string, number>
  dismissed: Record<string, number>
}

export function mergeNotificationMarks(
  local: NotificationMarks,
  remote: NotificationMarks,
  now: number
): NotificationMarks {
  const later = (
    a: Record<string, number>,
    b: Record<string, number>
  ): Record<string, number> => {
    const merged = { ...a }
    for (const [id, x] of Object.entries(b))
      merged[id] = Math.max(merged[id] ?? x, x)
    return merged
  }
  const dismissed = later(local.dismissed, remote.dismissed)
  const read = Object.fromEntries(
    Object.entries(later(local.read, remote.read)).filter(
      ([id]) => !(id in dismissed)
    )
  )
  const kept = new Set(
    [
      ...Object.entries(dismissed).map(([id, x]) => ({ id, x, dismissed: 1 })),
      ...Object.entries(read).map(([id, x]) => ({ id, x, dismissed: 0 })),
    ]
      .filter((mark) => mark.x > now)

      .sort(
        (a, b) =>
          b.x - a.x || b.dismissed - a.dismissed || a.id.localeCompare(b.id)
      )
      .slice(0, MAX_NOTIFICATION_MARKS)
      .map((mark) => mark.id)
  )
  const keep = (marks: Record<string, number>) =>
    Object.fromEntries(Object.entries(marks).filter(([id]) => kept.has(id)))
  return { read: keep(read), dismissed: keep(dismissed) }
}

export const NOTIFICATION_MARK_TTL_MS = 31 * 24 * 60 * 60 * 1000

export const REPLY_HOLD_MS = 15 * 1000

export const replyHoldMs = (reply: ShareReply) =>
  reply === 'declined' ? REPLY_HOLD_MS : 0

export type ReceivedReply = {
  status: ShareReply
  rev: number
  at: number

  listed?: true

  photo?: true
}

export type IncomingJoinRequest = {
  from: string
  id: string
  rev: number

  d: string
  s?: number
  m?: number
  expiresAt: number
  receivedAt: number

  dismissed?: boolean

  withdrawn?: boolean
}

export type OutgoingJoinRequest = {
  to: string
  id: string
  d: string
  s?: number
  m?: number
  expiresAt: number
  askedAt: number

  rev: number

  sentRev?: number

  attempted: boolean

  alertEventId?: string
  alertRev?: number

  pushed: boolean

  withdrawn?: boolean
}

export const JOIN_REQUEST_LEAD_MS = 2 * 60 * 60 * 1000

export const MAX_OPEN_JOIN_REQUESTS = 3

export const JOIN_REQUEST_ALERTS_PER_DAY = 3

export type BadgeAnnouncement = {
  id: string
  badges: SharedBadge[]
  createdAt: number

  recipients: string[]

  sent: Record<string, true>

  alerted: Record<string, true>
}

export const BADGE_ANNOUNCEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const BADGE_ALERT_INTERVAL_MS = 20 * 60 * 60 * 1000

export type SentBadgeReaction = {
  e: BadgeReactionEmoji

  rev: number

  at: number

  sentRev?: number

  alertRev?: number
}

export type ReceivedBadgeReaction = {
  e: BadgeReactionEmoji

  at: number
  rev: number
}

export type BadgeReactionFrom = {
  inboxId: string
  buddy: Buddy
  e: BadgeReactionEmoji
  at: number
}

export function badgeReactionsFrom(
  reactions: Record<string, ReceivedBadgeReaction> | undefined,
  buddies: readonly Buddy[]
): BadgeReactionFrom[] {
  return Object.entries(reactions ?? {})
    .flatMap(([inboxId, reaction]) => {
      const buddy = buddies.find(
        (b) => b.inboxId === inboxId && b.status === 'active'
      )
      return buddy ? [{ inboxId, buddy, e: reaction.e, at: reaction.at }] : []
    })
    .sort((a, b) => b.at - a.at || a.inboxId.localeCompare(b.inboxId))
}

export type IncomingCarInviteStatus = 'pending' | CarReply | 'cancelled'

export type IncomingCarInvite = {
  from: string
  spaceId: string
  inviteId: string
  rev: number

  name: string

  people: number
  expiresAt: number
  receivedAt: number
  status: IncomingCarInviteStatus

  join?: { epoch: number }

  answeredAt?: number

  alertSeqs?: number[]
}

export const incomingCarInviteKey = (from: string, inviteId: string) =>
  `${from}|${inviteId}`

export const sentInviteSecretId = (inviteId: string) => `sent|${inviteId}`

export const receivedInviteSecretId = (key: string) => `received|${key}`

export function neededInviteSecrets(
  state: Pick<BuddiesState, 'carEvents' | 'carInvites'>
): Set<string> {
  const ids = new Set<string>()
  for (const event of Object.values(state.carEvents))
    if (event.kind === 'car.invite') ids.add(sentInviteSecretId(event.inviteId))
  for (const [key, invite] of Object.entries(state.carInvites))
    if (invite.status === 'pending') ids.add(receivedInviteSecretId(key))
  return ids
}

export function withoutStoredInviteSecrets(
  state: Pick<BuddiesState, 'carEvents' | 'carInvites'>
): Pick<BuddiesState, 'carEvents' | 'carInvites'> {
  const carInvites = Object.fromEntries(
    Object.entries(state.carInvites).map(([key, invite]) => [
      key,
      invite.join ? { ...invite, join: { epoch: invite.join.epoch } } : invite,
    ])
  )
  const carEvents = Object.fromEntries(
    Object.entries(state.carEvents).map(([eventId, event]) => {
      const { joinSecret: _joinSecret, key: _key, ...body } = event.body
      return [eventId, { ...event, body }]
    })
  )
  return { carEvents, carInvites }
}

export type CarEventKind = 'car.invite' | 'car.cancel' | 'car.reply'

export type OutgoingCarEvent = {
  eventId: string
  kind: CarEventKind

  to: string
  spaceId: string
  inviteId: string

  body: Record<string, unknown>
  push: boolean

  expiresAt: number
  queuedAt: number

  attempted?: boolean
}

export const CAR_INVITE_ANSWER_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const CAR_REPLY_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const INCOMING_CAR_INVITE_MAX_MS =
  SPACE_LIMITS.inviteLifetimeMs + 5 * 60 * 1000

export const SEEN_CAR_EVENT_TTL_MS = 31 * 24 * 60 * 60 * 1000

export function unexpiredCarEvents(
  carEvents: Record<string, OutgoingCarEvent>,
  now: number
): Record<string, OutgoingCarEvent> {
  const live = Object.entries(carEvents).filter(
    ([, event]) => event.expiresAt > now
  )
  return live.length === Object.keys(carEvents).length
    ? carEvents
    : Object.fromEntries(live)
}

export type BuddyNotificationKind =
  | 'claim'
  | 'paired'
  | 'shareInvite'
  | 'shareUpdate'
  | 'shareCancel'
  | 'shareReply'
  | 'joinRequest'
  | 'badge'
  | 'badgeReaction'
  | 'carInvite'
  | 'carJoined'

export type BuddyNotification = {
  id: string
  kind: BuddyNotificationKind
  at: number
  read: boolean

  from?: string

  name: string

  inviteId?: string

  shareKey?: string

  spaceId?: string
  shareType?: ShareType

  reply?: ShareReply

  badges?: SharedBadge[]

  reaction?: BadgeReactionEmoji

  seq?: number
}

export const MAX_NOTIFICATIONS = 50
export const NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const incomingShareKey = (from: string, shareId: string) =>
  `${from}|${shareId}`

export const shareRefFromKey = (key: string): BuddyShareRef => {
  const [from, shareId] = key.split('|')
  return { from, shareId }
}

export const incomingJoinRequestKey = (from: string, id: string) =>
  `${from}|${id}`

export type BuddiesState = {
  onboardingComplete: boolean

  deviceId: string | null

  registeredInboxId: string | null

  accountLinkedInboxId: string | null
  syncSeq: number
  lastSyncAt: number
  buddies: Buddy[]
  outgoingInvites: OutgoingInvite[]

  unconfirmedInvites: OutgoingInvite[]
  incomingClaims: IncomingClaim[]

  closedInviteIds: Record<string, number>

  removedBuddies: RemovedBuddies

  rosterVersion: number

  pendingRemovals: PendingRemoval[]

  slotsNeedRestore: boolean

  cards: Record<string, ReceivedCard>

  publishedCardHashes: Record<string, string>

  outgoingShares: Record<string, OutgoingShare>

  unsentShares: Record<string, Record<string, UnsentShare>>

  cardName: CardName | null

  startedAt: number | null

  sharedPhotos: Record<string, UploadedSharedPhoto>

  photosAvailable: boolean

  profilePhoto: UploadedProfilePhoto | null

  shareReplies: Record<string, Record<string, ReceivedReply>>

  guestAvatars: Record<string, { source: string; data: string }>

  incomingShares: Record<string, IncomingShare>

  joinRequests: Record<string, IncomingJoinRequest>

  askedToJoin: Record<string, OutgoingJoinRequest>

  notifications: BuddyNotification[]

  answerMarks: Record<string, AnswerMark>

  notificationMarks: NotificationMarks

  pushRegistrationKey: string | null

  pushRegisteredAt: number
  sharing: BuddySharing

  notificationsEnabled: boolean

  joinRequestNotifications: boolean

  badgeNotifications: boolean

  alertOverrides: Record<string, BuddyAlertOverrides>

  badgeAnnouncements: BadgeAnnouncement[]

  lastBadgeAlertAt: Record<string, number>

  seenBadgeEvents: Record<string, number>

  sentBadgeReactions: Record<string, Record<string, SentBadgeReaction>>

  badgeReactions: Record<string, Record<string, ReceivedBadgeReaction>>

  lastBadgeReactionAlertAt: Record<string, number>

  carInvites: Record<string, IncomingCarInvite>

  carEvents: Record<string, OutgoingCarEvent>

  seenCarEvents: Record<string, number>

  devOverride: boolean

  flagLastKnown: boolean | null

  avatarThumbnail: { source: string; data: string } | null
}

export const initialBuddiesState: BuddiesState = {
  onboardingComplete: false,
  deviceId: null,
  registeredInboxId: null,
  accountLinkedInboxId: null,
  syncSeq: 0,
  lastSyncAt: 0,
  buddies: [],
  outgoingInvites: [],
  unconfirmedInvites: [],
  incomingClaims: [],
  closedInviteIds: {},
  removedBuddies: {},
  rosterVersion: 0,
  pendingRemovals: [],
  slotsNeedRestore: false,
  cards: {},
  publishedCardHashes: {},
  outgoingShares: {},
  unsentShares: {},
  cardName: null,
  startedAt: null,
  sharedPhotos: {},
  photosAvailable: false,
  profilePhoto: null,
  shareReplies: {},
  guestAvatars: {},
  incomingShares: {},
  joinRequests: {},
  askedToJoin: {},
  notifications: [],
  answerMarks: {},
  notificationMarks: { read: {}, dismissed: {} },
  pushRegistrationKey: null,
  pushRegisteredAt: 0,
  sharing: {
    photo: true,
    tenure: true,
    streak: true,
    updatedAt: 0,
    badges: true,
    badgesUpdatedAt: 0,
    pet: true,
    petUpdatedAt: 0,
    plans: true,
    planTimes: 'exact',
    pausedUntil: 0,
    plansUpdatedAt: 0,
    showOnCalendar: true,
    calendarUpdatedAt: 0,
    petVisits: true,
    petVisitsUpdatedAt: 0,
  },
  notificationsEnabled: true,
  joinRequestNotifications: true,
  badgeNotifications: true,
  alertOverrides: {},
  badgeAnnouncements: [],
  lastBadgeAlertAt: {},
  seenBadgeEvents: {},
  sentBadgeReactions: {},
  badgeReactions: {},
  lastBadgeReactionAlertAt: {},
  carInvites: {},
  carEvents: {},
  seenCarEvents: {},
  devOverride: false,
  flagLastKnown: null,
  avatarThumbnail: null,
}

export function occupiedBuddySpots(
  state: Pick<BuddiesState, 'buddies' | 'outgoingInvites'>
): number {
  return state.buddies.length + state.outgoingInvites.length
}

type ExpiringState = Pick<
  BuddiesState,
  | 'outgoingInvites'
  | 'incomingClaims'
  | 'closedInviteIds'
  | 'incomingShares'
  | 'shareReplies'
  | 'joinRequests'
  | 'askedToJoin'
  | 'notifications'
  | 'carInvites'
  | 'carEvents'
>

export function withoutExpired(
  state: ExpiringState,
  now: number
): ExpiringState {
  const incomingClaims = state.incomingClaims.filter((c) => c.expiresAt > now)
  const incomingShares = Object.fromEntries(
    Object.entries(state.incomingShares).filter(
      ([, share]) => share.expiresAt > now
    )
  )
  const joinRequests = Object.fromEntries(
    Object.entries(state.joinRequests).filter(
      ([, request]) => request.expiresAt > now
    )
  )
  const recent = (at: number) => at + NOTIFICATION_TTL_MS > now

  const carInvites = Object.fromEntries(
    Object.entries(state.carInvites).filter(([, invite]) =>
      invite.status === 'pending' || invite.status === 'cancelled'
        ? invite.expiresAt > now
        : Math.max(
            invite.expiresAt,
            (invite.answeredAt ?? invite.receivedAt) + CAR_INVITE_ANSWER_TTL_MS
          ) > now
    )
  )
  return {
    outgoingInvites: state.outgoingInvites.filter((i) => i.expiresAt > now),
    incomingClaims,
    closedInviteIds: Object.fromEntries(
      Object.entries(state.closedInviteIds).filter(
        ([, expiresAt]) => expiresAt > now
      )
    ),
    incomingShares,
    joinRequests,
    askedToJoin: Object.fromEntries(
      Object.entries(state.askedToJoin).filter(
        ([, request]) => request.expiresAt > now
      )
    ),
    shareReplies: Object.fromEntries(
      Object.entries(state.shareReplies)
        .map(([shareId, replies]) => [
          shareId,
          Object.fromEntries(
            Object.entries(replies).filter(([, reply]) => recent(reply.at))
          ),
        ])
        .filter(([, replies]) => Object.keys(replies).length > 0)
    ),
    carInvites,
    carEvents: unexpiredCarEvents(state.carEvents, now),
    notifications: state.notifications.filter(
      (n) =>
        (recent(n.at) ||
          awaitsAnswer(
            n,
            { incomingClaims, incomingShares, carInvites },
            now
          )) &&
        (n.kind === 'joinRequest'
          ? !!n.shareKey &&
            n.shareKey in joinRequests &&
            !joinRequests[n.shareKey].dismissed &&
            !joinRequests[n.shareKey].withdrawn
          : n.kind === 'carInvite'
            ? !!n.shareKey &&
              n.shareKey in carInvites &&
              carInvites[n.shareKey].status !== 'cancelled'
            : n.kind === 'shareReply' ||
              !n.shareKey ||
              n.shareKey in incomingShares) &&
        (!n.inviteId || incomingClaims.some((c) => c.inviteId === n.inviteId))
    ),
  }
}

type AnswerState = Pick<BuddiesState, 'incomingClaims' | 'incomingShares'> &
  Partial<Pick<BuddiesState, 'carInvites'>>

export function awaitsAnswer(
  entry: BuddyNotification,
  state: AnswerState,
  now: number
): boolean {
  if (entry.kind === 'claim')
    return state.incomingClaims.some((c) => c.inviteId === entry.inviteId)
  if (entry.kind === 'shareInvite' || entry.kind === 'shareUpdate') {
    const share = state.incomingShares[entry.shareKey ?? '']
    return share?.status === 'pending' && !hasSharedEventEnded(share, now)
  }
  if (entry.kind === 'carInvite') {
    const invite = state.carInvites?.[entry.shareKey ?? '']
    return invite?.status === 'pending' && invite.expiresAt > now
  }
  return false
}

export function cappedQueue(
  notifications: BuddyNotification[],
  state: AnswerState,
  now: number
): BuddyNotification[] {
  if (notifications.length <= MAX_NOTIFICATIONS) return notifications
  const room =
    MAX_NOTIFICATIONS -
    notifications.filter((n) => awaitsAnswer(n, state, now)).length
  let kept = 0
  return notifications.filter(
    (n) => awaitsAnswer(n, state, now) || kept++ < room
  )
}

export const pendingInviteNotificationId = (shareKey: string) =>
  `pending|${shareKey}`

export function withPendingInvitesQueued(
  state: Pick<BuddiesState, 'notifications' | 'incomingShares' | 'buddies'> &
    Partial<Pick<BuddiesState, 'carInvites'>>,
  now: number
): BuddyNotification[] {
  const listed = new Set(
    state.notifications
      .filter(
        (n) =>
          n.kind === 'shareInvite' ||
          n.kind === 'shareUpdate' ||
          n.kind === 'carInvite'
      )
      .map((n) => n.shareKey)
  )
  const missing = Object.entries(state.incomingShares).flatMap(
    ([key, share]): BuddyNotification[] => {
      if (share.status !== 'pending' || share.expiresAt <= now) return []
      if (hasSharedEventEnded(share, now)) return []
      if (listed.has(key)) return []
      const buddy = state.buddies.find((b) => b.inboxId === share.from)
      if (!buddy) return []
      return [
        {
          id: pendingInviteNotificationId(key),
          kind: 'shareInvite',
          at: share.receivedAt,
          read: false,
          from: share.from,
          name: buddy.name,
          shareKey: key,
          shareType: share.type,
        },
      ]
    }
  )
  for (const [key, invite] of Object.entries(state.carInvites ?? {})) {
    if (invite.status !== 'pending' || invite.expiresAt <= now) continue
    if (listed.has(key)) continue
    const buddy = state.buddies.find((b) => b.inboxId === invite.from)
    if (!buddy) continue
    missing.push({
      id: pendingInviteNotificationId(key),
      kind: 'carInvite',
      at: invite.receivedAt,
      read: false,
      from: invite.from,
      name: buddy.name,
      shareKey: key,
    })
  }
  if (missing.length === 0) return state.notifications
  return [...state.notifications, ...missing].sort((a, b) => b.at - a.at)
}

export const isCarNotification = (entry: Pick<BuddyNotification, 'kind'>) =>
  entry.kind === 'carInvite' || entry.kind === 'carJoined'

export function listedNotifications(
  notifications: BuddyNotification[],
  { showBadges }: { showBadges: boolean }
): BuddyNotification[] {
  return showBadges
    ? notifications
    : notifications.filter(
        (n) => n.kind !== 'badge' && n.kind !== 'badgeReaction'
      )
}
