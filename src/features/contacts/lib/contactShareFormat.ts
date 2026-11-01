import { z } from 'zod'
import type { Address, Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { CustomFieldDefinition } from '@/types/customField'
import {
  bibleStudyFlagSchema,
  dateStringSchema,
  hasUnsafeKeys,
  recordIdSchema,
  timestampSchema,
} from '@/lib/recordValidation'
import { withoutRichTextImages } from '@/lib/richText/inspect'
import { parseRichText } from '@/lib/richText/parse'

export type ContactImportData = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Visit[]

  customFieldDefs?: CustomFieldDefinition[]
}

export const CONTACT_SHARE_LIMITS = {
  MAX_LINK_PAYLOAD_CHARS: 64 * 1024,

  MAX_LINK_JSON_BYTES: 1024 * 1024,

  MAX_FILE_BYTES: 16 * 1024 * 1024,

  MAX_VISITS: 10_000,

  MAX_TEXT_CHARS: 100_000,

  MAX_SHORT_TEXT_CHARS: 1_000,

  MAX_CUSTOM_FIELDS: 500,

  MAX_NOTIFICATIONS: 50,

  MAX_ID_CHARS: 200,

  MAX_DATE_CHARS: 64,
} as const

const LIMITS = CONTACT_SHARE_LIMITS

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

const richNote = z.unknown().transform((value) => {
  const rich = parseRichText(value)
  return rich ? { ...rich, doc: withoutRichTextImages(rich.doc) } : undefined
})

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

  consentGivenAt: omit,

  redacted: omit,
  detailsRetainUntil: omit,
  userDraggedCoordinate: omit,
  dismissedUntil: omit,
  dismissedNotificationId: omit,
  isFavorite: omit,

  updatedAt: omit,
  readdedAt: omit,

  avatar: omit,

  avatarBackground: omit,

  heroBackground: omit,

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

  buddies: omit,
}

const VISIT_FIELDS: FieldRules<Visit> = {
  id: always(id),

  contact: always(z.object({ id })),
  date: always(date),
  isBibleStudy: always(bibleStudyFlagSchema),
  note: optional(text),
  noteDoc: optional(richNote),
  followUp: optional(schemaFor(FOLLOW_UP_FIELDS)),
  notAtHome: optional(z.boolean()),

  customFields: omit,
  updatedAt: omit,

  receivedAt: omit,
}

const CUSTOM_FIELD_DEF_FIELDS: FieldRules<CustomFieldDefinition> = {
  id: always(id),
  label: always(shortText),

  order: always(z.number().finite()),
  createdAt: always(timestampSchema),

  updatedAt: optional(timestampSchema),
  type: optional(z.enum(['text', 'number', 'date', 'url'])),

  archived: omit,
  legacyIds: omit,
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0
  }
  return false
}

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

export function sharedContactFields(contact: Contact): Partial<Contact> {
  const shared = pickShared(contact, CONTACT_FIELDS)
  const address = shared.address && pickShared(shared.address, ADDRESS_FIELDS)
  if (address && !isEmpty(address)) shared.address = address
  else delete shared.address
  return shared
}

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

export function newestFirst(visits: Visit[]): Visit[] {
  return [...visits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

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
    return null
  }
}
