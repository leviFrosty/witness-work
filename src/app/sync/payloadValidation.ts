import { z } from 'zod'
import { publishers } from '@/constants/publisher'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'
import {
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
  isBibleStudy: z.boolean(),
  note: z.string().optional(),
  notAtHome: z.boolean().optional(),
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
        })
        .passthrough()
    )
    .optional(),
})
const tombstone = z.object({
  id,
  deletedAt: timestamp,
  legacyIds: z.array(id).optional(),
})
const customFieldDef = record.extend({
  label: z.string(),
  order: z.number().finite(),
  createdAt: timestamp,
  archived: z.boolean().optional(),
  type: z.enum(['text', 'number', 'date', 'url']).optional(),
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
  }),
  categoryStore: z
    .object({
      categories: z.array(
        record.extend({
          name: z.string(),
          isCredit: z.boolean(),
          builtin: z.boolean().optional(),
        })
      ),
      deletedCategories: z.array(tombstone).optional(),
    })
    .optional(),
  mileageStore: z
    .object({
      vehicles: z.array(
        record.extend({
          name: z.string(),
          archived: z.boolean().optional(),
          createdAt: timestamp,
        })
      ),
      fuels: z.array(record.extend({ name: z.string(), createdAt: timestamp })),
      fuelPrices: z.array(
        record.extend({
          fuelId: id,
          effectiveFrom: dateKey,
          pricePerGallon: z.number().finite().nonnegative(),
        })
      ),
      vehicleSetups: z.array(
        record.extend({
          vehicleId: id,
          effectiveFrom: dateKey,
          fuelId: id.optional(),
          milesPerGallon: z.number().finite().positive().optional(),
        })
      ),
      trips: z.array(
        record.extend({
          vehicleId: id,
          date: dateKey,
          distanceMiles: z.number().finite().nonnegative(),
          roundTrip: z.boolean().optional(),
          odometerStartMiles: z.number().finite().nonnegative().optional(),
          odometerEndMiles: z.number().finite().nonnegative().optional(),
          note: z.string().optional(),
          createdAt: timestamp,
        })
      ),
      deletedMileageRecords: z.array(tombstone).optional(),
    })
    .optional(),
  preferencesStore: values,
  profileStore: values.optional(),
})

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
  z.object({ kind: z.enum(['isFavorite', 'hasStudy', 'isActiveStudy']) }),
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
    contactInformationOrder: z.array(z.string()).optional(),
    annualGoalHours: z.number().finite().nonnegative().nullable().optional(),
    customAccentColor: z.string().nullable().optional(),
    customAvatarBackground: z.string().nullable().optional(),
    seenTipIds: z.array(z.string()).optional(),
    submittedReportMonths: z.array(z.string()).optional(),
    mileageTrackingEnabled: z.boolean().optional(),
    distanceUnit: z.enum(['mi', 'km']).optional(),
    fuelEconomyUnit: z
      .enum(['mpgUS', 'mpgUK', 'lPer100km', 'kmPerL'])
      .optional(),
    mileageEntryMode: z.enum(['distance', 'odometer']).optional(),
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

/** Reject bad types for every known setting; future unknown keys stay unused. */
export function validSettingValues(
  values: Record<string, unknown>,
  defaults: Record<string, unknown>
): boolean {
  if (!preferenceShapes.safeParse(values).success) return false
  return Object.entries(values).every(([key, value]) => {
    if (
      !Object.hasOwn(defaults, key) ||
      defaults[key] === null ||
      defaults[key] === undefined
    )
      return true
    const expected = defaults[key]
    if (expected instanceof Date)
      return typeof value === 'string' && Number.isFinite(Date.parse(value))
    if (key === 'userSpecifiedHasAnnualGoal')
      return typeof value === 'boolean' || value === 'default'
    if (Array.isArray(expected)) return Array.isArray(value)
    if (typeof expected === 'number')
      return typeof value === 'number' && Number.isFinite(value)
    return (
      typeof value === typeof expected &&
      (typeof expected !== 'object' ||
        (value !== null && !Array.isArray(value)))
    )
  })
}

export function validProfileValues(values: Record<string, unknown>): boolean {
  return z
    .object({
      name: z.string().optional(),
      avatar: avatar.optional(),
      customAvatarBackground: z.string().nullable().optional(),
      hasCompletedProfileSetup: z.boolean().optional(),
    })
    .passthrough()
    .safeParse(values).success
}
