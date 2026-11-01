import { z } from 'zod'
import { BADGE_REACTION_IDS } from '@/features/buddies/lib/badgeReactions'
import { RELAY_ID_PATTERN } from '@/features/buddies/lib/bytes'
import { PET_NAME_MAX_LENGTH, PET_SPECIES_IDS } from '@/types/pet'

export const MAX_AVATAR_IMAGE_CHARS = 10_000

export const BUDDY_TENURE_KINDS = [
  'pioneer',
  'specialPioneer',
  'circuitOverseer',
  'regularAuxiliary',
] as const
export type BuddyTenureKind = (typeof BUDDY_TENURE_KINDS)[number]

export const BUDDY_PLAN_TIMES = ['exact', 'timeOfDay', 'daysOnly'] as const
export type BuddyPlanTimes = (typeof BUDDY_PLAN_TIMES)[number]

const relayId = z.string().regex(RELAY_ID_PATTERN)
const b64uKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const displayName = z.string().trim().min(1).max(60)

export const profilePhotoSchema = z.object({
  blob: b64uKey,
  token: b64uKey,
  key: b64uKey,
})
export type ProfilePhoto = z.infer<typeof profilePhotoSchema>

export const buddyAvatarSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('emoji'), v: z.string().min(1).max(16) }),
  z.object({
    t: z.literal('image'),
    v: z
      .string()
      .max(MAX_AVATAR_IMAGE_CHARS)
      .regex(/^[A-Za-z0-9+/=]+$/),

    full: profilePhotoSchema.optional().catch(undefined),
  }),
])
export type BuddyAvatar = z.infer<typeof buddyAvatarSchema>

export const buddyTenureSchema = z.object({
  kind: z.enum(BUDDY_TENURE_KINDS),
  since: z.string().regex(/^\d{4}-\d{2}$/),
})
export type BuddyTenure = z.infer<typeof buddyTenureSchema>

export const buddyStreakSchema = z.object({
  n: z.number().int().min(1).max(10_000),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type BuddyStreak = z.infer<typeof buddyStreakSchema>

export const MAX_SHARED_PET_COAT_LENGTH = 24

export const buddyPetSchema = z.object({
  species: z.enum(PET_SPECIES_IDS),
  coat: z.string().min(1).max(MAX_SHARED_PET_COAT_LENGTH),
  name: z
    .string()
    .trim()
    .min(1)
    .refine((name) => [...name].length <= PET_NAME_MAX_LENGTH)
    .optional()
    .catch(undefined),
})
export type BuddyPet = z.infer<typeof buddyPetSchema>

const profileFields = {
  avatar: buddyAvatarSchema.optional(),
  tenure: buddyTenureSchema.optional(),
}

export const BUDDY_PLATFORMS = ['ios', 'android'] as const
export type BuddyPlatform = (typeof BUDDY_PLATFORMS)[number]
const buddyPlatformSchema = z.enum(BUDDY_PLATFORMS).optional().catch(undefined)

export const sharingOfferSchema = z.object({
  plans: z.literal('daysTimes'),
})

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

export const BUDDY_TIMES_OF_DAY = ['m', 'a', 'e'] as const
export type BuddyTimeOfDay = (typeof BUDDY_TIMES_OF_DAY)[number]

export const buddyCardPlanSchema = z.object({
  s: z.number().int().min(0).max(1439).optional(),
  m: z.number().int().min(1).max(1440),

  t: z.enum(BUDDY_TIMES_OF_DAY).optional().catch(undefined),
})

export const buddyCardDaySchema = z.object({
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p: z.array(buddyCardPlanSchema).max(20),
})
export type BuddyCardDay = z.infer<typeof buddyCardDaySchema>

export const MAX_SHARED_BADGES = 40

const sharedBadgeSchema = z.object({
  c: z.string().min(1).max(40),
  l: z.number().int().min(1).max(4).optional(),
})

const sharedBadgesSchema = z
  .array(z.unknown())
  .max(MAX_SHARED_BADGES)
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = sharedBadgeSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  )

export const buddyCardSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,

  streak: buddyStreakSchema.optional().catch(undefined),
  updatedAt: z.number(),
  level: z.literal('daysTimes'),
  days: z.array(buddyCardDaySchema).max(120),

  badges: sharedBadgesSchema.optional().catch(undefined),

  pet: buddyPetSchema.optional().catch(undefined),
})
export type BuddyCard = z.infer<typeof buddyCardSchema>

export const pairConfirmedSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,
  platform: buddyPlatformSchema,
})

export const SHARE_TYPES = ['plan', 'followUp'] as const
export type ShareType = (typeof SHARE_TYPES)[number]

const shareLocationSchema = z.object({
  name: z.string().max(120).optional(),
  address: z.string().max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export const sharedPhotoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),

  blob: b64uKey,
  token: b64uKey,
  key: b64uKey,
  w: z.number().int().min(1).max(20_000),
  h: z.number().int().min(1).max(20_000),
})
export type SharedPhoto = z.infer<typeof sharedPhotoSchema>

export const MAX_SHARED_PHOTOS = 10

export const shareDetailsSchema = z.object({
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  s: z.number().int().min(0).max(1439).optional(),

  m: z.number().int().min(1).max(1440).optional(),
  title: z.string().max(100).optional(),
  location: shareLocationSchema.optional(),
  note: z.string().max(2000).optional(),

  noteDoc: z.string().max(12_000).optional(),

  photos: z.array(sharedPhotoSchema).max(MAX_SHARED_PHOTOS).optional(),

  firstName: z.string().max(40).optional(),

  topic: z.string().max(80).optional(),
})
export type ShareDetails = z.infer<typeof shareDetailsSchema>

export const MAX_SHARE_GUESTS = 5

export const MAX_GUEST_AVATAR_CHARS = 4_000

export const shareGuestSchema = z.object({
  t: relayId,
  n: displayName,
  a: z
    .discriminatedUnion('t', [
      z.object({ t: z.literal('emoji'), v: z.string().min(1).max(16) }),
      z.object({
        t: z.literal('image'),
        v: z
          .string()
          .max(MAX_GUEST_AVATAR_CHARS)
          .regex(/^[A-Za-z0-9+/=]+$/),
      }),
    ])
    .optional()
    .catch(undefined),
})
export type ShareGuest = z.infer<typeof shareGuestSchema>

export const shareInviteSchema = z.object({
  v: z.literal(1),
  id: relayId,

  rev: z.number(),
  type: z.enum(SHARE_TYPES),

  expiresAt: z.number(),

  keepUntil: z.number().optional(),
  details: shareDetailsSchema,

  people: z
    .array(shareGuestSchema)
    .min(1)
    .max(MAX_SHARE_GUESTS)
    .optional()
    .catch(undefined),

  more: z
    .number()
    .int()
    .min(1)
    .max(MAX_SHARE_GUESTS)
    .optional()
    .catch(undefined),
})
export type ShareInvite = z.infer<typeof shareInviteSchema>

export const shareCancelSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),

  removed: z.literal(true).optional(),
})
export type ShareCancel = z.infer<typeof shareCancelSchema>

export const SHARE_REPLIES = ['going', 'declined'] as const
export type ShareReply = (typeof SHARE_REPLIES)[number]

export const shareReplySchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  status: z.enum(SHARE_REPLIES),

  listed: z.literal(true).optional().catch(undefined),

  photo: z.literal(true).optional().catch(undefined),
})

export const joinRequestSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  s: z.number().int().min(0).max(1439).optional(),
  m: z.number().int().min(1).max(1440).optional(),

  expiresAt: z.number(),
})
export type JoinRequest = z.infer<typeof joinRequestSchema>

export const badgeNewSchema = z.object({
  v: z.literal(1),
  badges: sharedBadgesSchema,
})

export const badgeReactionSchema = z.object({
  v: z.literal(1),
  badge: sharedBadgeSchema,
  e: z.enum(BADGE_REACTION_IDS),
  rev: z.number(),
})
export type BadgeReactionEvent = z.infer<typeof badgeReactionSchema>

export const carInviteEventSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  inviteId: relayId,
  joinSecret: b64uKey,
  epoch: z.number().int().min(1).safe(),
  key: b64uKey,
  name: z.string(),
  people: z.number().int().min(0).safe(),
  expiresAt: z.number(),
})
export type CarInviteEvent = z.infer<typeof carInviteEventSchema>

export const carCancelEventSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  inviteId: relayId,
})
export type CarCancelEvent = z.infer<typeof carCancelEventSchema>

export const CAR_REPLIES = ['joined', 'declined'] as const
export type CarReply = (typeof CAR_REPLIES)[number]

export const carReplyEventSchema = carCancelEventSchema.extend({
  status: z.enum(CAR_REPLIES),
})
export type CarReplyEvent = z.infer<typeof carReplyEventSchema>

const b64uSecret = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

const shareKey = z.string().regex(/^[A-Za-z0-9_-]{22}\|[A-Za-z0-9_-]{22}$/)

const notificationId = z
  .string()
  .regex(/^(pending\|[A-Za-z0-9_-]{22}\|)?[A-Za-z0-9_-]{22}$/)

function lenientRecord<V extends z.ZodTypeAny>(key: z.ZodString, value: V) {
  return z
    .record(z.string(), z.unknown())
    .default({})
    .catch({})
    .transform(
      (entries) =>
        Object.fromEntries(
          Object.entries(entries).flatMap(([id, entry]) => {
            const parsed = value.safeParse(entry)
            return key.safeParse(id).success && parsed.success
              ? [[id, parsed.data]]
              : []
          })
        ) as Record<string, z.infer<V>>
    )
}

const buddyOverridesSchema = z.object({
  photo: z.boolean().optional().catch(undefined),
  tenure: z.boolean().optional().catch(undefined),
  streak: z.boolean().optional().catch(undefined),
  badges: z.boolean().optional().catch(undefined),
  pet: z.boolean().optional().catch(undefined),
  plans: z.boolean().optional().catch(undefined),
  planTimes: z.enum(BUDDY_PLAN_TIMES).optional().catch(undefined),
  showOnCalendar: z.boolean().optional().catch(undefined),
  petVisits: z.boolean().optional().catch(undefined),
})

export const rosterSchema = z.object({
  v: z.literal(1),

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

        overrides: buddyOverridesSchema.optional(),
        expiresAt: z.number().optional(),

        prefsAt: z.number().optional(),
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

  removedBuddies: z.record(relayId, z.number()).default({}),
  sharing: z
    .object({
      photo: z.boolean(),
      tenure: z.boolean(),

      streak: z.boolean().default(true),
      updatedAt: z.number(),

      badges: z.boolean().optional(),

      badgesUpdatedAt: z.number().optional(),

      pet: z.boolean().optional().catch(undefined),

      petUpdatedAt: z.number().optional().catch(undefined),

      planTimes: z.enum(BUDDY_PLAN_TIMES).optional().catch(undefined),
      pausedUntil: z.number().nonnegative().optional(),

      plans: z.boolean().optional(),

      plansUpdatedAt: z.number().optional(),

      showOnCalendar: z.boolean().optional(),

      calendarUpdatedAt: z.number().optional(),

      petVisits: z.boolean().optional().catch(undefined),

      petVisitsUpdatedAt: z.number().optional().catch(undefined),
    })
    .default({ photo: true, tenure: true, streak: true, updatedAt: 0 }),

  answers: lenientRecord(
    shareKey,
    z.object({
      s: z.enum([...SHARE_REPLIES, 'none']),
      v: z.number(),
      r: z.number(),
      x: z.number(),
    })
  ),

  read: lenientRecord(notificationId, z.number()),

  dismissed: lenientRecord(notificationId, z.number()),

  card: z
    .object({ name: z.string().max(120), updatedAt: z.number() })
    .optional()
    .catch(undefined),

  cars: lenientRecord(relayId, z.object({ at: z.number().finite() })),
  leftCars: lenientRecord(relayId, z.number().finite()),
})
export type Roster = z.infer<typeof rosterSchema>
