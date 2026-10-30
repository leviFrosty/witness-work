import type { RichTextDoc } from '@/types/richText'
import type {
  BuddyAvatar,
  BuddyCardDay,
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
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'

/** Active buddies plus pending invites never exceed this (relay enforces too). */
export const MAX_BUDDIES = 5
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** The relay keeps at most this many unclaimed invites open per inbox. */
export const MAX_OPEN_INVITES = 5

/** What this User shares about themself, read from Profile and Preferences. */
export type BuddyProfile = {
  name: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
  /** Earned badges for the Buddy Card; empty with Badges turned off. */
  badges?: SharedBadge[]
  /**
   * The Profile photo is set but its file isn't on this device (another device
   * holds it, and iCloud Sync isn't moving photos), so `avatar` leaves it out.
   */
  photoUnavailable?: boolean
}

/**
 * This User's settings for All Buddies: what buddies see, and how they show up
 * here. Every buddy follows them unless they have their own (`BuddyOverrides`).
 * Synced across this User's devices through the roster (last change wins) so
 * two devices never publish different cards.
 */
export type BuddySharing = {
  photo: boolean
  tenure: boolean
  streak: boolean
  /** When photo, Tenure, or the streak last changed. */
  updatedAt: number
  /** Earned badges on the Buddy Card, and news of new ones. */
  badges: boolean
  /**
   * When `badges` last changed, 0 while it's the default. Its own stamp, since
   * older apps rewrite the roster without it.
   */
  badgesUpdatedAt: number
  /** The Pet Companion on the Buddy Card (species, coat, and name). */
  pet: boolean
  /** When `pet` last changed, 0 while it's the default; like `badgesUpdatedAt`. */
  petUpdatedAt: number
  /** Plans on the Buddy Card. */
  plans: boolean
  /** How precisely cards show when Plans start. */
  planTimes: BuddyPlanTimes
  /**
   * Until when Plans, streak, badges, and the pet are withheld from every
   * buddy, their own settings or not: 0 when never paused,
   * `PAUSED_INDEFINITELY` until the User resumes.
   */
  pausedUntil: number
  /**
   * When `plans`, `planTimes`, or `pausedUntil` last changed, 0 while all are
   * the default. Its own stamp, like `badgesUpdatedAt`.
   */
  plansUpdatedAt: number
  /** Buddies' Plans show on this User's calendar. */
  showOnCalendar: boolean
  /** When `showOnCalendar` last changed, 0 while it's the default. */
  calendarUpdatedAt: number
  /** Buddies' pets visit the User's pet on days they go out together. */
  petVisits: boolean
  /** When `petVisits` last changed, 0 while it's the default. */
  petVisitsUpdatedAt: number
}

/** Settings a buddy can have their own value for; the rest are for everyone. */
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

/** A buddy's own settings; a key left out follows All Buddies. */
export type BuddyOverrides = Partial<BuddySettings>

/** Per-device alerts a buddy can have their own value for. */
export type BuddyAlertSettings = {
  /** Their requests to join this User's Plans. */
  joinRequests: boolean
  /** Their new badges and reactions to this User's. */
  badges: boolean
}
export type BuddyAlertKey = keyof BuddyAlertSettings
export type BuddyAlertOverrides = Partial<BuddyAlertSettings>

/** Where a setting's value comes from: the buddy's own, or All Buddies'. */
export type BuddySettingSource = 'buddy' | 'all'

export type ResolvedSettings<T> = {
  settings: T
  sources: Record<keyof T, BuddySettingSource>
}

/**
 * Each value with where it comes from: the buddy's own where they have one,
 * else All Buddies'. The source is told by the override being there, not by
 * comparing values, so an override equal to All Buddies' still reads as one.
 */
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

/** All Buddies' values for the settings a buddy can override. */
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

/** One buddy's settings, their own over All Buddies'. */
export function buddySettings(
  sharing: BuddySharing,
  buddy: Pick<Buddy, 'overrides'>
): ResolvedSettings<BuddySettings> {
  return resolveSettings(allBuddiesSettings(sharing), buddy.overrides)
}

/** One buddy's alerts on this device, their own over All Buddies'. */
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

/** How many settings a buddy has of their own, synced and on this device. */
export function ownSettingsCount(
  buddy: Pick<Buddy, 'inboxId' | 'overrides'>,
  alertOverrides: BuddiesState['alertOverrides']
): number {
  return (
    Object.keys(buddy.overrides ?? {}).length +
    Object.keys(alertOverrides[buddy.inboxId] ?? {}).length
  )
}

/**
 * `overrides` with `key` set to `value`, or dropped for `undefined` (follow All
 * buddies again); undefined once none are left.
 */
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

/**
 * A roster entry's own settings. Newer apps write `overrides`. An older app
 * writes only `showOnCalendar`, as the value it shows: where that differs from
 * the buddy's current one it's a choice made there, kept as an override; the
 * rest of `previous` stays.
 */
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

/** `pausedUntil` for a pause that lasts until the User resumes sharing. */
export const PAUSED_INDEFINITELY = Number.MAX_SAFE_INTEGER

/** Sharing is paused for every buddy at `now`. */
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

/**
 * The Buddy Card name to keep: the roster's when it changed later than this
 * device's (or as late: devices then settle on whichever roster was written
 * last), else this device's own.
 */
export function mergeCardName(local: CardName, remote: CardName | undefined) {
  return remote && remote.updatedAt >= local.updatedAt ? remote : local
}

/**
 * One sharing choice with its own stamp: a roster without it (an older app's)
 * keeps this device's, the later stamp wins, and on a tie withholding wins.
 */
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

/**
 * Folds another device's sharing choices into this one's. Photo, Tenure, and
 * the streak go to the later `updatedAt`. Badges and the pet each go to their
 * own later stamp, apart: a roster from an older app leaves them out (keep this
 * device's), and on a tie withholding wins, so every device settles on the same
 * answer. Plan times and the pause go to the later `plansUpdatedAt` the same
 * way, the more private choice winning a tie.
 */
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

/**
 * Persisted state from before buddies followed All Buddies: a buddy hidden from
 * the calendar keeps that as their own setting, and a buddy whose requests to
 * join were muted keeps that as their own alert setting.
 */
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

/** Calendar like the plan choices: a later stamp wins, hiding wins a tie. */
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

/**
 * `awaitingConfirm`: this device accepted someone's invite and is waiting for
 * the inviter's one-tap confirmation. Nothing is shared until then.
 */
export type BuddyStatus = 'active' | 'awaitingConfirm'

export type Buddy = {
  inboxId: string
  /** The buddy's own display name, refreshed from every Buddy Card. */
  name: string
  /** A private name only this User sees, shown in place of `name`. */
  nickname?: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
  /** From their latest Buddy Card; never in the roster. */
  streak?: BuddyStreak
  dhPub: string
  /** The invite secret that paired us (base64url) — salts the pair secret. */
  inviteSecret: string
  status: BuddyStatus
  pairedAt: number
  /** The palette slot assigned when we paired; the color unless `color` is set. */
  colorIndex: number
  /** A hex this User picked (Supporter), shown in place of the slot's color. */
  color?: string
  /**
   * Their own settings over All Buddies' (`buddySettings`); absent while they
   * follow All Buddies in everything.
   */
  overrides?: BuddyOverrides
  /**
   * When the nickname, color, or `overrides` last changed, on any of this
   * User's devices; the later change wins (`mergeRoster`). Absent until one
   * does.
   */
  prefsAt?: number
  /** Only for `awaitingConfirm`: when the unconfirmed request lapses. */
  expiresAt?: number
  /**
   * Only for `awaitingConfirm`: this pairing reconnects with a buddy who
   * changed their account key. Analytics only; never in the roster.
   */
  reconnect?: true
  /**
   * The badges they share, from their latest Buddy Card (plus news of a new one
   * until the next card). Earned badges only; never progress or counts.
   */
  badges?: SharedBadge[]
  /**
   * Their Pet Companion, from their latest Buddy Card; never in the roster.
   * Absent when they have none or don't share it.
   */
  pet?: BuddyPet
}

export type OutgoingInvite = {
  inviteId: string
  secret: string
  createdAt: number
  expiresAt: number
}

/**
 * An invite to a former buddy after this User's account key changed (by
 * inviteId in `reconnectInvites`): their claim is confirmed without asking, and
 * they keep the nickname, color, and settings they had.
 */
export type ReconnectInvite = {
  inboxId: string
  dhPub: string
  expiresAt: number
  /** How this User knew them; not in the roster. */
  name?: string
  nickname?: string
  color?: string
  colorIndex?: number
  overrides?: BuddyOverrides
}

/** One invite to a new inbox that came through a buddy's old pairing. */
export type ReconnectInvitation = {
  /** The new inbox the invite leads to. */
  inboxId: string
  /** The invite link's secret (base64url). */
  secret: string
  expiresAt: number
  /** The event that brought it. */
  eventId: string
}

/** How long a lapsed reconnect invite's pairing is checked for a successor. */
const LAPSED_RECONNECT_CHECK_MS = 30 * 24 * 60 * 60 * 1000

/** Invites kept per pairing; Reconnect takes the one the relay vouches for. */
export const MAX_RECONNECT_INVITES = 3

/**
 * A buddy changed their account key and invited this User to their new inbox
 * (by their old inboxId in `reconnectOffers`). Kept after their old pairing
 * ends, until it's accepted, passed over, or lapses.
 */
export type ReconnectOffer = {
  /**
   * The invites that came through the pairing, one per inbox, oldest first, up
   * to `MAX_RECONNECT_INVITES` (when more arrive, the one to the inbox the
   * relay names as the old one's successor, else the newest): anyone with their
   * old key could send one, so Reconnect takes the one the relay names.
   */
  invites: ReconnectInvitation[]
  /** When the last of them lapses. */
  expiresAt: number
  /** The buddy as this User knew them, carried over to the new pairing. */
  name: string
  avatar?: BuddyAvatar
  nickname?: string
  color?: string
  colorIndex: number
  overrides?: BuddyOverrides
}

/** Someone claimed one of my invites; they become a buddy once I confirm. */
export type IncomingClaim = {
  inviteId: string
  secret: string
  name: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
  dhPub: string
  inboxId: string
  /** The claimer's platform, when their build sends it (analytics only). */
  platform?: BuddyPlatform
  receivedAt: number
  expiresAt: number
}

/** A buddy removed locally whose relay slots may still need withdrawing. */
export type PendingRemoval = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

/**
 * Ended pairings: buddy inboxId → `removedAt`. A pairing with that buddy made
 * at or before `removedAt` is over, so no roster can bring it back; pairing
 * again on purpose makes a newer one.
 */
export type RemovedBuddies = Record<string, number>

/**
 * Tombstones kept, newest first. Only the User's own pairings add them, so the
 * oldest is dropped only after this many later removals.
 */
export const MAX_REMOVED_BUDDIES = 200

export function pairingEnded(
  removedBuddies: RemovedBuddies,
  buddy: Pick<Buddy, 'inboxId' | 'pairedAt'>
): boolean {
  const removedAt = removedBuddies[buddy.inboxId]
  return removedAt !== undefined && buddy.pairedAt <= removedAt
}

/** Both sets of tombstones, the later `removedAt` per buddy, capped. */
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

/**
 * A Plan or Follow-up this User wants buddies invited to, derived from their
 * own data on every publish.
 */
export type OutgoingShareSpec = {
  /** `plan:<dayPlanId>` or `followUp:<visitId>`. */
  key: string
  type: ShareType
  details: ShareDetails
  /**
   * Plans only: the note with its formatting, photos as this device's note
   * photo ids. Sending uploads the photos and puts the doc in `details`.
   */
  noteDoc?: RichTextDoc
  /** Buddy inbox ids. */
  recipients: string[]
  /**
   * When the Plan ends or the Follow-up happens. After it, the share is
   * history: buddies who have it get changes quietly, and nobody new gets it.
   */
  endsAt: number
  /** When both phones wipe it. */
  expiresAt: number
  /**
   * When the Plan or Follow-up behind it last changed (its sync `updatedAt`),
   * the same on every device of this User. Sends that alert use it as their
   * `rev`, so two devices sending the same change send one event.
   */
  version?: number
}

/**
 * One of this User's note photos as uploaded for buddies: an encrypted blob
 * under this User's inbox (`blob`), and what reads it. One upload serves every
 * share of the photo until `expiresAt`.
 */
export type UploadedSharedPhoto = {
  blob: string
  key: string
  token: string
  /** When the relay deletes it. */
  expiresAt: number
  w: number
  h: number
}

/** The Profile photo at full size, as this device uploaded it for buddies. */
export type UploadedProfilePhoto = {
  /** Hash of the Buddy Card thumbnail it goes with, so a new photo replaces it. */
  thumbnail: string
  blob: string
  key: string
  token: string
  /** When the relay deletes it. */
  expiresAt: number
}

/** What this device has sent for one share. */
export type OutgoingShare = {
  shareId: string
  type: ShareType
  /** As `OutgoingShareSpec.endsAt`; missing from shares sent before it was. */
  endsAt?: number
  expiresAt: number
  /** Recipient inboxId → content hash last delivered to them. */
  sent: Record<string, string>
  /**
   * Recipient inboxId → hash of the day, time, length, and place they last got;
   * a change that leaves these alone is sent without a push.
   */
  sentTiming?: Record<string, string>
  /** The newest rev any send of this share has used. */
  lastRev?: number
  /**
   * Sends a publish left undone (`recipient|kind` → rev), for the content hash
   * they were for (`deleted` once the share is gone). While the content is the
   * same, a retry reuses its rev and so its event id: one that landed though
   * its answer was lost is kept, and alerts, once.
   */
  pending?: { hash: string; revs: Record<string, number> }
  /**
   * Taken as sent on this device's first sync, without sending: another of this
   * User's devices sent it (`adoptShares`). The spec's hash then; a change
   * since is sent as usual.
   */
  adopted?: string
}

/** `OutgoingShare.sent` for a recipient another device sent the share to. */
export const ADOPTED_SHARE_HASH = 'adopted'

/**
 * Why an invitation never reached a buddy: the relay refused it while this
 * User's account was suspended, or the pairing had ended.
 */
export type UnsentShareReason = 'suspended' | 'gone'

/** An invitation this device didn't send, and won't retry as it stands. */
export type UnsentShare = {
  reason: UnsentShareReason
  /** The buddy's name as this User saw it, for when they're no longer listed. */
  name: string
  /**
   * The content refused (while suspended, or by a buddy's inbox that's gone).
   * The same content is never sent later; a change to the Plan or Follow-up is
   * sent as usual.
   */
  hash?: string
  /** When it was recorded. */
  at: number
}

/** The name buddies see on this User's Buddy Card, the same on every device. */
export type CardName = {
  name: string
  /** When the User last changed it on a device running Buddies; 0 if never. */
  updatedAt: number
}

export type IncomingShareStatus = 'pending' | ShareReply | 'cancelled'

/** A buddy's invitation to their Plan or Follow-up. */
export type IncomingShare = {
  /** The sender's inbox id. */
  from: string
  shareId: string
  type: ShareType
  rev: number
  details: ShareDetails
  expiresAt: number
  receivedAt: number
  status: IncomingShareStatus
  /**
   * Set while this User's answer (with this rev) hasn't reached the buddy yet;
   * delivery is retried on every sync.
   */
  unsentReplyRev?: number
  /**
   * When a held answer goes out; until then the User can still change it
   * (`replyHoldMs`).
   */
  replySendAt?: number
  /**
   * The inbox seqs of the invites and changes received for it, newest last, so
   * their system alerts can be taken back when the invitation is withdrawn.
   */
  alertSeqs?: number[]
  /**
   * The `rev` of the buddy's latest cancel, kept if they invite again. An
   * answer given before it was for the canceled invitation (`answerApplies`).
   */
  cancelledRev?: number
  /** Plans this User is going to: the others going, as the organizer lists them. */
  people?: ShareGuest[]
  /** How many more are going whose apps don't list them. */
  more?: number
}

/**
 * This User's answer to a buddy's invitation, shared by all their devices
 * through the roster. `s` is the answer, or `none` once the buddy canceled the
 * invitation it answered. `v` is the invitation's `rev` when answered (for
 * `none`, the cancel's), `r` this User's clock when they answered (0 for
 * `none`), and `x` when the invitation lapses.
 */
export type AnswerMark = {
  s: ShareReply | 'none'
  v: number
  r: number
  x: number
}

/**
 * Whether `mark` is newer than `other`: the later invitation `rev` wins, a
 * cancel wins a tie, and between answers to the same `rev` the later one wins.
 */
export function newerAnswer(
  mark: AnswerMark,
  other: AnswerMark | undefined
): boolean {
  if (!other) return true
  if (mark.v !== other.v) return mark.v > other.v
  if ((mark.s === 'none') !== (other.s === 'none')) return mark.s === 'none'
  return mark.r > other.r
}

/**
 * Whether another device's answer belongs on this invitation: an answer (not a
 * cancel's mark) to the invitation as it stands, given after any cancel this
 * device saw.
 */
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

/** Answers the roster carries, newest first (about 120 bytes each). */
export const MAX_ANSWER_MARKS = 50
/**
 * Read and dismissed queue entries the roster carries, newest first (40 to 70
 * bytes each). The queue holds `MAX_NOTIFICATIONS`.
 */
export const MAX_NOTIFICATION_MARKS = 100

/** Both sets of answers, the newer per invitation, minus lapsed ones, capped. */
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

/**
 * Read or dismissed queue entries on any device (entry id → when the mark
 * lapses, a month after it was made, by when the relay has dropped the event
 * behind it). Dismissed implies read, so an id is in one map at most.
 */
export type NotificationMarks = {
  read: Record<string, number>
  dismissed: Record<string, number>
}

/** Both devices' marks, the later lapse per entry, minus lapsed ones, capped. */
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
      // Dismissals outrank reads when the cap bites: they remove entries.
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

/** How long a read or dismissed mark is kept: as long as the relay keeps events. */
export const NOTIFICATION_MARK_TTL_MS = 31 * 24 * 60 * 60 * 1000

/** How long a Can't Make It answer waits before it's sent. */
export const REPLY_HOLD_MS = 15 * 1000

/**
 * Going is sent at once. Can't Make It waits `REPLY_HOLD_MS` first, so a
 * mistaken tap can be changed before the buddy hears about it.
 */
export const replyHoldMs = (reply: ShareReply) =>
  reply === 'declined' ? REPLY_HOLD_MS : 0

export type ReceivedReply = {
  status: ShareReply
  rev: number
  at: number
  /** Going, and their app lists them for the others going (`listed`). */
  listed?: true
  /** Their photo or emoji shows on that list too. */
  photo?: true
}

/** A buddy asking to be invited to one of this User's Plans. */
export type IncomingJoinRequest = {
  /** The asking buddy's inbox id. */
  from: string
  id: string
  rev: number
  /** The Plan as the buddy saw it on this User's Buddy Card. */
  d: string
  s?: number
  m?: number
  expiresAt: number
  receivedAt: number
  /**
   * Not Now: kept until it lapses so the same request stays quiet. Never sent
   * anywhere; the buddy can't tell it apart from a request not yet answered.
   */
  dismissed?: boolean
  /** The buddy took it back; kept so asking again is listed quietly. */
  withdrawn?: boolean
}

/** This User asking a buddy to be invited to their Plan. */
export type OutgoingJoinRequest = {
  /** The Plan owner's inbox id. */
  to: string
  id: string
  d: string
  s?: number
  m?: number
  expiresAt: number
  askedAt: number
  /** This User's clock when they last asked or withdrew; newer wins. */
  rev: number
  /** The `rev` the relay last accepted; anything else is still to send. */
  sentRev?: number
  /**
   * A request was handed to the relay, so the buddy may hold it even if the
   * send seemed to fail: withdrawing has to tell them.
   */
  attempted: boolean
  /**
   * The event that carries this request's one alert, and the ask it belongs to.
   * A failed send is retried under the same event id, which the relay never
   * alerts for twice.
   */
  alertEventId?: string
  alertRev?: number
  /** The relay accepted the alert: asking again arrives quietly. */
  pushed: boolean
  /** Withdrawn; kept until it lapses so asking again stays quiet. */
  withdrawn?: boolean
}

/** Asking to join closes this long before the Plan starts. */
export const JOIN_REQUEST_LEAD_MS = 2 * 60 * 60 * 1000

/** Open requests to one buddy at a time. */
export const MAX_OPEN_JOIN_REQUESTS = 3

/** Requests to one buddy that alert them per rolling day; the rest are quiet. */
export const JOIN_REQUEST_ALERTS_PER_DAY = 3

/**
 * News of badges this User just earned, kept until every buddy it was meant for
 * has it, or it's `BADGE_ANNOUNCEMENT_TTL_MS` old. Only buddies active when it
 * was made get it; one paired later sees the badges on the Buddy Card.
 */
export type BadgeAnnouncement = {
  /** The badge keys it carries, sorted and joined. */
  id: string
  badges: SharedBadge[]
  createdAt: number
  /** Buddy inbox ids. */
  recipients: string[]
  /** Recipients the relay accepted it for. */
  sent: Record<string, true>
  /**
   * Recipients whose copy carries this device's alert for the day; a retry
   * keeps the alert, and the relay never alerts twice for one event.
   */
  alerted: Record<string, true>
}

/** News of a badge is retried for this long, then dropped. */
export const BADGE_ANNOUNCEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * At most one badge alert per buddy in this long; the rest arrive quietly.
 * Reactions have their own allowance of the same size.
 */
export const BADGE_ALERT_INTERVAL_MS = 20 * 60 * 60 * 1000

/**
 * This User's reaction to one of a buddy's badges. Per device: another of this
 * User's devices doesn't show it as sent.
 */
export type SentBadgeReaction = {
  e: BadgeReactionEmoji
  /** This User's clock when they chose it, always increasing; newer wins. */
  rev: number
  /** When they chose it. */
  at: number
  /** The `rev` the relay last accepted; anything else is still to send. */
  sentRev?: number
  /**
   * The `rev` whose event carries this device's reaction alert for the day. A
   * failed send is retried under the same event id, which the relay never
   * alerts for twice.
   */
  alertRev?: number
}

/** A buddy's reaction to one of this User's badges. */
export type ReceivedBadgeReaction = {
  e: BadgeReactionEmoji
  /** When the buddy sent it. */
  at: number
  rev: number
}

/** A reaction to one of this User's badges, with the buddy who sent it. */
export type BadgeReactionFrom = {
  inboxId: string
  buddy: Buddy
  e: BadgeReactionEmoji
  at: number
}

/** Reactions to one badge from active buddies, newest first. */
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
  | 'reconnect'

/** One entry in the Home notification queue. Holds references, not content. */
export type BuddyNotification = {
  id: string
  kind: BuddyNotificationKind
  at: number
  read: boolean
  /** The buddy's inbox id (absent for claims, which aren't buddies yet). */
  from?: string
  /** Name at the time, for claims and for buddies removed since. */
  name: string
  /** `claim`: the invite that was claimed. */
  inviteId?: string
  /**
   * `share*`: the incoming share key (`from|shareId`) or outgoing shareId.
   * `joinRequest`: the incoming join request key (`from|id`).
   */
  shareKey?: string
  shareType?: ShareType
  /** `shareReply`. */
  reply?: ShareReply
  /**
   * `badge`: the buddy's new badges, the one to name first. `badgeReaction`:
   * the one of this User's badges they reacted to.
   */
  badges?: SharedBadge[]
  /** `badgeReaction`: the reaction they sent. */
  reaction?: BadgeReactionEmoji
  /**
   * `reconnect`: the buddy's old inboxId, the `reconnectOffers` key. Not
   * `from`, so the entry outlives their old pairing.
   */
  reconnect?: string
  /** The relay event's inbox sequence; absent for restored entries. */
  seq?: number
}

export const MAX_NOTIFICATIONS = 50
export const NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const incomingShareKey = (from: string, shareId: string) =>
  `${from}|${shareId}`

/** The share an `incomingShareKey` names. */
export const shareRefFromKey = (key: string): BuddyShareRef => {
  const [from, shareId] = key.split('|')
  return { from, shareId }
}

export const incomingJoinRequestKey = (from: string, id: string) =>
  `${from}|${id}`

export type BuddiesState = {
  /** The first-visit Buddies onboarding was finished or skipped here. */
  onboardingComplete: boolean
  /** Per-device id for push registration; never synced. */
  deviceId: string | null
  /** The inbox this device has registered with the relay. */
  registeredInboxId: string | null
  /**
   * The inbox the relay says belongs to this User's server account (ADR 0024).
   * Until it's `registeredInboxId`, syncs try to link it.
   */
  accountLinkedInboxId: string | null
  syncSeq: number
  lastSyncAt: number
  buddies: Buddy[]
  outgoingInvites: OutgoingInvite[]
  /**
   * Invites whose `invite/create` got no answer (offline, a timeout), so the
   * relay may hold them, counting toward its cap on open invites. The next sync
   * or invite looks each up: one the relay has becomes an outgoing invite, one
   * it doesn't is forgotten. Per device; never in the roster.
   */
  unconfirmedInvites: OutgoingInvite[]
  incomingClaims: IncomingClaim[]
  /**
   * Invites to former buddies after an account key change, by inviteId. In the
   * roster, so each of this User's devices confirms their claims.
   */
  reconnectInvites: Record<string, ReconnectInvite>
  /** Buddies' invites to their new inbox, by their old inboxId. Per device. */
  reconnectOffers: Record<string, ReconnectOffer>
  /**
   * Buddies whose reconnect invites lapsed unanswered (old inboxId → when): the
   * next sync asks the relay whether their old inbox has a successor, and if it
   * does, ends the old pairing, which only their old key still writes to.
   */
  lapsedReconnects: Record<string, number>
  /**
   * Inboxes whose owner key the relay refused for good after an account key
   * change (401 `key_changed`): this device never registers or signs for one
   * again. Kept through a reset of Buddies' data.
   */
  refusedInboxIds: string[]
  /**
   * Invites cancelled, rejected, or confirmed (inviteId → expiresAt), so a
   * stale roster from another device can't bring them back. Pruned on expiry.
   */
  closedInviteIds: Record<string, number>
  /**
   * Buddies removed, or who left, so a stale or replayed roster can't bring
   * them back. Synced through the roster; capped, never expired.
   */
  removedBuddies: RemovedBuddies
  /**
   * The newest roster `version` this device has read or written. An older
   * roster is a replay or a stale write and is ignored.
   */
  rosterVersion: number
  /** Removals to finish on the relay; retried on every sync. */
  pendingRemovals: PendingRemoval[]
  /** The relay wiped this inbox; buddies' slots must be re-added. */
  slotsNeedRestore: boolean
  /** Latest Buddy Card per buddy inboxId. */
  cards: Record<string, ReceivedCard>
  /** Content hash of the last card published to each buddy. */
  publishedCardHashes: Record<string, string>
  /** Shares this device has sent, by spec key. */
  outgoingShares: Record<string, OutgoingShare>
  /**
   * Invitations that didn't reach a buddy, by spec key → recipient inboxId, so
   * the Plan or Follow-up can say so. Dropped once sent, uninvited, or over; a
   * `gone` one stays when its buddy is taken off for having gone, until they're
   * a buddy again.
   */
  unsentShares: Record<string, Record<string, UnsentShare>>
  /**
   * The account's card name from the roster (or a change made here), which
   * every device's Buddy Card carries; null until one is known, when the
   * Profile name stands in.
   */
  cardName: CardName | null
  /**
   * When Buddies started on this device (its inbox registered here); null on
   * devices that started before this was kept, the earliest of all. Until the
   * User changes their name, the device that has run Buddies longest names the
   * card.
   */
  startedAt: number | null
  /** This User's note photos uploaded for shares, by note photo id. */
  sharedPhotos: Record<string, UploadedSharedPhoto>
  /** The relay takes shared photos (its last sync said so). */
  photosAvailable: boolean
  /** This User's Profile photo uploaded at full size for Buddy Cards. */
  profilePhoto: UploadedProfilePhoto | null
  /** Buddies' replies to this User's shares: shareId → inboxId → reply. */
  shareReplies: Record<string, Record<string, ReceivedReply>>
  /**
   * Buddies' photos made small for the guest lists this User's Plans send, by
   * inbox id, with the card thumbnail each came from (a hash), so one stays the
   * same until its photo changes.
   */
  guestAvatars: Record<string, { source: string; data: string }>
  /** Invitations from buddies, by `incomingShareKey`. */
  incomingShares: Record<string, IncomingShare>
  /** Buddies asking to join this User's Plans, by `incomingJoinRequestKey`. */
  joinRequests: Record<string, IncomingJoinRequest>
  /**
   * This User's requests to join buddies' Plans, by id. Per device: another
   * device of this User doesn't show them as asked.
   */
  askedToJoin: Record<string, OutgoingJoinRequest>
  /** Newest first. */
  notifications: BuddyNotification[]
  /**
   * This User's answers to invitations, from every device: the roster carries
   * them, so each device shows the same answer (by `incomingShareKey`).
   */
  answerMarks: Record<string, AnswerMark>
  /** Queue entries read or dismissed on any of this User's devices. */
  notificationMarks: NotificationMarks
  /** Hash of the last successful push registration. */
  pushRegistrationKey: string | null
  /** When the relay last accepted this device's push registration. */
  pushRegisteredAt: number
  sharing: BuddySharing
  /** Per-device: Buddies pushes on this device (iOS permission aside). */
  notificationsEnabled: boolean
  /** Per-device: pushes for buddies asking to join this User's Plans. */
  joinRequestNotifications: boolean
  /** Per-device: pushes for buddies' new badges. */
  badgeNotifications: boolean
  /**
   * Per-device: buddies' own alert settings over the two above, by inboxId
   * (`buddyAlertSettings`).
   */
  alertOverrides: Record<string, BuddyAlertOverrides>
  /** News of this User's new badges still to deliver. */
  badgeAnnouncements: BadgeAnnouncement[]
  /** When each buddy was last alerted to this User's new badges, by inboxId. */
  lastBadgeAlertAt: Record<string, number>
  /**
   * Buddies' badge news already handled (eventId → when), so a sync that reads
   * the inbox from the start again doesn't list it twice. Kept as long as the
   * relay keeps events.
   */
  seenBadgeEvents: Record<string, number>
  /**
   * This User's reactions to buddies' badges: buddy inboxId → badge key →
   * reaction. Kept after sending, so the reaction bar shows which one was
   * sent.
   */
  sentBadgeReactions: Record<string, Record<string, SentBadgeReaction>>
  /**
   * Buddies' reactions to this User's badges: badge key → buddy inboxId →
   * reaction. The newest per buddy and badge.
   */
  badgeReactions: Record<string, Record<string, ReceivedBadgeReaction>>
  /** When each buddy was last alerted to this User's reactions, by inboxId. */
  lastBadgeReactionAlertAt: Record<string, number>
  /** Dev builds only: show Buddies without the remote feature flag. */
  devOverride: boolean
  /**
   * The `buddies` flag's value at its last successful load, or null before one.
   * Keeps Buddies showing while flags reload or can't load (offline); never
   * opens Buddies by itself.
   */
  flagLastKnown: boolean | null
  /** The Profile photo shrunk for Buddy Cards, keyed by its source URI. */
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
  reconnectInvites: {},
  reconnectOffers: {},
  lapsedReconnects: {},
  refusedInboxIds: [],
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
  | 'reconnectInvites'
  | 'reconnectOffers'
  | 'lapsedReconnects'
  | 'closedInviteIds'
  | 'incomingShares'
  | 'shareReplies'
  | 'joinRequests'
  | 'askedToJoin'
  | 'notifications'
>

/**
 * Drops everything that has lapsed. Local only, so it also runs offline and
 * before restored state is shown: a Follow-up's householder details must not
 * outlive the share.
 */
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
  const unlapsed = <T extends { expiresAt: number }>(
    entries: Record<string, T>
  ) =>
    Object.fromEntries(
      Object.entries(entries).filter(([, entry]) => entry.expiresAt > now)
    )
  const reconnectOffers: Record<string, ReconnectOffer> = {}
  const lapsedReconnects = { ...state.lapsedReconnects }
  for (const [from, offer] of Object.entries(state.reconnectOffers)) {
    const invites = offer.invites.filter((invite) => invite.expiresAt > now)
    if (invites.length > 0)
      reconnectOffers[from] = {
        ...offer,
        invites,
        expiresAt: Math.max(...invites.map((invite) => invite.expiresAt)),
      }
    else lapsedReconnects[from] ??= now
  }
  return {
    outgoingInvites: state.outgoingInvites.filter((i) => i.expiresAt > now),
    incomingClaims,
    reconnectInvites: unlapsed(state.reconnectInvites),
    reconnectOffers,
    // Given up on after a month without an answer from the relay.
    lapsedReconnects: Object.fromEntries(
      Object.entries(lapsedReconnects).filter(
        ([, at]) => at + LAPSED_RECONNECT_CHECK_MS > now
      )
    ),
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
    notifications: state.notifications.filter(
      (n) =>
        (recent(n.at) ||
          awaitsAnswer(n, { incomingClaims, incomingShares }, now)) &&
        (n.kind === 'joinRequest'
          ? !!n.shareKey &&
            n.shareKey in joinRequests &&
            !joinRequests[n.shareKey].dismissed &&
            !joinRequests[n.shareKey].withdrawn
          : n.kind === 'shareReply' ||
            !n.shareKey ||
            n.shareKey in incomingShares) &&
        (!n.inviteId ||
          incomingClaims.some((c) => c.inviteId === n.inviteId)) &&
        (n.kind !== 'reconnect' ||
          (!!n.reconnect && n.reconnect in reconnectOffers))
    ),
  }
}

type AnswerState = Pick<BuddiesState, 'incomingClaims' | 'incomingShares'>

/**
 * A request still waiting on this User: an open claim or an invitation not yet
 * answered whose Plan or Follow-up hasn't happened. Answering is what clears
 * it, so it can't be dismissed, evicted, or aged out of the queue.
 */
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
  return false
}

/**
 * Holds the queue to `MAX_NOTIFICATIONS`, dropping the oldest entries first but
 * never one that still awaits an answer, or a buddy's reconnect still on
 * offer.
 */
export function cappedQueue(
  notifications: BuddyNotification[],
  state: AnswerState & Partial<Pick<BuddiesState, 'reconnectOffers'>>,
  now: number
): BuddyNotification[] {
  if (notifications.length <= MAX_NOTIFICATIONS) return notifications
  const kept = (n: BuddyNotification) =>
    awaitsAnswer(n, state, now) ||
    (n.kind === 'reconnect' &&
      n.reconnect !== undefined &&
      n.reconnect in (state.reconnectOffers ?? {}))
  const room = MAX_NOTIFICATIONS - notifications.filter(kept).length
  let others = 0
  return notifications.filter((n) => kept(n) || others++ < room)
}

/**
 * Buddies' reconnects still on offer (old inbox → offer), with the pairing they
 * replace while it lasts: the old key may have left it already.
 */
export function pendingReconnects(
  state: Pick<BuddiesState, 'reconnectOffers' | 'buddies'>,
  now: number
): { from: string; offer: ReconnectOffer; buddy?: Buddy }[] {
  return Object.entries(state.reconnectOffers)
    .filter(([, offer]) => offer.expiresAt > now)
    .map(([from, offer]) => {
      const buddy = state.buddies.find((b) => b.inboxId === from)
      return buddy ? { from, offer, buddy } : { from, offer }
    })
}

/** Queue id for an invitation listed again after its entry was lost. */
export const pendingInviteNotificationId = (shareKey: string) =>
  `pending|${shareKey}`

/**
 * The queue with every unanswered invitation and every reconnect on offer
 * listed. The tray is where they're answered, so one whose entry was lost
 * (dismissed before dismissal was blocked, or evicted, say) is listed again.
 */
export function withPendingInvitesQueued(
  state: Pick<BuddiesState, 'notifications' | 'incomingShares' | 'buddies'> &
    Partial<Pick<BuddiesState, 'reconnectOffers'>>,
  now: number
): BuddyNotification[] {
  const listed = new Set(
    state.notifications
      .filter((n) => n.kind === 'shareInvite' || n.kind === 'shareUpdate')
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
  const reconnecting = new Set(state.notifications.map((n) => n.reconnect))
  const reconnects = pendingReconnects(
    { buddies: state.buddies, reconnectOffers: state.reconnectOffers ?? {} },
    now
  ).flatMap(({ from, offer }): BuddyNotification[] =>
    reconnecting.has(from) || offer.invites.length === 0
      ? []
      : [
          {
            // The id its first invite was listed under.
            id: offer.invites[0].eventId,
            kind: 'reconnect',
            at: now,
            read: false,
            name: offer.name,
            reconnect: from,
          },
        ]
  )
  if (missing.length + reconnects.length === 0) return state.notifications
  return [...state.notifications, ...missing, ...reconnects].sort(
    (a, b) => b.at - a.at
  )
}

/**
 * The queue as the tray lists it: buddies' badge news and reactions only while
 * badges are on here. Turning badges off hides them; turning them back on shows
 * them again.
 */
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

/** How many refused inboxes are kept; one per key change is plenty. */
export const MAX_REFUSED_INBOXES = 4
