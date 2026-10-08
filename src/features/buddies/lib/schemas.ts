import { z } from 'zod'
import { RELAY_ID_PATTERN } from '@/features/buddies/lib/bytes'

/** Base64 of a ~96 px JPEG; keeps a Buddy Card well under the 16 KB cap. */
export const MAX_AVATAR_IMAGE_CHARS = 10_000

export const BUDDY_TENURE_KINDS = [
  'pioneer',
  'specialPioneer',
  'circuitOverseer',
  'regularAuxiliary',
] as const
export type BuddyTenureKind = (typeof BUDDY_TENURE_KINDS)[number]

/** Plaintext shapes inside sealed blobs (docs/buddies-protocol.md). */

const relayId = z.string().regex(RELAY_ID_PATTERN)
const b64uKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const displayName = z.string().trim().min(1).max(60)

/**
 * How a buddy looks on the other phone: an emoji, or a small JPEG thumbnail
 * (base64) that only travels in Buddy Cards — invites are too small for it.
 */
export const buddyAvatarSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('emoji'), v: z.string().min(1).max(16) }),
  z.object({
    t: z.literal('image'),
    v: z
      .string()
      .max(MAX_AVATAR_IMAGE_CHARS)
      .regex(/^[A-Za-z0-9+/=]+$/),
  }),
])
export type BuddyAvatar = z.infer<typeof buddyAvatarSchema>

/**
 * The Tenure line ("Regular pioneer since September 2019"), rendered by the
 * receiver. Month precision is all the line shows, so it's all that's sent.
 */
export const buddyTenureSchema = z.object({
  kind: z.enum(BUDDY_TENURE_KINDS),
  since: z.string().regex(/^\d{4}-\d{2}$/),
})
export type BuddyTenure = z.infer<typeof buddyTenureSchema>

/**
 * The sender's Service Streak (`n` weeks or months in a row), sent only once
 * it's long enough to show. `until` is the sender's last day it lasts without
 * more service, so a buddy's phone stops showing one that lapsed while the
 * sender's app was closed. Week or month isn't sent; buddies see the count.
 */
export const buddyStreakSchema = z.object({
  n: z.number().int().min(1).max(10_000),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type BuddyStreak = z.infer<typeof buddyStreakSchema>

/** Identity fields every Buddies payload may carry next to `name`. */
const profileFields = {
  avatar: buddyAvatarSchema.optional(),
  tenure: buddyTenureSchema.optional(),
}

/**
 * The sender's platform, for pairing analytics only. Optional and lenient: an
 * unknown value reads as absent rather than spoiling the whole card.
 */
export const BUDDY_PLATFORMS = ['ios', 'android'] as const
export type BuddyPlatform = (typeof BUDDY_PLATFORMS)[number]
const buddyPlatformSchema = z.enum(BUDDY_PLATFORMS).optional().catch(undefined)

export const sharingOfferSchema = z.object({
  plans: z.literal('daysTimes'),
})

/**
 * The invite card (inviter → link holder) and the claim (link holder →
 * inviter).
 */
export const pairingCardSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,
  dhPub: b64uKey,
  inboxId: relayId,
  offer: sharingOfferSchema,
  platform: buddyPlatformSchema,
})
export type PairingCard = z.infer<typeof pairingCardSchema>

export const buddyCardPlanSchema = z.object({
  s: z.number().int().min(0).max(1439).optional(),
  m: z.number().int().min(1).max(1440),
})

export const buddyCardDaySchema = z.object({
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p: z.array(buddyCardPlanSchema).max(20),
})
export type BuddyCardDay = z.infer<typeof buddyCardDaySchema>

export const buddyCardSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,
  // A streak this version can't read is dropped, not the whole card.
  streak: buddyStreakSchema.optional().catch(undefined),
  updatedAt: z.number(),
  level: z.literal('daysTimes'),
  days: z.array(buddyCardDaySchema).max(120),
})
export type BuddyCard = z.infer<typeof buddyCardSchema>

export const pairConfirmedSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,
  platform: buddyPlatformSchema,
})

/**
 * Shared Plans and Follow-ups (invitations). `details` is everything the
 * invited buddy sees; a Follow-up carries only minimal householder data.
 */
export const SHARE_TYPES = ['plan', 'followUp'] as const
export type ShareType = (typeof SHARE_TYPES)[number]

const shareLocationSchema = z.object({
  name: z.string().max(120).optional(),
  address: z.string().max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export const shareDetailsSchema = z.object({
  /** The sender's local calendar day. */
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Start, in minutes after midnight. */
  s: z.number().int().min(0).max(1439).optional(),
  /** Planned minutes (Plans only). */
  m: z.number().int().min(1).max(1440).optional(),
  title: z.string().max(100).optional(),
  location: shareLocationSchema.optional(),
  note: z.string().max(2000).optional(),
  /** Follow-ups only: the householder's first name or nickname. */
  firstName: z.string().max(40).optional(),
  /** Follow-ups only. */
  topic: z.string().max(80).optional(),
})
export type ShareDetails = z.infer<typeof shareDetailsSchema>

/** `plan.invite` / `plan.update` / `followup.invite` / `followup.update`. */
export const shareInviteSchema = z.object({
  v: z.literal(1),
  id: relayId,
  /** The sender's clock at send time; newer wins. */
  rev: z.number(),
  type: z.enum(SHARE_TYPES),
  /** When both phones wipe it. */
  expiresAt: z.number(),
  details: shareDetailsSchema,
})
export type ShareInvite = z.infer<typeof shareInviteSchema>

/** `plan.cancel` / `followup.cancel`. */
export const shareCancelSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
})

export const SHARE_REPLIES = ['going', 'declined'] as const
export type ShareReply = (typeof SHARE_REPLIES)[number]

/** `share.reply` (invited buddy → sender). */
export const shareReplySchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  status: z.enum(SHARE_REPLIES),
})

/**
 * `join.request.<tag>` (asking buddy → Plan owner): asks to be invited to the
 * owner's Plan at `d`/`s`, as the asker saw it on the owner's Buddy Card.
 * Carries nothing the card didn't. A `join.cancel` withdraws it, with the
 * `shareCancelSchema` shape.
 */
export const joinRequestSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  s: z.number().int().min(0).max(1439).optional(),
  m: z.number().int().min(1).max(1440).optional(),
  /** The Plan's start: both phones drop the request then. */
  expiresAt: z.number(),
})
export type JoinRequest = z.infer<typeof joinRequestSchema>

const b64uSecret = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/**
 * The encrypted multi-device roster: everything needed to rebuild pairings.
 * Unknown fields are dropped, not rejected, so older builds still read rosters
 * that carry fields added since.
 */
export const rosterSchema = z.object({
  v: z.literal(1),
  /**
   * Counts roster writes across the User's devices. A device ignores a roster
   * older than the newest it has seen. Absent from rosters written by builds
   * before it.
   */
  version: z.number().int().nonnegative().optional(),
  buddies: z
    .array(
      z.object({
        inboxId: relayId,
        name: displayName,
        nickname: displayName.optional(),
        ...profileFields,
        dhPub: b64uKey,
        inviteSecret: b64uSecret,
        status: z.enum(['active', 'awaitingConfirm']),
        pairedAt: z.number(),
        colorIndex: z.number().int().min(0),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/)
          .optional(),
        showOnCalendar: z.boolean(),
        expiresAt: z.number().optional(),
      })
    )
    .max(5),
  outgoingInvites: z
    .array(
      z.object({
        inviteId: relayId,
        secret: b64uSecret,
        createdAt: z.number(),
        expiresAt: z.number(),
      })
    )
    .max(5),
  incomingClaims: z
    .array(
      z.object({
        inviteId: relayId,
        secret: b64uSecret,
        name: displayName,
        ...profileFields,
        dhPub: b64uKey,
        inboxId: relayId,
        platform: buddyPlatformSchema,
        receivedAt: z.number(),
        expiresAt: z.number(),
      })
    )
    .max(5),
  closedInviteIds: z.record(relayId, z.number()).default({}),
  /** Ended pairings: buddy inboxId → `removedAt` (see `RemovedBuddies`). */
  removedBuddies: z.record(relayId, z.number()).default({}),
  sharing: z
    .object({
      photo: z.boolean(),
      tenure: z.boolean(),
      // Rosters written before streaks existed.
      streak: z.boolean().default(true),
      updatedAt: z.number(),
    })
    .default({ photo: true, tenure: true, streak: true, updatedAt: 0 }),
})
export type Roster = z.infer<typeof rosterSchema>
