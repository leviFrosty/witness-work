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

export type BuddyNotificationKind =
  | 'claim'
  | 'paired'
  | 'shareInvite'
  | 'shareUpdate'
  | 'shareCancel'
  | 'shareReply'

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
  /** `share*`: the incoming share key (`from|shareId`) or outgoing shareId. */
  shareKey?: string
  shareType?: ShareType
  /** `shareReply`. */
  reply?: ShareReply
}

export const MAX_NOTIFICATIONS = 50
export const NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const incomingShareKey = (from: string, shareId: string) =>
  `${from}|${shareId}`

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
  /** Newest first. */
  notifications: BuddyNotification[]
  /** Hash of the last successful push registration. */
  pushRegistrationKey: string | null
  sharing: BuddySharing
  /** Per-device: Buddies pushes on this device (iOS permission aside). */
  notificationsEnabled: boolean
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
  notifications: [],
  pushRegistrationKey: null,
  sharing: { photo: true, tenure: true, updatedAt: 0 },
  notificationsEnabled: true,
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
        recent(n.at) &&
        (n.kind === 'shareReply' ||
          !n.shareKey ||
          n.shareKey in incomingShares) &&
        (!n.inviteId || incomingClaims.some((c) => c.inviteId === n.inviteId))
    ),
  }
}
