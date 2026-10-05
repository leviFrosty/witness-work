import type {
  BuddyAvatar,
  BuddyCardDay,
  BuddyTenure,
  ShareDetails,
  ShareReply,
  ShareType,
} from '@/features/buddies/lib/schemas'

/** Active buddies plus pending invites never exceed this (relay enforces too). */
export const MAX_BUDDIES = 5
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** What this User shares about themself, read from Profile and Preferences. */
export type BuddyProfile = {
  name: string
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
}

/**
 * What this User withholds from buddies. Synced across their devices through
 * the roster (last change wins) so two devices never publish different cards.
 */
export type BuddySharing = {
  photo: boolean
  tenure: boolean
  updatedAt: number
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
  avatar?: BuddyAvatar
  tenure?: BuddyTenure
  dhPub: string
  /** The invite secret that paired us (base64url) — salts the pair secret. */
  inviteSecret: string
  status: BuddyStatus
  pairedAt: number
  colorIndex: number
  showOnCalendar: boolean
  /** Only for `awaitingConfirm`: when the unconfirmed request lapses. */
  expiresAt?: number
}

export type OutgoingInvite = {
  inviteId: string
  secret: string
  createdAt: number
  expiresAt: number
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
  receivedAt: number
  expiresAt: number
}

/** A buddy removed locally whose relay slots may still need withdrawing. */
export type PendingRemoval = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

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
  /** Buddy inbox ids. */
  recipients: string[]
  expiresAt: number
}

/** What this device has sent for one share. */
export type OutgoingShare = {
  shareId: string
  type: ShareType
  expiresAt: number
  /** Recipient inboxId → content hash last delivered to them. */
  sent: Record<string, string>
  /**
   * Recipient inboxId → hash of the day, time, length, and place they last got;
   * a change that leaves these alone is sent without a push.
   */
  sentTiming?: Record<string, string>
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
}

export type ReceivedReply = { status: ShareReply; rev: number; at: number }

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

export type BuddyNotificationKind =
  | 'claim'
  | 'paired'
  | 'shareInvite'
  | 'shareUpdate'
  | 'shareCancel'
  | 'shareReply'
  | 'joinRequest'

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
  /** The relay event's inbox sequence; absent for restored entries. */
  seq?: number
}

export const MAX_NOTIFICATIONS = 50
export const NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const incomingShareKey = (from: string, shareId: string) =>
  `${from}|${shareId}`

export const incomingJoinRequestKey = (from: string, id: string) =>
  `${from}|${id}`

export type BuddiesState = {
  /** The first-visit Buddies onboarding was finished or skipped here. */
  onboardingComplete: boolean
  /** Per-device id for push registration; never synced. */
  deviceId: string | null
  /** The inbox this device has registered with the relay. */
  registeredInboxId: string | null
  syncSeq: number
  lastSyncAt: number
  buddies: Buddy[]
  outgoingInvites: OutgoingInvite[]
  incomingClaims: IncomingClaim[]
  /**
   * Invites cancelled, rejected, or confirmed (inviteId → expiresAt), so a
   * stale roster from another device can't bring them back. Pruned on expiry.
   */
  closedInviteIds: Record<string, number>
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
  /** Buddies' replies to this User's shares: shareId → inboxId → reply. */
  shareReplies: Record<string, Record<string, ReceivedReply>>
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
  /** Hash of the last successful push registration. */
  pushRegistrationKey: string | null
  /** When the relay last accepted this device's push registration. */
  pushRegisteredAt: number
  sharing: BuddySharing
  /** Per-device: Buddies pushes on this device (iOS permission aside). */
  notificationsEnabled: boolean
  /** Per-device: pushes for buddies asking to join this User's Plans. */
  joinRequestNotifications: boolean
  /** Per-device: buddies whose requests to join don't push here. */
  mutedJoinRequests: string[]
  /** Dev builds only: show Buddies without the remote feature flag. */
  devOverride: boolean
  /** The Profile photo shrunk for Buddy Cards, keyed by its source URI. */
  avatarThumbnail: { source: string; data: string } | null
}

export const initialBuddiesState: BuddiesState = {
  onboardingComplete: false,
  deviceId: null,
  registeredInboxId: null,
  syncSeq: 0,
  lastSyncAt: 0,
  buddies: [],
  outgoingInvites: [],
  incomingClaims: [],
  closedInviteIds: {},
  pendingRemovals: [],
  slotsNeedRestore: false,
  cards: {},
  publishedCardHashes: {},
  outgoingShares: {},
  shareReplies: {},
  incomingShares: {},
  joinRequests: {},
  askedToJoin: {},
  notifications: [],
  pushRegistrationKey: null,
  pushRegisteredAt: 0,
  sharing: { photo: true, tenure: true, updatedAt: 0 },
  notificationsEnabled: true,
  joinRequestNotifications: true,
  mutedJoinRequests: [],
  devOverride: false,
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
    notifications: state.notifications.filter(
      (n) =>
        (recent(n.at) || awaitsAnswer(n, { incomingClaims, incomingShares })) &&
        (n.kind === 'joinRequest'
          ? !!n.shareKey &&
            n.shareKey in joinRequests &&
            !joinRequests[n.shareKey].dismissed &&
            !joinRequests[n.shareKey].withdrawn
          : n.kind === 'shareReply' ||
            !n.shareKey ||
            n.shareKey in incomingShares) &&
        (!n.inviteId || incomingClaims.some((c) => c.inviteId === n.inviteId))
    ),
  }
}

type AnswerState = Pick<BuddiesState, 'incomingClaims' | 'incomingShares'>

/**
 * A request still waiting on this User: an open claim or an invitation not yet
 * answered. Answering is what clears it, so it can't be dismissed, evicted, or
 * aged out of the queue.
 */
export function awaitsAnswer(
  entry: BuddyNotification,
  state: AnswerState
): boolean {
  if (entry.kind === 'claim')
    return state.incomingClaims.some((c) => c.inviteId === entry.inviteId)
  if (entry.kind === 'shareInvite' || entry.kind === 'shareUpdate')
    return state.incomingShares[entry.shareKey ?? '']?.status === 'pending'
  return false
}

/**
 * Holds the queue to `MAX_NOTIFICATIONS`, dropping the oldest entries first but
 * never one that still awaits an answer.
 */
export function cappedQueue(
  notifications: BuddyNotification[],
  state: AnswerState
): BuddyNotification[] {
  if (notifications.length <= MAX_NOTIFICATIONS) return notifications
  const room =
    MAX_NOTIFICATIONS -
    notifications.filter((n) => awaitsAnswer(n, state)).length
  let kept = 0
  return notifications.filter((n) => awaitsAnswer(n, state) || kept++ < room)
}

/** Queue id for an invitation listed again after its entry was lost. */
export const pendingInviteNotificationId = (shareKey: string) =>
  `pending|${shareKey}`

/**
 * The queue with every unanswered invitation listed. The tray is where
 * invitations are answered, so one whose entry was lost (dismissed before
 * dismissal was blocked, say) is listed again.
 */
export function withPendingInvitesQueued(
  state: Pick<BuddiesState, 'notifications' | 'incomingShares' | 'buddies'>,
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
  if (missing.length === 0) return state.notifications
  return [...state.notifications, ...missing].sort((a, b) => b.at - a.at)
}

/** The queue entry a relay event (by inbox sequence) produced, if still listed. */
export function notificationIdForSeq(
  notifications: BuddyNotification[],
  seq: number
): string | null {
  return notifications.find((n) => n.seq === seq)?.id ?? null
}
