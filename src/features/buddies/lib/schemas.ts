import { z } from 'zod'
import { BADGE_REACTION_IDS } from '@/features/buddies/lib/badgeReactions'
import { RELAY_ID_PATTERN } from '@/features/buddies/lib/bytes'
import { PET_NAME_MAX_LENGTH, PET_SPECIES_IDS } from '@/types/pet'

/** Base64 of a ~96 px JPEG; keeps a Buddy Card well under the 16 KB cap. */
export const MAX_AVATAR_IMAGE_CHARS = 10_000

export const BUDDY_TENURE_KINDS = [
  'pioneer',
  'specialPioneer',
  'circuitOverseer',
  'regularAuxiliary',
] as const
export type BuddyTenureKind = (typeof BUDDY_TENURE_KINDS)[number]

/**
 * How precisely Buddy Cards show when this User's Plans start: the exact time,
 * only the part of the day, or only which days.
 */
export const BUDDY_PLAN_TIMES = ['exact', 'timeOfDay', 'daysOnly'] as const
export type BuddyPlanTimes = (typeof BUDDY_PLAN_TIMES)[number]

/** Plaintext shapes inside sealed blobs (docs/buddies-protocol.md). */

const relayId = z.string().regex(RELAY_ID_PATTERN)
const b64uKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const displayName = z.string().trim().min(1).max(60)

/**
 * The Profile photo at full size: an encrypted blob the sender uploaded to the
 * relay under their own inbox, and what's needed to read it.
 */
export const profilePhotoSchema = z.object({
  /** `b64u(SHA-256(sealed bytes))`. */
  blob: b64uKey,
  token: b64uKey,
  key: b64uKey,
})
export type ProfilePhoto = z.infer<typeof profilePhotoSchema>

/**
 * How a buddy looks on the other phone: an emoji, or a small JPEG thumbnail
 * (base64) that only travels in Buddy Cards — invites are too small for it. A
 * card's thumbnail may link the photo at full size (`full`), opened when the
 * buddy taps it.
 */
export const buddyAvatarSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('emoji'), v: z.string().min(1).max(16) }),
  z.object({
    t: z.literal('image'),
    v: z
      .string()
      .max(MAX_AVATAR_IMAGE_CHARS)
      .regex(/^[A-Za-z0-9+/=]+$/),
    // One this build can't read leaves the thumbnail, not the whole card.
    full: profilePhotoSchema.optional().catch(undefined),
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

/** The longest coat id a Buddy Card's pet may carry. */
export const MAX_SHARED_PET_COAT_LENGTH = 24

/**
 * The sender's Pet Companion as buddies see it: species, coat, and name. A
 * species this build doesn't know fails the pet, which the card then drops. The
 * coat is kept as sent (the receiver draws an unknown one in the species'
 * default coat), and a name it can't read costs only the name. The name's limit
 * counts characters, as the pet's own name field does.
 */
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

/**
 * Part of the day a Plan starts in, sent in place of its start time when the
 * sender shares only the time of day: morning, afternoon, or evening.
 */
export const BUDDY_TIMES_OF_DAY = ['m', 'a', 'e'] as const
export type BuddyTimeOfDay = (typeof BUDDY_TIMES_OF_DAY)[number]

export const buddyCardPlanSchema = z.object({
  s: z.number().int().min(0).max(1439).optional(),
  m: z.number().int().min(1).max(1440),
  /**
   * Added after v1 shipped: older apps ignore it and show the Plan as anytime;
   * one this build can't read leaves just this field out.
   */
  t: z.enum(BUDDY_TIMES_OF_DAY).optional().catch(undefined),
})

export const buddyCardDaySchema = z.object({
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p: z.array(buddyCardPlanSchema).max(20),
})
export type BuddyCardDay = z.infer<typeof buddyCardDaySchema>

/** Badges one payload may carry; a card holds one per collection at most. */
export const MAX_SHARED_BADGES = 40

/** One earned badge: its art id and level (absent for a One-time Badge). */
const sharedBadgeSchema = z.object({
  c: z.string().min(1).max(40),
  l: z.number().int().min(1).max(4).optional(),
})

/**
 * Earned badges as they travel. An item this build can't read is dropped on its
 * own, so a newer app's badges never cost the rest; the receiver then drops
 * badges it doesn't know (`knownBadges`).
 */
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
  // A streak this version can't read is dropped, not the whole card.
  streak: buddyStreakSchema.optional().catch(undefined),
  updatedAt: z.number(),
  level: z.literal('daysTimes'),
  days: z.array(buddyCardDaySchema).max(120),
  /**
   * Added after v1 shipped: older apps ignore it, and a malformed list costs
   * only the badges, never the Plans.
   */
  badges: sharedBadgesSchema.optional().catch(undefined),
  /**
   * Added after v1 shipped, like `badges`: older apps ignore it, and a pet this
   * build can't read (a newer species, say) is dropped, never the card.
   */
  pet: buddyPetSchema.optional().catch(undefined),
})
export type BuddyCard = z.infer<typeof buddyCardSchema>

export const pairConfirmedSchema = z.object({
  v: z.literal(1),
  name: displayName,
  ...profileFields,
  platform: buddyPlatformSchema,
})

/**
 * A buddy changed their account key: a fresh invite to their new inbox, sent
 * through the pairing it replaces (docs/buddies-protocol.md, Reconnect
 * invites). `secret` is the invite link's secret.
 */
export const pairReconnectSchema = z.object({
  v: z.literal(1),
  inboxId: relayId,
  secret: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  expiresAt: z.number(),
})
export type PairReconnect = z.infer<typeof pairReconnectSchema>

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

/**
 * A photo in a shared Plan's note: an encrypted blob the sender uploaded to the
 * relay under their own inbox, and what's needed to read it. `id` is the
 * photo's id in the shared `noteDoc`.
 */
export const sharedPhotoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  /** `b64u(SHA-256(sealed bytes))`. */
  blob: b64uKey,
  token: b64uKey,
  key: b64uKey,
  w: z.number().int().min(1).max(20_000),
  h: z.number().int().min(1).max(20_000),
})
export type SharedPhoto = z.infer<typeof sharedPhotoSchema>

export const MAX_SHARED_PHOTOS = 10

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
  /**
   * Plans only: the note's formatting, a deflated Tiptap doc as base64url
   * (`encodeSharedNoteDoc`). `note` stays the plain text, for alerts and
   * anything that can't read it.
   */
  noteDoc: z.string().max(12_000).optional(),
  /** Plans only: the photos `noteDoc` shows. */
  photos: z.array(sharedPhotoSchema).max(MAX_SHARED_PHOTOS).optional(),
  /** Follow-ups only: the householder's first name or nickname. */
  firstName: z.string().max(40).optional(),
  /** Follow-ups only. */
  topic: z.string().max(80).optional(),
})
export type ShareDetails = z.infer<typeof shareDetailsSchema>

/**
 * Most people a Plan invitation lists as going: the organizer's other buddies,
 * of five at most.
 */
export const MAX_SHARE_GUESTS = 5

/** A guest list's photo: an emoji, or a thumbnail far smaller than a card's. */
export const MAX_GUEST_AVATAR_CHARS = 4_000

/**
 * Someone else going to a buddy's Plan, as its organizer lists them for each
 * person going: `t` (`guestTag`), the name they share (never the organizer's
 * nickname for them), and their photo or emoji when they let it show.
 */
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

/** `plan.invite` / `plan.update` / `followup.invite` / `followup.update`. */
export const shareInviteSchema = z.object({
  v: z.literal(1),
  id: relayId,
  /** The sender's clock at send time; newer wins. */
  rev: z.number(),
  type: z.enum(SHARE_TYPES),
  /** A day after it happens: when builds that don't read `keepUntil` wipe it. */
  expiresAt: z.number(),
  /**
   * Plans: when both phones wipe it, a month after it ends, so buddies can look
   * back at it. Missing means `expiresAt`.
   */
  keepUntil: z.number().optional(),
  details: shareDetailsSchema,
  /**
   * Plans, to someone going only: the others going who said they'd be listed.
   * One this build can't read leaves the invitation, not the list.
   */
  people: z
    .array(shareGuestSchema)
    .min(1)
    .max(MAX_SHARE_GUESTS)
    .optional()
    .catch(undefined),
  /** How many more are going, unnamed: their app predates the list. */
  more: z
    .number()
    .int()
    .min(1)
    .max(MAX_SHARE_GUESTS)
    .optional()
    .catch(undefined),
})
export type ShareInvite = z.infer<typeof shareInviteSchema>

/** `plan.cancel` / `followup.cancel`. */
export const shareCancelSchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  /**
   * The buddy was taken off a share that still goes ahead, rather than the
   * share being deleted. Quiet unless they had said they're going.
   */
  removed: z.literal(true).optional(),
})
export type ShareCancel = z.infer<typeof shareCancelSchema>

export const SHARE_REPLIES = ['going', 'declined'] as const
export type ShareReply = (typeof SHARE_REPLIES)[number]

/** `share.reply` (invited buddy → sender). */
export const shareReplySchema = z.object({
  v: z.literal(1),
  id: relayId,
  rev: z.number(),
  status: z.enum(SHARE_REPLIES),
  /**
   * With "going": the replier's app tells them others going see their name, so
   * the organizer lists them (by the name on their card).
   */
  listed: z.literal(true).optional().catch(undefined),
  /** With `listed`: their photo or emoji shows too (All Buddies' Photo). */
  photo: z.literal(true).optional().catch(undefined),
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

/** `badge.new`: badges the sender just earned, batched into one event. */
export const badgeNewSchema = z.object({
  v: z.literal(1),
  badges: sharedBadgesSchema,
})

/**
 * `badge.reaction`: the sender's reply to one of the recipient's badges, one of
 * the preset reactions by id. `rev` is the sender's clock when they chose it;
 * the recipient keeps the newest per sender and badge.
 */
export const badgeReactionSchema = z.object({
  v: z.literal(1),
  badge: sharedBadgeSchema,
  e: z.enum(BADGE_REACTION_IDS),
  rev: z.number(),
})
export type BadgeReactionEvent = z.infer<typeof badgeReactionSchema>

const b64uSecret = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
/** An invitation from a buddy: `incomingShareKey`. */
const shareKey = z.string().regex(/^[A-Za-z0-9_-]{22}\|[A-Za-z0-9_-]{22}$/)
/** A queue entry: its event's id, or `pending|` and a `shareKey`. */
const notificationId = z
  .string()
  .regex(/^(pending\|[A-Za-z0-9_-]{22}\|)?[A-Za-z0-9_-]{22}$/)

/**
 * A record keeping only the entries `key` and `value` accept, so an entry a
 * newer build writes differently is dropped instead of costing the whole
 * roster. Absent reads as empty.
 */
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

/**
 * A buddy's own settings in the roster, each one dropped alone when it doesn't
 * parse (a value from a newer app, say) so it follows All Buddies.
 */
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
        /**
         * Whether this buddy shows on the calendar, All Buddies' choice or
         * their own: what older builds read and write. Newer ones read
         * `overrides`.
         */
        showOnCalendar: z.boolean(),
        /**
         * This buddy's own settings; a key left out follows All Buddies. Absent
         * from older builds' rosters (see `rosterOverrides`).
         */
        overrides: buddyOverridesSchema.optional(),
        expiresAt: z.number().optional(),
        /**
         * When the nickname, color, or `overrides` last changed; the later one
         * wins. Absent from older builds' rosters, which then never override a
         * device's own choices.
         */
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
  /** Ended pairings: buddy inboxId → `removedAt` (see `RemovedBuddies`). */
  removedBuddies: z.record(relayId, z.number()).default({}),
  sharing: z
    .object({
      photo: z.boolean(),
      tenure: z.boolean(),
      // Rosters written before streaks existed.
      streak: z.boolean().default(true),
      updatedAt: z.number(),
      /**
       * Absent from rosters written before badges, or by an older app; the
       * merge then keeps this device's choice (`mergeSharing`).
       */
      badges: z.boolean().optional(),
      /** When `badges` last changed; merged apart from `updatedAt`. */
      badgesUpdatedAt: z.number().optional(),
      /**
       * The Pet Companion on Buddy Cards. Absent from rosters written before
       * pets, or by an older app; merged like `badges`, on its own stamp.
       */
      pet: z.boolean().optional().catch(undefined),
      /** When `pet` last changed. */
      petUpdatedAt: z.number().optional().catch(undefined),
      /**
       * Added after badges, the same way: absent from older apps' rosters,
       * whose merge keeps this device's choices (`mergeSharing`).
       */
      planTimes: z.enum(BUDDY_PLAN_TIMES).optional().catch(undefined),
      pausedUntil: z.number().nonnegative().optional(),
      /** Absent from older apps' rosters too: Plans go to every buddy. */
      plans: z.boolean().optional(),
      /** When `plans`, `planTimes`, or `pausedUntil` last changed. */
      plansUpdatedAt: z.number().optional(),
      /** New buddies show on the calendar. Absent from older apps' rosters. */
      showOnCalendar: z.boolean().optional(),
      /** When `showOnCalendar` last changed. */
      calendarUpdatedAt: z.number().optional(),
      /**
       * Buddies' pets visit the User's pet. Absent from older apps' rosters;
       * merged like `pet`, on its own stamp.
       */
      petVisits: z.boolean().optional().catch(undefined),
      /** When `petVisits` last changed. */
      petVisitsUpdatedAt: z.number().optional().catch(undefined),
    })
    .default({ photo: true, tenure: true, streak: true, updatedAt: 0 }),
  /**
   * This User's answers to invitations, by `from|shareId` (see `AnswerMark`),
   * so every device shows the same one. Absent from older builds' rosters.
   */
  answers: lenientRecord(
    shareKey,
    z.object({
      s: z.enum([...SHARE_REPLIES, 'none']),
      v: z.number(),
      r: z.number(),
      x: z.number(),
    })
  ),
  /** Queue entries read on any device: entry id → when the mark lapses. */
  read: lenientRecord(notificationId, z.number()),
  /** Queue entries dismissed on any device, the same way. */
  dismissed: lenientRecord(notificationId, z.number()),
  /**
   * The name every device puts on this User's Buddy Card, and when it last
   * changed (0: never changed on a device running Buddies). Absent from older
   * builds' rosters.
   */
  card: z
    .object({ name: z.string().max(120), updatedAt: z.number() })
    .optional()
    .catch(undefined),
  /**
   * Invites to former buddies after an account key change, by inviteId: a claim
   * from that buddy (`inboxId` and `dhPub`) is confirmed without asking. Absent
   * from older builds' rosters.
   */
  reconnects: lenientRecord(
    relayId,
    z.object({ inboxId: relayId, dhPub: b64uKey, expiresAt: z.number() })
  ),
})
export type Roster = z.infer<typeof rosterSchema>
