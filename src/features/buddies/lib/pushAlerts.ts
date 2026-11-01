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
  carInviteEventSchema,
  carReplyEventSchema,
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

export type BuddiesPushMarker = {
  kind: string

  seq?: number

  eventId?: string
  blob?: string
}

const B64U = /^[A-Za-z0-9_-]+$/

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

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

export const isBuddiesNewsKind = (kind: string) =>
  kind === 'badge.new' || kind === 'badge.reaction'

export type ShareWhen = { t: ShareType; d: string; s?: number }

export const shareWhen = (
  type: ShareType,
  details: ShareDetails
): ShareWhen => ({
  t: type,
  d: details.d,
  ...(details.s === undefined ? {} : { s: details.s }),
})

export type AlertBuddy = {
  slot: string

  key: string

  name: string

  joinMuted?: true

  badgeMuted?: true

  shares?: Record<string, ShareWhen>
}

export type BuddyAlertContext = {
  v: 1
  inboxId: string

  ownerSeed: string
  buddies: AlertBuddy[]

  invites: { id: string; key: string }[]

  myShares: Record<string, ShareWhen>

  badgeAlerts: boolean

  joinAlerts: boolean

  catalog: { order: string[]; oneTime: string[] }
}

export type AlertWhen = { d: string; s?: number }

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
  | { type: 'carInvite'; name: string }
  | { type: 'carJoined'; name: string }

export type BuddyAlertFailure =
  | 'noContext'
  | 'noEvent'
  | 'unknownSender'
  | 'unreadable'
  | 'unknownKind'

export type BuddyAlertOutcome =
  | { alert: BuddyAlert }
  | { quiet: true }
  | { failed: BuddyAlertFailure }

export type SealedEvent = {
  eventId: string
  kind: string
  blob: string

  slotId?: string
}

const failed = (reason: BuddyAlertFailure): BuddyAlertOutcome => ({
  failed: reason,
})

function opened(key: string, blob: string, context: string): Uint8Array | null {
  try {
    return open(fromB64u(key), blob, context)
  } catch {
    return null
  }
}

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
  | 'carInvite'
  | 'carReply'

function handlerOf(kind: string): Handler | null {
  if (kind === 'pair.confirmed') return 'paired'
  if (kind === 'share.reply') return 'reply'
  if (/^(plan|followup)\.(invite|update|cancel)$/.test(kind)) return 'share'
  if (/^join\.request\.[0-9a-f]{12}$/.test(kind)) return 'joinRequest'

  if (kind === 'join.cancel') return 'quiet'
  if (kind === 'badge.new') return 'badge'
  if (kind === 'badge.reaction') return 'badgeReaction'
  if (kind === 'car.invite') return 'carInvite'
  if (kind === 'car.reply') return 'carReply'

  if (kind === 'car.cancel') return 'quiet'
  return null
}

export function describeBuddyEvent(
  context: BuddyAlertContext,
  event: SealedEvent
): BuddyAlertOutcome {
  if (event.kind === 'invite.claimed') {
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
      if (!context.badgeAlerts || buddy.badgeMuted) return { quiet: true }
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
      if (!context.badgeAlerts || buddy.badgeMuted) return { quiet: true }
      const [badge] = knownBadges([reaction.badge])
      if (!badge) return failed('unreadable')
      return {
        alert: { type: 'badgeReaction', name, reaction: reaction.e, badge },
      }
    }
    case 'carInvite':
      return parsed(carInviteEventSchema, body)
        ? { alert: { type: 'carInvite', name } }
        : failed('unreadable')
    case 'carReply': {
      const reply = parsed(carReplyEventSchema, body)
      if (!reply) return failed('unreadable')

      return reply.status === 'joined'
        ? { alert: { type: 'carJoined', name } }
        : { quiet: true }
    }
  }
}
