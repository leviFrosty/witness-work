import { z } from 'zod'
import { RELAY_ID_PATTERN } from '@/features/buddies/lib/bytes'

/** Plaintext shapes inside sealed blobs (docs/buddies-protocol.md). */

const relayId = z.string().regex(RELAY_ID_PATTERN)
const b64uKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const displayName = z.string().trim().min(1).max(60)

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
  dhPub: b64uKey,
  inboxId: relayId,
  offer: sharingOfferSchema,
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
  updatedAt: z.number(),
  level: z.literal('daysTimes'),
  days: z.array(buddyCardDaySchema).max(120),
})
export type BuddyCard = z.infer<typeof buddyCardSchema>

export const pairConfirmedSchema = z.object({
  v: z.literal(1),
  name: displayName,
})

const b64uSecret = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/** The encrypted multi-device roster: everything needed to rebuild pairings. */
export const rosterSchema = z.object({
  v: z.literal(1),
  displayName: z.string().max(60),
  buddies: z
    .array(
      z.object({
        inboxId: relayId,
        name: displayName,
        dhPub: b64uKey,
        inviteSecret: b64uSecret,
        status: z.enum(['active', 'awaitingConfirm']),
        pairedAt: z.number(),
        colorIndex: z.number().int().min(0),
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
        dhPub: b64uKey,
        inboxId: relayId,
        receivedAt: z.number(),
        expiresAt: z.number(),
      })
    )
    .max(5),
  closedInviteIds: z.record(relayId, z.number()).default({}),
})
export type Roster = z.infer<typeof rosterSchema>
