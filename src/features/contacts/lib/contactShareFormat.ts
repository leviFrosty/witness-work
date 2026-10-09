import { z } from 'zod'
import type { Address, Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { CustomFieldDefinition } from '@/types/customField'
import {
  dateStringSchema,
  hasUnsafeKeys,
  recordIdSchema,
  timestampSchema,
} from '@/lib/recordValidation'
import { withoutRichTextImages } from '@/lib/richText/inspect'
import { parseRichText } from '@/lib/richText/parse'

/**
 * The shared-contact format: what a contact share carries, whether it travels
 * as a universal link (`contactShareLink.ts`) or a `.witnesswork` file
 * (`useShareContact.ts`), and what an import accepts from either.
 *
 * Each record type has one field table below. The sender strips records with it
 * and the receiver validates against a schema built from it, so what's sent and
 * what's accepted can't drift. Typing each table as `Record<keyof T, …>` forces
 * a decision for every field: adding a field to `Contact` / `Visit` / `Address`
 * / `FollowUp` / `CustomFieldDefinition` without listing it here is a type
 * error.
 */

export type ContactImportData = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Visit[]
  /**
   * Custom field definitions referenced by `contact.customFields`. Embedded so
   * the recipient can render the values with their original labels — without
   * this, the recipient would see UUID keys for fields they don't already have.
   * Recipients merge by id: existing local defs win on label conflicts; unknown
   * ids are added as fresh defs. See `mergeIncomingCustomFieldDefs` in
   * `contactsStore`.
   */
  customFieldDefs?: CustomFieldDefinition[]
}

/**
 * Limits on what an import accepts. They exist to refuse crafted input, never
 * to trim real data, so each is sized from the largest realistic legitimate
 * share with at least 10× headroom.
 *
 * The largest realistic shares, measured with the builders here:
 *
 * - A link is capped by its sender at 4,000 characters
 *   (`CONTACT_SHARE_LINK.MAX_URL_BYTES`, unchanged since links shipped) and 50
 *   visits. Prose notes compress about 4× and templated notes ("Not at home")
 *   about 17×, so a full link inflates to 11–20 KB of JSON.
 * - A file has no URL cap. A decade of weekly Bible study visits (520) with
 *   2,000-character notes and 200-character topics, a full address and 20
 *   custom fields of 300 characters is about 1.4 MB of pretty-printed JSON.
 */
export const CONTACT_SHARE_LIMITS = {
  /** Base64url characters in a link payload: 16× the 4,000-character link. */
  MAX_LINK_PAYLOAD_CHARS: 64 * 1024,
  /**
   * Bytes a link payload may inflate to: about 50× the 20 KB link. Inflation
   * stops as soon as it passes this, so a crafted payload can't make the app
   * allocate more.
   */
  MAX_LINK_JSON_BYTES: 1024 * 1024,
  /** Bytes read from a `.witnesswork` file: about 11× the 1.4 MB file. */
  MAX_FILE_BYTES: 16 * 1024 * 1024,
  /** Visits in one share: about 20× the 520-visit decade. */
  MAX_VISITS: 10_000,
  /** A note, topic or custom field value: 50× a 2,000-character note. */
  MAX_TEXT_CHARS: 100_000,
  /**
   * A name, phone, email, address line or field label: 10× the longest real
   * values, which stay under 100 characters.
   */
  MAX_SHORT_TEXT_CHARS: 1_000,
  /** Custom field values or definitions: people keep a few dozen at most. */
  MAX_CUSTOM_FIELDS: 500,
  /** Reminder entries on one follow-up: the app writes one. */
  MAX_NOTIFICATIONS: 50,
  /** Ids are 36-character UUIDs or shorter importer ids. */
  MAX_ID_CHARS: 200,
  /** ISO 8601 timestamps are 24 characters. */
  MAX_DATE_CHARS: 64,
} as const

const LIMITS = CONTACT_SHARE_LIMITS

// --- Field tables -----------------------------------------------------------

/**
 * `always`: the format requires the field. `optional`: sent only when
 * non-empty. `omit`: device-local or the sender's own; it never leaves the
 * device and an import never accepts it.
 */
type FieldRule =
  | { share: 'always' | 'optional'; schema: z.ZodTypeAny }
  | { share: 'omit' }

type FieldRules<T> = Record<keyof T, FieldRule>

const always = (schema: z.ZodTypeAny): FieldRule => ({
  share: 'always',
  schema,
})
const optional = (schema: z.ZodTypeAny): FieldRule => ({
  share: 'optional',
  schema,
})
const omit: FieldRule = { share: 'omit' }

const id = z.string().max(LIMITS.MAX_ID_CHARS).pipe(recordIdSchema)
const date = z.string().max(LIMITS.MAX_DATE_CHARS).pipe(dateStringSchema)
const shortText = z.string().max(LIMITS.MAX_SHORT_TEXT_CHARS)
const text = z.string().max(LIMITS.MAX_TEXT_CHARS)
/**
 * A note's formatting. Photos never travel (the files are the sender's), and
 * formatting that doesn't read is dropped rather than failing the share: the
 * plain-text `note` beside it still imports.
 */
const richNote = z.unknown().transform((value) => {
  const rich = parseRichText(value)
  return rich ? { ...rich, doc: withoutRichTextImages(rich.doc) } : undefined
})

/** Builds the strict import schema for a field table; unknown keys drop. */
function schemaFor<T>(rules: FieldRules<T>) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, rule] of Object.entries<FieldRule>(rules)) {
    if (rule.share === 'omit') continue
    shape[key] = rule.share === 'always' ? rule.schema : rule.schema.optional()
  }
  return z.object(shape).strip()
}

const ADDRESS_FIELDS: FieldRules<Address> = {
  line1: optional(shortText),
  line2: optional(shortText),
  city: optional(shortText),
  state: optional(shortText),
  zip: optional(shortText),
  country: optional(shortText),
}

/**
 * Keyed by `CustomFieldDefinition.id`; files from before field ids were keyed
 * by label.
 */
const customFieldValues = z
  .record(shortText.min(1), text)
  .refine((fields) => Object.keys(fields).length <= LIMITS.MAX_CUSTOM_FIELDS)

const CONTACT_FIELDS: FieldRules<Contact> = {
  id: always(id),
  name: always(z.string().min(1).max(LIMITS.MAX_SHORT_TEXT_CHARS)),
  createdAt: always(date),
  phone: optional(shortText),
  phoneRegionCode: optional(shortText),
  email: optional(shortText),
  gender: optional(z.enum(['male', 'female', 'unknown'])),
  address: optional(schemaFor(ADDRESS_FIELDS)),
  coordinate: optional(
    z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    })
  ),
  customFields: optional(customFieldValues),
  // Device-local state that should not flow between devices:
  // Consent was given to the sharing publisher, not the recipient.
  consentGivenAt: omit,
  // Only ever set on a tombstone, which is never shared.
  redacted: omit,
  detailsRetainUntil: omit,
  userDraggedCoordinate: omit,
  dismissedUntil: omit,
  dismissedNotificationId: omit,
  isFavorite: omit,
  // Sync bookkeeping — only meaningful inside the iCloud sync payload, not in
  // a share intended for another person.
  updatedAt: omit,
  readdedAt: omit,
  // Avatar holds either an emoji or a per-device image URI; the URI would be a
  // dead path on the recipient's device, and one chosen by a crafted import
  // could point at any file in this app's sandbox. The recipient picks their
  // own avatar.
  avatar: omit,
  // Cosmetic, paired with the omitted avatar — the recipient's theme decides.
  avatarBackground: omit,
  // Cosmetic chrome for the recipient's Contact Details screen — let their
  // own theme/accent decide rather than imposing the sender's choice.
  heroBackground: omit,
  // Capture-time / file-size / resolution metadata of the avatar image is
  // device-local.
  avatarMeta: omit,
}

type FollowUp = NonNullable<Visit['followUp']>

const FOLLOW_UP_FIELDS: FieldRules<FollowUp> = {
  date: always(date),
  notifyMe: always(z.boolean()),
  topic: optional(text),
  notifications: optional(
    z
      .array(z.object({ id: z.string().max(LIMITS.MAX_ID_CHARS), date }))
      .max(LIMITS.MAX_NOTIFICATIONS)
  ),
  reminderOffsetMinutes: optional(z.number().finite().nonnegative()),
  dismissed: optional(z.boolean()),
  // Buddy inbox ids are this User's own relationships, meaningless elsewhere.
  buddies: omit,
}

const VISIT_FIELDS: FieldRules<Visit> = {
  // A receiver uses the sender's id only to find a copy it already holds; a
  // new visit gets its own id (`planImportedVisits` in `contactImport.ts`).
  id: always(id),
  // Always rewritten to the contact being imported.
  contact: always(z.object({ id })),
  date: always(date),
  isBibleStudy: always(z.boolean()),
  note: optional(text),
  noteDoc: optional(richNote),
  followUp: optional(schemaFor(FOLLOW_UP_FIELDS)),
  notAtHome: optional(z.boolean()),
  // Conversation field definitions aren't shared, so the recipient couldn't
  // label these values.
  customFields: omit,
  updatedAt: omit,
}

const CUSTOM_FIELD_DEF_FIELDS: FieldRules<CustomFieldDefinition> = {
  id: always(id),
  label: always(shortText),
  // Sent as 0: the recipient slots the def at the end of their own list.
  order: always(z.number().finite()),
  createdAt: always(timestampSchema),
  // Kept so a later last-writer-wins merge of the same def works.
  updatedAt: optional(timestampSchema),
  type: optional(z.enum(['text', 'number', 'date', 'url'])),
  // Sender-side archive state would only confuse the merge.
  archived: omit,
  legacyIds: omit,
}

// --- Sending ----------------------------------------------------------------

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0
  }
  return false
}

/** Copies only the fields `rules` shares, dropping empty optional ones. */
function pickShared<T extends object>(
  source: T,
  rules: FieldRules<T>
): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const rule = rules[key]
    if (rule.share === 'omit') continue
    const value = source[key]
    if (rule.share === 'optional' && isEmpty(value)) continue
    out[key] = value
  }
  return out
}

/** The contact fields a share carries. Also applied to every import. */
export function sharedContactFields(contact: Contact): Partial<Contact> {
  const shared = pickShared(contact, CONTACT_FIELDS)
  const address = shared.address && pickShared(shared.address, ADDRESS_FIELDS)
  if (address && !isEmpty(address)) shared.address = address
  else delete shared.address
  return shared
}

/**
 * The visit fields a share carries. Also applied to every import. Links leave
 * formatting out (`richNotes: false`) so they fit more visits; the plain-text
 * note still travels.
 */
export function sharedVisitFields(
  visit: Visit,
  { richNotes = true }: { richNotes?: boolean } = {}
): Partial<Visit> {
  const shared = pickShared(visit, VISIT_FIELDS)
  if (shared.followUp) {
    shared.followUp = pickShared(shared.followUp, FOLLOW_UP_FIELDS) as FollowUp
  }
  const rich = richNotes ? parseRichText(shared.noteDoc) : null
  if (rich) shared.noteDoc = { ...rich, doc: withoutRichTextImages(rich.doc) }
  else delete shared.noteDoc
  return shared
}

/**
 * The follow-up fields that never travel (buddies). An import that updates one
 * of this device's visits keeps them.
 */
export function deviceOnlyFollowUpFields(
  followUp: FollowUp | undefined
): Partial<FollowUp> {
  const kept: Record<string, unknown> = {}
  if (!followUp) return kept
  for (const [key, rule] of Object.entries<FieldRule>(FOLLOW_UP_FIELDS)) {
    const value = followUp[key as keyof FollowUp]
    if (rule.share === 'omit' && value !== undefined) kept[key] = value
  }
  return kept
}

/**
 * The definitions `contact.customFields` references, so the recipient can label
 * the values. Unreferenced definitions never travel, and an import never adds
 * one.
 */
export function sharedCustomFieldDefs(
  contact: Partial<Contact>,
  defs: CustomFieldDefinition[]
): CustomFieldDefinition[] {
  const referenced = new Set(Object.keys(contact.customFields ?? {}))
  return defs
    .filter((def) => referenced.has(def.id))
    .map(
      (def) =>
        pickShared(
          { ...def, order: 0 },
          CUSTOM_FIELD_DEF_FIELDS
        ) as CustomFieldDefinition
    )
}

/** Most recent visit first, the order every share uses. */
export function newestFirst(visits: Visit[]): Visit[] {
  return [...visits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

/**
 * The payload for sharing `contact` with `visits`, for both the link and the
 * file. Callers choose and order the visits.
 */
export function buildContactShareData(
  contact: Contact,
  visits: Visit[],
  customFieldDefs: CustomFieldDefinition[] = [],
  now: Date = new Date(),
  options: { richNotes?: boolean } = {}
): ContactImportData {
  const shared = sharedContactFields(contact) as Contact
  const defs = sharedCustomFieldDefs(shared, customFieldDefs)
  return {
    version: '1.0',
    type: 'witnesswork-contact',
    exportedAt: now.toISOString(),
    contact: shared,
    ...(visits.length > 0
      ? {
          conversations: visits.map(
            (v) => sharedVisitFields(v, options) as Visit
          ),
        }
      : {}),
    ...(defs.length > 0 ? { customFieldDefs: defs } : {}),
  }
}

/**
 * The text of a `.witnesswork` file: the link's fields, with every visit up to
 * what an import accepts, since a file has no URL length to fit.
 */
export function buildContactShareFile(
  contact: Contact,
  visits: Visit[],
  customFieldDefs: CustomFieldDefinition[] = [],
  now: Date = new Date()
): string {
  const data = buildContactShareData(
    contact,
    newestFirst(visits).slice(0, LIMITS.MAX_VISITS),
    customFieldDefs,
    now
  )
  return JSON.stringify(data, null, 2)
}

// --- Receiving --------------------------------------------------------------

const shareSchema = z.object({
  type: z.literal('witnesswork-contact'),
  version: z.string().max(LIMITS.MAX_DATE_CHARS).optional(),
  exportedAt: z.string().max(LIMITS.MAX_DATE_CHARS).optional(),
  contact: schemaFor(CONTACT_FIELDS),
  conversations: z
    .array(schemaFor(VISIT_FIELDS))
    .max(LIMITS.MAX_VISITS)
    .optional(),
  customFieldDefs: z
    .array(schemaFor(CUSTOM_FIELD_DEF_FIELDS))
    .max(LIMITS.MAX_CUSTOM_FIELDS)
    .optional(),
})

/**
 * Validates a decoded share from any source. Returns only the fields the tables
 * above share, each with the right type and within `CONTACT_SHARE_LIMITS`, or
 * `null` when anything is malformed. Unknown and omitted fields are dropped, so
 * a share from an older version still imports. Dates stay ISO strings, as they
 * do in the persisted stores.
 */
export function parseContactShareData(
  input: unknown
): ContactImportData | null {
  try {
    if (hasUnsafeKeys(input)) return null
    const result = shareSchema.safeParse(input)
    if (!result.success) return null
    const { contact, conversations, customFieldDefs, exportedAt } = result.data
    const referenced = new Set(
      Object.keys((contact.customFields as Record<string, string>) ?? {})
    )
    const defs = customFieldDefs?.filter((def) => referenced.has(def.id))
    return {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: exportedAt ?? '',
      contact: contact as unknown as Contact,
      ...(conversations?.length
        ? { conversations: conversations as unknown as Visit[] }
        : {}),
      ...(defs?.length
        ? { customFieldDefs: defs as unknown as CustomFieldDefinition[] }
        : {}),
    }
  } catch {
    // Deeply nested input can exhaust the stack; that's malformed too.
    return null
  }
}
