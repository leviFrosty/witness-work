import type { z, ZodType } from 'zod'
import {
  fromB64u,
  fromUtf8,
  RELAY_ID_PATTERN,
} from '@/features/buddies/lib/bytes'
import { open } from '@/features/buddies/lib/crypto'
import { aad } from '@/features/buddies/lib/keys'
import type { BadgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import {
  badgeNewSchema,
  badgeReactionSchema,
  joinRequestSchema,
  pairConfirmedSchema,
  pairingCardSchema,
  shareCancelSchema,
  shareInviteSchema,
  shareReplySchema,
  type ShareDetails,
  type ShareReply,
  type ShareType,
} from '@/features/buddies/lib/schemas'
import {
  knownBadges,
  sortedForAnnouncement,
} from '@/features/buddies/lib/sharedBadges'
import type { SharedBadge } from '@/types/badges'

/**
 * Named Buddies alerts, opened on the device. A push's alert text is the
 * generic template this device registered, because the relay must never see a
 * name. The push also carries the event it's about, still sealed (or just its
 * `seq`, to fetch it, when it didn't fit), so the device opens it with the keys
 * in a `BuddyAlertContext` and words the alert itself: "Anna invited you to a
 * Plan", with the day and time.
 *
 * IOS does this in its Notification Service Extension
 * (`targets/notification-service`), which mirrors `describeBuddyEvent` in Swift
 * and passes the same vectors (`testing/alertVectors.json`). Android does it in
 * its push task (`src/app/buddies/buddiesPushAlerts.ts`).
 */

/** The `ww` marker of a Buddies push (docs/buddies-protocol.md). */
export type BuddiesPushMarker = {
  kind: string
  /** The inbox `seq` of the event; absent from relays before named alerts. */
  seq?: number
  /** The event itself, still sealed, when it fit in the push. */
  eventId?: string
  blob?: string
}

const B64U = /^[A-Za-z0-9_-]+$/

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/** A `ww` marker, or null when `value` isn't one. Unknown fields are dropped. */
export function parsePushMarker(value: unknown): BuddiesPushMarker | null {
  const marker = record(value)
  if (!marker || typeof marker.kind !== 'string') return null
  const { kind, seq, eventId, blob } = marker
  const inline =
    typeof eventId === 'string' &&
    RELAY_ID_PATTERN.test(eventId) &&
    typeof blob === 'string' &&
    B64U.test(blob)
  return {
    kind,
    ...(typeof seq === 'number' && Number.isSafeInteger(seq) ? { seq } : {}),
    ...(inline ? { eventId, blob } : {}),
  }
}

/**
 * The marker in a push as expo-notifications hands it over: among the APNs
 * payload's keys on iOS; on Android, in the FCM data's JSON `body`, which the
 * background task also gets as `dataString`.
 */
export function pushMarkerOf(
  data: Record<string, unknown> | undefined
): BuddiesPushMarker | null {
  if (data?.ww !== undefined) return parsePushMarker(data.ww)
  const json = data?.dataString ?? data?.body
  if (typeof json !== 'string') return null
  try {
    return parsePushMarker(record(JSON.parse(json))?.ww)
  } catch {
    return null
  }
}

/**
 * Buddies' social news: a buddy's new badge, or their reaction to one of this
 * User's. It arrives quietly, without sound or a banner (ADR 0021).
 */
export const isBuddiesNewsKind = (kind: string) =>
  kind === 'badge.new' || kind === 'badge.reaction'

/** A shared Plan or Follow-up's type, day, and start, as its sender wrote them. */
export type ShareWhen = { t: ShareType; d: string; s?: number }

export const shareWhen = (
  type: ShareType,
  details: ShareDetails
): ShareWhen => ({
  t: type,
  d: details.d,
  ...(details.s === undefined ? {} : { s: details.s }),
})

/** One buddy, as the alerts see them. */
export type AlertBuddy = {
  /** The slot this buddy writes into this User's inbox. */
  slot: string
  /** The key that opens what they write there (base64url). */
  key: string
  /** Their nickname on this device, or else their name. */
  name: string
  /** Their requests to join don't alert this device. */
  joinMuted?: true
  /** Their invitations to this User, by share id. */
  shares?: Record<string, ShareWhen>
}

/**
 * Everything a named alert needs, written by the app (`alertContext` in the
 * engine). On iOS it's kept in the Keychain for the extension, so it holds keys
 * that open events and nothing that writes or signs, except the owner key for
 * fetching an event too big for the push.
 */
export type BuddyAlertContext = {
  v: 1
  inboxId: string
  /** Signs the `inbox/sync` that fetches an event too big for the push. */
  ownerSeed: string
  buddies: AlertBuddy[]
  /** This User's open invites: each claim is sealed with its invite's key. */
  invites: { id: string; key: string }[]
  /** This User's own shared Plans and Follow-ups, by share id, for replies. */
  myShares: Record<string, ShareWhen>
  /** Badge Alerts on here (and Badges shown). */
  badgeAlerts: boolean
  /** Ask to Join alerts on here. */
  joinAlerts: boolean
  /**
   * The badges this build knows, in the order several are named: collections
   * have levels 1–4, One-time Badges none. Lets the extension skip a badge from
   * a newer app, as `knownBadges` does.
   */
  catalog: { order: string[]; oneTime: string[] }
}

/** A Plan or Follow-up's day and start in the sender's calendar. */
export type AlertWhen = { d: string; s?: number }

/** What happened, by whom: the words come from `buddyAlertText`. */
export type BuddyAlert =
  | { type: 'claimed'; name: string }
  | { type: 'paired'; name: string }
  | {
      type: 'share'
      action: 'invite' | 'update' | 'cancel'
      shareType: ShareType
      name: string
      when?: AlertWhen
    }
  | {
      type: 'reply'
      reply: ShareReply
      name: string
      shareType?: ShareType
      when?: AlertWhen
    }
  | { type: 'joinRequest'; name: string; when: AlertWhen }
  | { type: 'badge'; name: string; badges: SharedBadge[] }
  | {
      type: 'badgeReaction'
      name: string
      reaction: BadgeReactionEmoji
      badge: SharedBadge
    }

/**
 * Why a push keeps its template text: nothing to open it with (`noContext`), no
 * event to open (`noEvent`), no buddy or invite whose key opens it
 * (`unknownSender`), what's inside doesn't parse (`unreadable`), or a kind this
 * build doesn't word (`unknownKind`).
 */
export type BuddyAlertFailure =
  | 'noContext'
  | 'noEvent'
  | 'unknownSender'
  | 'unreadable'
  | 'unknownKind'

/**
 * `alert`: show it named. `quiet`: this device muted it (Ask to Join or Badge
 * Alerts off, or a kind that never alerts), so Android posts nothing; iOS can't
 * drop an alert, so it keeps the template. `failed`: keep the template.
 */
export type BuddyAlertOutcome =
  | { alert: BuddyAlert }
  | { quiet: true }
  | { failed: BuddyAlertFailure }

/** An event as the push carried it, or as `inbox/sync` returned it. */
export type SealedEvent = {
  eventId: string
  kind: string
  blob: string
  /** Known when fetched; a push leaves it out, so every buddy's key is tried. */
  slotId?: string
}

const failed = (reason: BuddyAlertFailure): BuddyAlertOutcome => ({
  failed: reason,
})

/** The plaintext, or null when `key` doesn't open the blob in `context`. */
function opened(key: string, blob: string, context: string): Uint8Array | null {
  try {
    return open(fromB64u(key), blob, context)
  } catch {
    return null
  }
}

/** Opened JSON; `undefined` (never valid) when it isn't JSON. */
function json(plaintext: Uint8Array): unknown {
  try {
    return JSON.parse(fromUtf8(plaintext))
  } catch {
    return undefined
  }
}

function parsed<S extends ZodType>(
  schema: S,
  value: unknown
): z.output<S> | null {
  const result = schema.safeParse(value)
  return result.success ? (result.data as z.output<S>) : null
}

const whenOf = (share: ShareWhen | undefined): AlertWhen | undefined =>
  share && { d: share.d, ...(share.s === undefined ? {} : { s: share.s }) }

type Handler =
  | 'paired'
  | 'share'
  | 'reply'
  | 'joinRequest'
  | 'quiet'
  | 'badge'
  | 'badgeReaction'

function handlerOf(kind: string): Handler | null {
  if (kind === 'pair.confirmed') return 'paired'
  if (kind === 'share.reply') return 'reply'
  if (/^(plan|followup)\.(invite|update|cancel)$/.test(kind)) return 'share'
  if (/^join\.request\.[0-9a-f]{12}$/.test(kind)) return 'joinRequest'
  // Withdrawals never alert.
  if (kind === 'join.cancel') return 'quiet'
  if (kind === 'badge.new') return 'badge'
  if (kind === 'badge.reaction') return 'badgeReaction'
  return null
}

/**
 * Opens `event` with the keys in `context` and says what it means for an alert.
 * Pure, so the Swift extension can mirror it exactly.
 */
export function describeBuddyEvent(
  context: BuddyAlertContext,
  event: SealedEvent
): BuddyAlertOutcome {
  if (event.kind === 'invite.claimed') {
    // The claim's event id is the invite's id.
    const invite = context.invites.find((i) => i.id === event.eventId)
    if (!invite) return failed('unknownSender')
    const plaintext = opened(invite.key, event.blob, aad.claim(invite.id))
    if (!plaintext) return failed('unknownSender')
    const claim = parsed(pairingCardSchema, json(plaintext))
    return claim
      ? { alert: { type: 'claimed', name: claim.name } }
      : failed('unreadable')
  }

  const handler = handlerOf(event.kind)
  if (!handler) return failed('unknownKind')
  if (handler === 'quiet') return { quiet: true }

  // The sender is the buddy whose key opens it.
  let sender: { buddy: AlertBuddy; plaintext: Uint8Array } | null = null
  for (const buddy of context.buddies) {
    if (event.slotId !== undefined && buddy.slot !== event.slotId) continue
    const plaintext = opened(
      buddy.key,
      event.blob,
      aad.event(context.inboxId, buddy.slot, event.eventId)
    )
    if (plaintext) {
      sender = { buddy, plaintext }
      break
    }
  }
  if (!sender) return failed('unknownSender')
  const { buddy } = sender
  const body = json(sender.plaintext)
  const name = buddy.name

  switch (handler) {
    case 'paired':
      return parsed(pairConfirmedSchema, body)
        ? { alert: { type: 'paired', name } }
        : failed('unreadable')
    case 'share': {
      const [prefix, action] = event.kind.split('.') as [
        string,
        'invite' | 'update' | 'cancel',
      ]
      const shareType: ShareType = prefix === 'plan' ? 'plan' : 'followUp'
      if (action === 'cancel') {
        const cancel = parsed(shareCancelSchema, body)
        if (!cancel) return failed('unreadable')
        const when = whenOf(buddy.shares?.[cancel.id])
        return {
          alert: {
            type: 'share',
            action,
            shareType,
            name,
            ...(when ? { when } : {}),
          },
        }
      }
      const invite = parsed(shareInviteSchema, body)
      if (!invite || invite.type !== shareType) return failed('unreadable')
      return {
        alert: {
          type: 'share',
          action,
          shareType,
          name,
          when: whenOf(shareWhen(shareType, invite.details))!,
        },
      }
    }
    case 'reply': {
      const reply = parsed(shareReplySchema, body)
      if (!reply) return failed('unreadable')
      const mine = context.myShares[reply.id]
      return {
        alert: {
          type: 'reply',
          reply: reply.status,
          name,
          ...(mine ? { shareType: mine.t, when: whenOf(mine)! } : {}),
        },
      }
    }
    case 'joinRequest': {
      const request = parsed(joinRequestSchema, body)
      if (!request) return failed('unreadable')
      if (!context.joinAlerts || buddy.joinMuted) return { quiet: true }
      return {
        alert: {
          type: 'joinRequest',
          name,
          when: {
            d: request.d,
            ...(request.s === undefined ? {} : { s: request.s }),
          },
        },
      }
    }
    case 'badge': {
      const news = parsed(badgeNewSchema, body)
      if (!news) return failed('unreadable')
      if (!context.badgeAlerts) return { quiet: true }
      return {
        alert: {
          type: 'badge',
          name,
          badges: sortedForAnnouncement(knownBadges(news.badges)),
        },
      }
    }
    case 'badgeReaction': {
      const reaction = parsed(badgeReactionSchema, body)
      if (!reaction) return failed('unreadable')
      if (!context.badgeAlerts) return { quiet: true }
      const [badge] = knownBadges([reaction.badge])
      if (!badge) return failed('unreadable')
      return {
        alert: { type: 'badgeReaction', name, reaction: reaction.e, badge },
      }
    }
  }
}
