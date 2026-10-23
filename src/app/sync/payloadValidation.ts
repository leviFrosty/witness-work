import { z } from 'zod'
import { publishers } from '@/constants/publisher'
import { PET_SPECIES_IDS } from '@/types/pet'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'
import {
  bibleStudyFlagSchema,
  dateStringSchema as date,
  recordIdSchema as id,
  timestampSchema as timestamp,
} from '@/lib/recordValidation'

/** Local calendar day, `YYYY-MM-DD`. */
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const record = z
  .object({
    id,
    updatedAt: timestamp.optional(),
    legacyIds: z.array(id).optional(),
  })
  .passthrough()
const avatar = z.object({
  type: z.enum(['image', 'emoji', 'none']),
  value: z.string(),
  revision: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
})
const contact = record.extend({
  name: z.string(),
  createdAt: date.optional(),
  phone: z.string().optional(),
  phoneRegionCode: z.string().optional(),
  email: z.string().optional(),
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  consentGivenAt: date.optional(),
  redacted: z.boolean().optional(),
  readdedAt: timestamp.optional(),
  detailsRetainUntil: timestamp.optional(),
  isFavorite: z.boolean().optional(),
  userDraggedCoordinate: z.boolean().optional(),
  avatarBackground: z.string().nullable().optional(),
  heroBackground: z.string().nullable().optional(),
  avatar: avatar.optional(),
  customFields: z.record(z.string()).optional(),
  address: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  coordinate: z
    .object({ latitude: z.number().finite(), longitude: z.number().finite() })
    .optional(),
  dismissedUntil: date.optional(),
  dismissedNotificationId: z.string().optional(),
  avatarMeta: z
    .object({
      width: z.number().finite(),
      height: z.number().finite(),
      fileSize: z.number().finite().optional(),
      capturedAt: date.optional(),
      croppedAt: date.optional(),
    })
    .optional(),
})
const notification = z.object({ id: z.string(), date })
const visit = record.extend({
  contact: z.object({ id }),
  date,
  isBibleStudy: bibleStudyFlagSchema,
  note: z.string().optional(),
  notAtHome: z.boolean().optional(),
  receivedAt: timestamp.optional(),
  customFields: z.record(z.string()).optional(),
  followUp: z
    .object({
      date,
      notifyMe: z.boolean(),
      topic: z.string().optional(),
      dismissed: z.boolean().optional(),
      notifications: z.array(notification).optional(),
      reminderOffsetMinutes: z.number().finite().nonnegative().optional(),
      buddies: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
})
const timeEntry = record.extend({
  date,
  hours: z.number().finite(),
  minutes: z.number().finite(),
  categoryId: id.optional(),
  tag: z.string().optional(),
  credit: z.boolean().optional(),
  rollover: z.boolean().optional(),
  rolloverGroupId: id.optional(),
  note: z.string().optional(),
  ldc: z.boolean().optional(),
})
const location = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
})
const plan = record.extend({
  date,
  minutes: z.number().finite(),
  categoryId: id.optional(),
  startTimeInMinutes: z.number().finite().optional(),
  anytime: z.boolean().optional(),
  notifyMe: z.boolean().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  buddies: z.array(z.string()).optional(),
  buddyShare: z.object({ from: z.string(), shareId: z.string() }).optional(),
  location: location.optional(),
  source: z.enum(['manual', 'recommendation']).optional(),
  notifications: z.array(notification).optional(),
  reminderOffsetMinutes: z.number().finite().nonnegative().optional(),
})
const recurring = record.extend({
  startDate: date,
  minutes: z.number().finite(),
  categoryId: id.optional(),
  note: z.string().optional(),
  title: z.string().optional(),
  location: location.optional(),
  startTimeInMinutes: z.number().finite().optional(),
  anytime: z.boolean().optional(),
  notifyMe: z.boolean().optional(),
  reminderOffsetMinutes: z.number().finite().nonnegative().optional(),
  recurrence: z.object({
    frequency: z.number().int().min(0).max(3),
    interval: z.number().int().positive(),
    endDate: date.nullable(),
    monthlyByWeekdayConfig: z
      .object({
        weekday: z.number().int().min(0).max(6),
        weekOfMonth: z.number().int(),
      })
      .optional(),
  }),
  deletedDates: z.array(date).optional(),
  overrides: z
    .array(
      z
        .object({
          date,
          minutes: z.number().finite(),
          note: z.string().optional(),
          startTimeInMinutes: z.number().finite().optional(),
          anytime: z.boolean().optional(),
        })
        .passthrough()
    )
    .optional(),
})
const tombstone = z.object({
  id,
  deletedAt: timestamp,
  legacyIds: z.array(id).optional(),
  importUndone: z.literal(true).optional(),
})
const customFieldDef = record.extend({
  label: z.string(),
  order: z.number().finite(),
  createdAt: timestamp,
  archived: z.boolean().optional(),
  type: z.enum(['text', 'number', 'date', 'url']).optional(),
})
const category = record.extend({
  name: z.string(),
  isCredit: z.boolean(),
  builtin: z.boolean().optional(),
})
const vehicle = record.extend({
  name: z.string(),
  archived: z.boolean().optional(),
  createdAt: timestamp,
})
const fuel = record.extend({ name: z.string(), createdAt: timestamp })
const fuelPrice = record.extend({
  fuelId: id,
  effectiveFrom: dateKey,
  pricePerGallon: z.number().finite().nonnegative(),
})
const vehicleSetup = record.extend({
  vehicleId: id,
  effectiveFrom: dateKey,
  fuelId: id.optional(),
  milesPerGallon: z.number().finite().positive().optional(),
})
const trip = record.extend({
  vehicleId: id,
  date: dateKey,
  distanceMiles: z.number().finite().nonnegative(),
  roundTrip: z.boolean().optional(),
  odometerStartMiles: z.number().finite().nonnegative().optional(),
  odometerEndMiles: z.number().finite().nonnegative().optional(),
  note: z.string().optional(),
  createdAt: timestamp,
})
// Cosmetic choices (coat, room options, gift kinds) read as strings, so an
// option from a newer build keeps the record; the pet feature falls back to a
// default for anything it doesn't know.
const pet = record.extend({
  species: z.enum(PET_SPECIES_IDS),
  coat: z.string(),
  name: z.string().optional(),
  adoptedOn: dateKey,
  wakes: z.array(dateKey),
  keepsakes: z.array(z.object({ kind: z.string(), on: dateKey })),
  // Absent on pets adopted before gift seeds (`petGiftSeed` falls back).
  seed: z.string().min(1).max(64).optional(),
  // Room item ids, kept even when this build doesn't know them.
  earnedRoomItems: z.array(z.string()).optional(),
  updatedAt: timestamp,
})
const petRoom = record.extend({
  window: z.object({ time: z.string(), season: z.string() }),
  wallColor: z.string(),
  wallPattern: z.string(),
  floor: z.string(),
  bed: z.string(),
  shelf: z.string(),
  lamp: z.string(),
  sign: z.string(),
  // Absent on rooms from before hats.
  hat: z.string().optional(),
  updatedAt: timestamp,
})
const values = z.object({
  values: z.record(z.unknown()),
  updatedAt: z.record(timestamp).optional().default({}),
})

export const payloadSchema = z.object({
  calibratedClock: z.boolean().optional(),
  version: z.number().int().positive(),
  writtenAt: timestamp,
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  // Absent from payloads written before reset generations existed.
  resetEpoch: z
    .object({
      id,
      at: timestamp,
      deviceId: z.string().min(1),
      deviceName: z.string().optional(),
    })
    .optional(),
  contactStore: z.object({
    contacts: z.array(contact),
    deletedContacts: z.array(contact),
    customFieldDefs: z.array(customFieldDef).optional(),
    deletedCustomFieldDefs: z.array(tombstone).optional(),
  }),
  conversationStore: z.object({
    conversations: z.array(visit),
    deletedConversations: z.array(tombstone).optional(),
    conversationFieldDefs: z.array(customFieldDef).optional(),
    deletedConversationFieldDefs: z.array(tombstone).optional(),
    explicitFollowUps: z.boolean().optional(),
  }),
  serviceReportStore: z.object({
    serviceReports: z.record(z.record(z.array(timeEntry))),
    dayPlans: z.array(plan),
    recurringPlans: z.array(recurring),
    deletedServiceReports: z.array(tombstone).optional(),
    // Absent from payloads written before Plan deletions synced.
    deletedDayPlans: z.array(tombstone).optional(),
    deletedRecurringPlans: z.array(tombstone).optional(),
    additivePlans: z.boolean().optional(),
  }),
  categoryStore: z
    .object({
      categories: z.array(category),
      deletedCategories: z.array(tombstone).optional(),
    })
    .optional(),
  mileageStore: z
    .object({
      vehicles: z.array(vehicle),
      fuels: z.array(fuel),
      fuelPrices: z.array(fuelPrice),
      vehicleSetups: z.array(vehicleSetup),
      trips: z.array(trip),
      deletedMileageRecords: z.array(tombstone).optional(),
    })
    .optional(),
  petStore: z
    .object({
      pets: z.array(pet),
      petRooms: z.array(petRoom),
      deletedPetRecords: z.array(tombstone).optional(),
    })
    .optional(),
  preferencesStore: values,
  profileStore: values.optional(),
})

/** Every record list in a payload, by store, with the shape of one entry. */
const recordLists: Record<string, Record<string, z.ZodTypeAny>> = {
  contactStore: {
    contacts: contact,
    deletedContacts: contact,
    customFieldDefs: customFieldDef,
    deletedCustomFieldDefs: tombstone,
  },
  conversationStore: {
    conversations: visit,
    deletedConversations: tombstone,
    conversationFieldDefs: customFieldDef,
    deletedConversationFieldDefs: tombstone,
  },
  serviceReportStore: {
    dayPlans: plan,
    recurringPlans: recurring,
    deletedServiceReports: tombstone,
    deletedDayPlans: tombstone,
    deletedRecurringPlans: tombstone,
  },
  categoryStore: { categories: category, deletedCategories: tombstone },
  mileageStore: {
    vehicles: vehicle,
    fuels: fuel,
    fuelPrices: fuelPrice,
    vehicleSetups: vehicleSetup,
    trips: trip,
    deletedMileageRecords: tombstone,
  },
  petStore: { pets: pet, petRooms: petRoom, deletedPetRecords: tombstone },
}

const isMap = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * Removes the `null` at `path` inside `root` when it sits in an object, which
 * reads the same as an absent optional field.
 */
function removeNull(root: unknown, path: (string | number)[]): boolean {
  let parent = root
  for (const key of path.slice(0, -1)) {
    if (!parent || typeof parent !== 'object') return false
    parent = (parent as Record<string | number, unknown>)[key]
  }
  const key = path.at(-1)
  if (!isMap(parent) || key === undefined || parent[key] !== null) return false
  delete parent[key]
  return true
}

/**
 * Whether `entry` reads as `schema`, after dropping `null`s from optional
 * fields. Returns the remaining problems as `path.field:code`, without values.
 */
function entryProblems(
  entry: unknown,
  schema: z.ZodTypeAny,
  path: string
): string[] {
  for (;;) {
    const result = schema.safeParse(entry)
    if (result.success) return []
    const { issues } = result.error
    if (!issues.filter((issue) => removeNull(entry, issue.path)).length)
      return issues.map((issue) => {
        const fields = issue.path.filter((key) => typeof key === 'string')
        return `${[path, ...fields].join('.')}:${issue.code}`
      })
  }
}

function readableEntries(
  list: unknown[],
  schema: z.ZodTypeAny,
  path: string,
  dropped: string[]
): unknown[] {
  return list.filter((entry) => {
    const problems = entryProblems(entry, schema, path)
    for (const problem of problems)
      if (!dropped.includes(problem)) dropped.push(problem)
    return problems.length === 0
  })
}

/**
 * Drops the records and setting stamps a payload carries that this build can't
 * read, so one bad record can't hide the rest of a device's data. Merges are by
 * id, so a dropped record only stays on the device that wrote it. Leaves
 * anything that isn't a list for `payloadSchema` to reject. Returns each
 * dropped field as `store.list.field:code`, without values.
 */
export function dropUnreadableRecords(payload: unknown): string[] {
  const dropped: string[] = []
  if (!isMap(payload)) return dropped
  for (const [storeKey, lists] of Object.entries(recordLists)) {
    const store = payload[storeKey]
    if (!isMap(store)) continue
    for (const [listKey, schema] of Object.entries(lists)) {
      const list = store[listKey]
      if (Array.isArray(list))
        store[listKey] = readableEntries(
          list,
          schema,
          `${storeKey}.${listKey}`,
          dropped
        )
    }
  }
  for (const storeKey of ['preferencesStore', 'profileStore']) {
    const store = payload[storeKey]
    const stamps = isMap(store) ? store.updatedAt : undefined
    if (!isMap(stamps)) continue
    for (const [key, stamp] of Object.entries(stamps))
      if (!timestamp.safeParse(stamp).success) {
        delete stamps[key]
        dropped.push(`${storeKey}.updatedAt.${key}`)
      }
  }
  const reports = isMap(payload.serviceReportStore)
    ? payload.serviceReportStore.serviceReports
    : undefined
  if (isMap(reports))
    for (const months of Object.values(reports)) {
      if (!isMap(months)) continue
      for (const [month, list] of Object.entries(months))
        if (Array.isArray(list))
          months[month] = readableEntries(
            list,
            timeEntry,
            'serviceReportStore.serviceReports',
            dropped
          )
    }
  return dropped
}

/**
 * How many records the lists `dropUnreadableRecords` checks hold, so a caller
 * can count what parsing dropped.
 */
export function countRecords(payload: unknown): number {
  if (!isMap(payload)) return 0
  let count = 0
  for (const [storeKey, lists] of Object.entries(recordLists)) {
    const store = payload[storeKey]
    if (!isMap(store)) continue
    for (const listKey of Object.keys(lists)) {
      const list = store[listKey]
      if (Array.isArray(list)) count += list.length
    }
  }
  const reports = isMap(payload.serviceReportStore)
    ? payload.serviceReportStore.serviceReports
    : undefined
  if (isMap(reports))
    for (const months of Object.values(reports)) {
      if (!isMap(months)) continue
      for (const list of Object.values(months))
        if (Array.isArray(list)) count += list.length
    }
  return count
}

/**
 * Deletes `key` from a synced values slice with its stamp and per-entry stamps,
 * so the merge keeps the local value.
 */
function dropValue(
  store: { values: Record<string, unknown>; updatedAt: Record<string, number> },
  key: string
): void {
  delete store.values[key]
  for (const stamp of Object.keys(store.updatedAt))
    if (stamp === key || stamp.startsWith(entryTimestampKey(key, '')))
      delete store.updatedAt[stamp]
}

const publisher = z.enum(publishers)
const offset = z.object({
  amount: z.number().finite().nonnegative().optional(),
  unit: z
    .enum(['minutes', 'hours', 'days', 'weeks', 'months', 'years'])
    .optional(),
})

const textFilter = z.object({
  kind: z.enum(['city', 'state', 'zip', 'name', 'phone', 'email']),
  op: z.enum(['equals', 'contains', 'startsWith', 'isSet', 'notSet']),
  value: z.string(),
})
const filter = z.union([
  textFilter,
  z.object({
    kind: z.literal('customField'),
    defId: id,
    op: z.enum([
      'equals',
      'contains',
      'startsWith',
      'isSet',
      'notSet',
      'gt',
      'lt',
    ]),
    value: z.string(),
  }),
  z.object({ kind: z.literal('pinStaleness'), value: z.string() }),
  z.object({
    kind: z.enum([
      'isFavorite',
      'hasStudy',
      'isActiveStudy',
      'hasFollowUp',
      'noFollowUp',
      'followUpOverdue',
    ]),
  }),
])

const savedContactView = z.object({
  name: z.string(),
  order: z.number().finite(),
  createdAt: timestamp,
  filters: z.array(filter),
  sort: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
})

const preferenceShapes = z
  .object({
    contactsFilters: z.array(filter).optional(),
    savedContactViews: z.record(id, savedContactView).optional(),
    assistantHistory: z
      .array(
        z.object({
          shape: z.enum(['concentrated', 'distributed', 'recurring']),
          action: z.enum(['accepted', 'dismissed']),
          at: timestamp,
        })
      )
      .optional(),
    dismissedFollowUpCards: z
      .object({
        missed: z.array(z.string()).optional(),
        approaching: z.array(z.string()).optional(),
      })
      .optional(),
    colorScheme: z.enum(['light', 'dark']).optional(),
    locale: z.string().optional(),
    formatRegion: z.string().optional(),
    startOfWeek: z.number().int().min(0).max(6).optional(),
    timeFormat: z.string().optional(),
    dateOrder: z.string().optional(),
    mapKeyColors: z.record(z.string()).optional(),
    mapCardDetail: z.string().optional(),
    hasDismissedRecommendationHash: z.string().optional(),
    monthlyGoalOverrides: z
      .record(z.number().finite().nonnegative())
      .optional(),
    reportCommentOverrides: z.record(z.string()).optional(),
    publisherHours: z.record(z.number().finite().nonnegative()).optional(),
    roleHistory: z
      .object({ initial: publisher, changes: z.record(publisher) })
      .nullable()
      .optional(),
    role: publisher.optional(),
    tenureStartDate: date.nullable().optional(),
    returnVisitTimeOffset: offset.nullable().optional(),
    returnVisitNotificationOffset: offset.nullable().optional(),
    planNotificationOffset: offset.nullable().optional(),
    unloggedDayReminderTime: z.number().int().min(0).max(1439).optional(),
    unloggedDayRemindersEnabledAt: timestamp.nullable().optional(),
    monthReportReminderTime: z.number().int().min(0).max(1439).optional(),
    weekPlanReminderDay: z.number().int().min(0).max(6).optional(),
    weekPlanReminderTime: z.number().int().min(0).max(1439).optional(),
    weekPlanReminderEnabledAt: timestamp.nullable().optional(),
    serviceYearCatchUpStatus: z
      .enum(['pending', 'skipped', 'completed', 'dismissed'])
      .nullable()
      .optional(),
    supporterNudgeDismissedAt: timestamp.nullable().optional(),
    supporterNudgeAvailableSince: timestamp.nullable().optional(),
    supporterPauseStartedAt: timestamp.nullable().optional(),
    supporterPauseResumesAt: timestamp.nullable().optional(),
    milestoneOverrides: z
      .array(z.number().finite().nonnegative())
      .nullable()
      .optional(),
    defaultPhoneRegionCode: z.string().nullable().optional(),
    customAppIcon: z.string().nullable().optional(),
    lastRolloverYearMonth: z.string().nullable().optional(),
    offDays: z.array(z.number().int().min(0).max(6)).optional(),
    meetingDays: z.array(z.number().int().min(0).max(6)).optional(),
    homeChecklistManualCompletions: z.array(z.string()).optional(),
    homeChecklistAllDoneCelebrated: z.boolean().optional(),
    celebratedTiers: z.record(z.array(z.string())).optional(),
    celebratedMilestones: z
      .record(z.array(z.number().finite().nonnegative()))
      .optional(),
    contactInformationOrder: z.array(z.string()).optional(),
    annualGoalHours: z.number().finite().nonnegative().nullable().optional(),
    customAccentColor: z.string().nullable().optional(),
    customAvatarBackground: z.string().nullable().optional(),
    seenTipIds: z.array(z.string()).optional(),
    scheduleIntroCoveredPages: z.array(z.string()).optional(),
    submittedReportMonths: z.array(z.string()).optional(),
    earnedBadges: z
      .record(
        z.object({
          at: timestamp,
          month: z.string().optional(),
          history: z.boolean().optional(),
        })
      )
      .optional(),
    badgeLedger: z.array(z.string()).optional(),
    showBadges: z.boolean().optional(),
    showStreaks: z.boolean().optional(),
    mileageTrackingEnabled: z.boolean().optional(),
    distanceUnit: z.enum(['mi', 'km']).optional(),
    fuelEconomyUnit: z
      .enum(['mpgUS', 'mpgUK', 'lPer100km', 'kmPerL'])
      .optional(),
    mileageEntryMode: z.enum(['distance', 'odometer']).optional(),
    petPromptDismissed: z.boolean().optional(),
  })
  .passthrough()

/**
 * Drops Saved Views this build can't read (e.g. one using a filter from a later
 * version) along with their stamps, so the merge leaves the local copy alone
 * rather than rejecting the whole payload or treating them as deleted.
 */
export function dropUnreadableSavedViews(store: {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
}): void {
  const views = store.values.savedContactViews
  if (!views || typeof views !== 'object' || Array.isArray(views)) return
  const readable: Record<string, unknown> = {}
  for (const [viewId, view] of Object.entries(views)) {
    if (
      id.safeParse(viewId).success &&
      savedContactView.safeParse(view).success
    )
      readable[viewId] = view
    else delete store.updatedAt[entryTimestampKey('savedContactViews', viewId)]
  }
  store.values.savedContactViews = readable
}

/** Whether `value` fits the type of the setting's default. */
function fitsDefault(key: string, value: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return true
  if (expected instanceof Date)
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
  if (key === 'userSpecifiedHasAnnualGoal')
    return typeof value === 'boolean' || value === 'default'
  if (Array.isArray(expected)) return Array.isArray(value)
  if (typeof expected === 'number')
    return typeof value === 'number' && Number.isFinite(value)
  return (
    typeof value === typeof expected &&
    (typeof expected !== 'object' || (value !== null && !Array.isArray(value)))
  )
}

/**
 * Drops settings with a bad type, with their stamps, so the merge keeps the
 * local value; future unknown keys stay unused. Returns the dropped keys.
 */
export function dropUnreadableSettings(
  store: { values: Record<string, unknown>; updatedAt: Record<string, number> },
  defaults: Record<string, unknown>
): string[] {
  const shapes: Record<string, z.ZodTypeAny> = preferenceShapes.shape
  return Object.entries(store.values)
    .filter(
      ([key, value]) =>
        (Object.hasOwn(shapes, key) && !shapes[key].safeParse(value).success) ||
        (Object.hasOwn(defaults, key) &&
          !fitsDefault(key, value, defaults[key]))
    )
    .map(([key]) => {
      dropValue(store, key)
      return key
    })
}

const profileShapes: Record<string, z.ZodTypeAny> = {
  name: z.string().optional(),
  avatar: avatar.optional(),
  customAvatarBackground: z.string().nullable().optional(),
  hasCompletedProfileSetup: z.boolean().optional(),
}

/** Drops profile values with a bad shape, with their stamps. */
export function dropUnreadableProfileValues(store: {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
}): string[] {
  return Object.entries(store.values)
    .filter(
      ([key, value]) =>
        Object.hasOwn(profileShapes, key) &&
        !profileShapes[key].safeParse(value).success
    )
    .map(([key]) => {
      dropValue(store, key)
      return key
    })
}
