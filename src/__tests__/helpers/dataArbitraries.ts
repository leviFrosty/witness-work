import fc from 'fast-check'
import { canonicalJson } from '@/lib/canonicalJson'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import {
  keptKeepsakes,
  keptPurchases,
  keptRoomItems,
  keptWakes,
} from '@/lib/petHistory'
import {
  GIFT_KINDS,
  HAT_IDS,
  PET_RECORD_ID,
  PET_ROOM_RECORD_ID,
  PET_SPECIES_IDS,
  UNLOCK_ORDER,
  coatIdsFor,
  type PetRecord,
  type PetRoomRecord,
} from '@/types/pet'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
  type TimeEntriesByYear,
  type TimeEntry,
} from '@/types/timeEntry'
import type { Contact } from '@/types/contact'
import { stripContactForTombstone } from '@/lib/dataProtection'
import type { Visit } from '@/types/visit'
import type { Category } from '@/types/category'
import type { CustomFieldDefinition } from '@/types/customField'
import type {
  Fuel,
  FuelPrice,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'
import type { DeviceState } from '@/__tests__/helpers/syncPeer'
import { normalizeRoleHistory, standingRole } from '@/lib/roleHistory'
import { roleHistoryEntries } from '@/lib/syncPreferencePolicy'

/**
 * Fast-check arbitraries for the persisted stores' records, for the data
 * layer's round-trip and merge properties. Values stay inside what the stores
 * write and the sync schema accepts, and lean on edges: 0 minutes, credit,
 * decimal hours, negative rollover halves, unicode/RTL/emoji text, very long
 * notes, and calendar days on DST changes and month and year boundaries.
 *
 * Ids come from small pools so the same record shows up on several devices,
 * deleted on one and re-added on another. Sync stamps come from a small range
 * so ties happen.
 */

/** Every property's seed: fixed, unless `FC_SEED` reruns a failure. */
export const fcSeed = process.env.FC_SEED
  ? Number(process.env.FC_SEED)
  : 20261022

/** Sync stamps start here; tests pin the clock well after the last one. */
export const STAMP_BASE = Date.UTC(2026, 9, 1, 12)
/** The pinned clock: after every generated stamp, so none is clamped. */
export const PINNED_NOW = STAMP_BASE + 10 * 24 * 60 * 60_000

/** Sync stamps a minute apart, few enough that two records often tie. */
export const stampArb = fc
  .integer({ min: 0, max: 30 })
  .map((n) => STAMP_BASE + n * 60_000)

const idPool = (prefix: string, size = 5) =>
  fc.constantFrom(...Array.from({ length: size }, (_, i) => `${prefix}-${i}`))

/** Days where calendar math tends to break. */
export const EDGE_DAY_KEYS = [
  // US and EU DST changes.
  '2026-03-08',
  '2026-03-29',
  '2026-10-25',
  '2026-11-01',
  // Midnight DST changes (Havana, Santiago).
  '2026-03-08',
  '2026-04-05',
  // Month, service-year and year boundaries, leap day.
  '2025-12-31',
  '2026-01-01',
  '2026-02-28',
  '2024-02-29',
  '2026-08-31',
  '2026-09-01',
  '2026-09-30',
  '2026-10-01',
  '2026-12-31',
  '2027-01-01',
] as const

const pad = (n: number) => String(n).padStart(2, '0')

/** A local calendar day, `YYYY-MM-DD`. */
export const dayKeyArb = fc.oneof(
  fc.constantFrom(...EDGE_DAY_KEYS),
  fc
    .date({
      min: new Date(Date.UTC(2024, 0, 1)),
      max: new Date(Date.UTC(2027, 11, 31)),
      noInvalidDate: true,
    })
    .map(
      (d) =>
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    )
)

/** A stored calendar day: the noon-UTC anchor, as rehydrated state holds it. */
export const storedDayArb = dayKeyArb.map((key) => `${key}T12:00:00.000Z`)

/** Names in many scripts: RTL, combining marks, emoji ZWJ sequences. */
const SAMPLE_TEXT = [
  '',
  'Ana',
  'Zoë Ångström',
  "O'Brien-Núñez",
  'محمد الأحمد',
  'שרה כהן',
  '李小龙',
  'Nguyễn Thị Minh Khai',
  '👨‍👩‍👧‍👦 family',
  '🏳️‍🌈',
  '‮evil‬',
  'tab\tnew\nline',
  '  padded  ',
  'a"b\\c',
  'Ελληνικά',
  'हिन्दी',
] as const

export const textArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...SAMPLE_TEXT) },
  { weight: 2, arbitrary: fc.string({ maxLength: 24 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 12 }) }
)

/** Notes, now and then very long. */
export const noteArb = fc.oneof(
  { weight: 4, arbitrary: textArb },
  {
    weight: 1,
    arbitrary: fc
      .tuple(textArb, fc.integer({ min: 200, max: 600 }))
      .map(([text, times]) => `${text || 'x'} `.repeat(times)),
  }
)

/** Keeps only the defined keys, as JSON would. */
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T

const optional = <T>(arb: fc.Arbitrary<T>, freq = 2) =>
  fc.option(arb, { nil: undefined, freq })

// --- Time Entries -----------------------------------------------------------

export const CATEGORY_IDS = ['cat-0', 'cat-1', 'cat-2', LDC_BUILTIN_CATEGORY_ID]

/** A Time Entry's `{ hours, minutes }`: whole hours, decimals, and 0. */
export const durationArb = fc.oneof(
  fc.record({
    hours: fc.integer({ min: 0, max: 12 }),
    minutes: fc.integer({ min: 0, max: 59 }),
  }),
  fc.record({
    hours: fc.constantFrom(0, 0.5, 1.25, 2.75, 10.1),
    minutes: fc.constantFrom(0, 15, 30, 45),
  }),
  fc.constant({ hours: 0, minutes: 0 })
)

export const timeEntryArb = (
  ids = idPool('entry', 6)
): fc.Arbitrary<TimeEntry> =>
  fc
    .record({
      id: ids,
      duration: durationArb,
      date: storedDayArb,
      categoryId: optional(fc.constantFrom(...CATEGORY_IDS)),
      credit: optional(fc.boolean()),
      note: optional(noteArb, 3),
      updatedAt: stampArb,
    })
    .map(({ duration, ...entry }) =>
      compact({
        ...entry,
        ...duration,
        // Credit is stamped from the Category; Standard entries have none.
        credit: entry.categoryId
          ? entry.categoryId === LDC_BUILTIN_CATEGORY_ID || entry.credit
          : undefined,
      } as unknown as TimeEntry)
    )

/** Entries grouped as the store keeps them: by the stored day's year/month. */
export const bucketEntries = (entries: TimeEntry[]): TimeEntriesByYear => {
  const years: TimeEntriesByYear = {}
  for (const entry of entries) {
    const date = new Date(entry.date)
    const year = String(date.getUTCFullYear())
    const month = String(date.getUTCMonth())
    years[year] ??= {}
    years[year][month] ??= []
    years[year][month].push(entry)
  }
  return years
}

export const flattenEntries = (reports: TimeEntriesByYear): TimeEntry[] =>
  Object.values(reports).flatMap((months) => Object.values(months).flat())

// --- Plans ------------------------------------------------------------------

export const dayPlanArb = (ids = idPool('plan', 5)): fc.Arbitrary<DayPlan> =>
  fc
    .record({
      id: ids,
      date: storedDayArb,
      minutes: fc.integer({ min: 0, max: 600 }),
      categoryId: optional(fc.constantFrom(...CATEGORY_IDS)),
      startTimeInMinutes: optional(fc.integer({ min: 0, max: 1439 })),
      anytime: optional(fc.boolean()),
      title: optional(textArb),
      note: optional(noteArb),
      location: optional(
        fc.record(
          {
            name: textArb,
            address: textArb,
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          },
          { requiredKeys: [] }
        )
      ),
      notifyMe: optional(fc.boolean()),
      reminderOffsetMinutes: optional(fc.constantFrom(0, 15, 60, 1440)),
      source: optional(fc.constantFrom('manual', 'recommendation')),
      savedOn: optional(dayKeyArb),
      updatedAt: stampArb,
    })
    .map((plan) => compact(plan as unknown as DayPlan))

export const recurringPlanArb = (
  ids = idPool('recurring', 4)
): fc.Arbitrary<RecurringPlan> =>
  fc
    .record({
      id: ids,
      startDate: storedDayArb,
      minutes: fc.integer({ min: 0, max: 600 }),
      categoryId: optional(fc.constantFrom(...CATEGORY_IDS)),
      startTimeInMinutes: optional(fc.integer({ min: 0, max: 1439 })),
      title: optional(textArb),
      note: optional(noteArb),
      frequency: fc.constantFrom(
        RecurringPlanFrequencies.WEEKLY,
        RecurringPlanFrequencies.BI_WEEKLY,
        RecurringPlanFrequencies.MONTHLY,
        RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY
      ),
      interval: fc.integer({ min: 1, max: 4 }),
      endDate: fc.option(storedDayArb, { nil: null }),
      weekday: fc.integer({ min: 0, max: 6 }),
      weekOfMonth: fc.constantFrom(1, 2, 3, 4, -1),
      deletedDates: optional(fc.uniqueArray(storedDayArb, { maxLength: 3 })),
      overrides: optional(
        fc.uniqueArray(
          fc.record({
            date: storedDayArb,
            minutes: fc.integer({ min: 0, max: 600 }),
          }),
          { maxLength: 2, selector: (o) => o.date }
        )
      ),
      updatedAt: stampArb,
    })
    .map(({ frequency, interval, endDate, weekday, weekOfMonth, ...plan }) =>
      compact({
        ...plan,
        recurrence: {
          frequency,
          interval,
          endDate,
          ...(frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY
            ? { monthlyByWeekdayConfig: { weekday, weekOfMonth } }
            : {}),
        },
      } as unknown as RecurringPlan)
    )

// --- Contacts, Visits, field definitions ------------------------------------

const CONTACT_IDS = ['contact-0', 'contact-1', 'contact-2', 'contact-3']

export const contactArb = (
  ids: fc.Arbitrary<string> = fc.constantFrom(...CONTACT_IDS)
): fc.Arbitrary<Contact> =>
  fc
    .record({
      id: ids,
      name: textArb,
      phone: optional(fc.constantFrom('+1 555 0100', '0612345678', '٠١٢٣')),
      email: optional(fc.constantFrom('a@example.com', 'ü@exämple.de')),
      gender: optional(fc.constantFrom('male', 'female', 'unknown')),
      address: optional(
        fc.record(
          { line1: textArb, city: textArb, zip: fc.constantFrom('02134', '') },
          { requiredKeys: [] }
        )
      ),
      coordinate: optional(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        })
      ),
      createdAt: storedDayArb,
      isFavorite: optional(fc.boolean()),
      customFields: optional(
        fc.dictionary(fc.constantFrom('field-0', 'field-1'), textArb, {
          maxKeys: 2,
        })
      ),
      avatarBackground: optional(fc.constantFrom('#ff0000', null)),
      updatedAt: stampArb,
    })
    .map((contact) => compact(contact as unknown as Contact))

export const visitArb = (ids = idPool('visit', 6)): fc.Arbitrary<Visit> =>
  fc
    .record({
      id: ids,
      contactId: fc.constantFrom(...CONTACT_IDS),
      date: storedDayArb,
      note: optional(noteArb),
      isBibleStudy: fc.boolean(),
      notAtHome: optional(fc.boolean()),
      followUp: optional(
        fc.record(
          {
            date: storedDayArb,
            notifyMe: fc.boolean(),
            topic: textArb,
            reminderOffsetMinutes: fc.constantFrom(0, 30, 1440),
            dismissed: fc.boolean(),
          },
          { requiredKeys: ['date', 'notifyMe', 'topic'] }
        )
      ),
      customFields: optional(
        fc.dictionary(fc.constantFrom('vfield-0', 'vfield-1'), textArb, {
          maxKeys: 2,
        })
      ),
      updatedAt: stampArb,
    })
    .map(({ contactId, ...visit }) =>
      compact({ ...visit, contact: { id: contactId } } as unknown as Visit)
    )

export const fieldDefArb = (
  ids: fc.Arbitrary<string> = fc.constantFrom('field-0', 'field-1', 'field-2')
): fc.Arbitrary<CustomFieldDefinition> =>
  fc
    .record({
      id: ids,
      label: textArb,
      order: fc.integer({ min: 0, max: 5 }),
      createdAt: stampArb,
      archived: optional(fc.boolean()),
      type: optional(fc.constantFrom('text', 'number', 'date', 'url')),
      updatedAt: stampArb,
    })
    // Same-label definitions are one field to the merge (it repairs the old
    // per-device migrations' duplicates), so each id keeps its own label.
    .map((def) =>
      compact({
        ...def,
        label: `${def.id} ${def.label}`,
      } as CustomFieldDefinition)
    )

// --- Categories -------------------------------------------------------------

export const categoryArb = (
  ids: fc.Arbitrary<string> = fc.constantFrom('cat-0', 'cat-1', 'cat-2')
): fc.Arbitrary<Category> =>
  fc
    .record({
      id: ids,
      name: textArb,
      isCredit: fc.boolean(),
      updatedAt: stampArb,
    })
    // Same-name Categories are one to the merge, like field labels.
    .map((category) =>
      compact({ ...category, name: `${category.id} ${category.name}` })
    )

// --- Mileage ----------------------------------------------------------------

const VEHICLE_IDS = ['vehicle-0', 'vehicle-1']
const FUEL_IDS = ['fuel-0', 'fuel-1']

export const vehicleArb = fc
  .record({
    id: fc.constantFrom(...VEHICLE_IDS),
    name: textArb,
    archived: optional(fc.boolean()),
    createdAt: stampArb,
    updatedAt: stampArb,
  })
  .map((v) => compact(v as Vehicle))

export const fuelArb = fc
  .record({
    id: fc.constantFrom(...FUEL_IDS),
    name: textArb,
    createdAt: stampArb,
    updatedAt: stampArb,
  })
  .map((f) => compact(f as Fuel))

export const fuelPriceArb = fc
  .record({
    id: idPool('price', 3),
    fuelId: fc.constantFrom(...FUEL_IDS),
    effectiveFrom: dayKeyArb,
    pricePerGallon: fc.oneof(
      fc.constantFrom(0, 3.499, 4.25),
      fc.double({ min: 0, max: 20, noNaN: true })
    ),
    updatedAt: stampArb,
  })
  .map((p) => compact(p as FuelPrice))

export const vehicleSetupArb = fc
  .record({
    id: idPool('setup', 3),
    vehicleId: fc.constantFrom(...VEHICLE_IDS),
    effectiveFrom: dayKeyArb,
    fuelId: optional(fc.constantFrom(...FUEL_IDS)),
    milesPerGallon: optional(fc.constantFrom(18.5, 30, 112)),
    updatedAt: stampArb,
  })
  .map((s) => compact(s as VehicleSetup))

export const tripArb = fc
  .record({
    id: idPool('trip', 5),
    vehicleId: fc.constantFrom(...VEHICLE_IDS),
    date: dayKeyArb,
    distanceMiles: fc.oneof(
      fc.constantFrom(0, 0.1, 12.5),
      fc.double({ min: 0, max: 500, noNaN: true })
    ),
    roundTrip: optional(fc.boolean()),
    note: optional(noteArb),
    createdAt: stampArb,
    updatedAt: stampArb,
  })
  .map((t) => compact(t as Trip))

// --- Pet --------------------------------------------------------------------

/** Gift kinds follow the seed and day, as `petGiftSeed` makes them. */
const giftKindOn = (seed: string, day: string) =>
  GIFT_KINDS[
    [...`${seed}${day}`].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) %
      GIFT_KINDS.length
  ]

const petVersionArb = fc.record({
  species: fc.constantFrom(...PET_SPECIES_IDS),
  coatIndex: fc.nat(),
  name: optional(fc.constantFrom('Pip', 'لؤلؤ', '🐑 Lamb', 'שושנה')),
  wakes: fc.array(dayKeyArb, { maxLength: 6 }),
  keepsakeDays: fc.array(dayKeyArb, { maxLength: 4 }),
  earned: fc.subarray([
    ...UNLOCK_ORDER,
    'hat:bow',
    'hat:tophat',
    'future:item',
  ]),
  bought: fc.array(
    fc.record({
      item: fc.constantFrom('hat:bow', 'hat:cap', 'floor:stone', 'future:item'),
      price: fc.integer({ min: 0, max: 15 }),
      on: dayKeyArb,
    }),
    { maxLength: 4 }
  ),
})

/**
 * The companion as one of its saved versions. Every change to it is stamped
 * (wakes and earned items too), so one adoption's version at one stamp is the
 * same record on every device: its fields come from the adoption and stamp.
 */
export const petArb: fc.Arbitrary<PetRecord> = fc
  .record({
    // Two adoptions: one from before gift seeds, one with its own seed.
    adoptedOn: fc.constantFrom('2026-01-01', '2026-03-08'),
    step: fc.integer({ min: 0, max: 30 }),
  })
  .map(({ adoptedOn, step }) => {
    const [version] = fc.sample(petVersionArb, {
      numRuns: 1,
      seed: Number(adoptedOn.replaceAll('-', '')) + step,
    })
    return { ...version, adoptedOn, updatedAt: STAMP_BASE + step * 60_000 }
  })
  .map(
    ({ species, coatIndex, keepsakeDays, earned, bought, wakes, ...pet }) => {
      const coats = coatIdsFor(species)
      const seed = pet.adoptedOn === '2026-03-08' ? 'seed-a' : undefined
      const earnedRoomItems = keptRoomItems(earned)
      const purchases = keptPurchases(bought)
      return compact({
        ...pet,
        seed,
        id: PET_RECORD_ID,
        species,
        coat: coats[coatIndex % coats.length],
        wakes: keptWakes(wakes),
        keepsakes: keptKeepsakes(
          keepsakeDays.map((on) => ({
            kind: giftKindOn(seed ?? pet.adoptedOn, on),
            on,
          }))
        ),
        earnedRoomItems: earnedRoomItems.length ? earnedRoomItems : undefined,
        purchases: purchases.length ? purchases : undefined,
      }) as PetRecord
    }
  )

export const petRoomArb: fc.Arbitrary<PetRoomRecord> = fc
  .record({
    time: fc.constantFrom('live', 'dawn', 'night'),
    season: fc.constantFrom('live', 'winter'),
    wallColor: fc.constantFrom('sand', 'sage'),
    wallPattern: fc.constantFrom('plain', 'dots'),
    floor: fc.constantFrom('wood', 'stone'),
    bed: fc.constantFrom('rug', 'hay'),
    shelf: fc.constantFrom('scrolls', 'books'),
    lamp: fc.constantFrom('clay', 'lantern'),
    sign: fc.constantFrom('month', 'shared'),
    hat: optional(fc.constantFrom(...HAT_IDS)),
    updatedAt: stampArb,
  })
  .map(({ time, season, ...room }) =>
    compact({
      ...room,
      id: PET_ROOM_RECORD_ID,
      window: { time, season },
    } as PetRoomRecord)
  )

// --- Tombstones -------------------------------------------------------------

export const tombstonesArb = (
  ids: fc.Arbitrary<string>,
  maxLength = 3,
  importUndone = false
): fc.Arbitrary<{ id: string; deletedAt: number; importUndone?: true }[]> =>
  fc.uniqueArray(
    fc
      .record({ id: ids, deletedAt: stampArb, undone: fc.boolean() })
      .map(({ undone, ...t }) =>
        importUndone && undone ? { ...t, importUndone: true as const } : t
      ),
    { maxLength, selector: (t) => t.id }
  )

const unique = <T extends { id: string }>(
  arb: fc.Arbitrary<T>,
  maxLength = 4
) => fc.uniqueArray(arb, { maxLength, selector: (r) => r.id })

// --- Synced settings --------------------------------------------------------

const ROLES = [
  'publisher',
  'regularAuxiliary',
  'regularPioneer',
  'circuitOverseer',
  'specialPioneer',
  'custom',
] as const
const MONTHS = ['2026-03', '2026-09', '2026-10', '2027-01'] as const
const TIPS = ['tip-a', 'tip-b', 'tip-c'] as const

/** Every synced setting below, untouched: the defaults, without stamps. */
export const BASE_SETTINGS: Record<string, unknown> = {
  customAccentColor: null,
  offDays: [],
  monthlyGoalOverrides: {},
  reportCommentOverrides: {},
  publisherHours: {
    publisher: 0,
    regularAuxiliary: 30,
    regularPioneer: 50,
    circuitOverseer: 50,
    specialPioneer: 100,
    custom: 50,
  },
  seenTipIds: [],
  homeChecklistAllDoneCelebrated: false,
  role: 'publisher',
  roleHistory: null,
}

const MAP_KEYS = new Set([
  'monthlyGoalOverrides',
  'reportCommentOverrides',
  'publisherHours',
])

/** What the User can do to the settings above, one change at a time. */
const settingEditArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  fc
    .constantFrom(null, '#3366ff', '#ff0066')
    .map((customAccentColor) => ({ customAccentColor })),
  fc
    .uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 3 })
    .map((days) => ({ offDays: [...days].sort() })),
  fc
    .tuple(fc.constantFrom(...MONTHS), fc.option(fc.constantFrom(0, 30, 72.5)))
    .map(([month, hours]) => ({ monthlyGoalOverrides: { [month]: hours } })),
  fc
    .tuple(fc.constantFrom(...MONTHS), fc.option(textArb))
    .map(([month, text]) => ({ reportCommentOverrides: { [month]: text } })),
  fc
    .tuple(fc.constantFrom(...ROLES), fc.constantFrom(0, 30, 50, 70))
    .map(([role, hours]) => ({ publisherHours: { [role]: hours } })),
  fc
    .uniqueArray(fc.constantFrom(...TIPS), { maxLength: 3 })
    .map((tips) => ({ seenTipIds: [...tips].sort() })),
  fc.constant({ homeChecklistAllDoneCelebrated: true }),
  // A role change, with the history the store keeps alongside it.
  fc
    .record({
      initial: fc.constantFrom(...ROLES),
      changes: fc.dictionary(
        fc.constantFrom(...MONTHS),
        fc.constantFrom(...ROLES),
        { maxKeys: 2 }
      ),
      role: fc.constantFrom(...ROLES),
    })
    .map(({ initial, changes, role }) => {
      const roleHistory = normalizeRoleHistory({ initial, changes })
      return { roleHistory, role: standingRole(roleHistory, role) }
    })
)

/**
 * Applies `change` as the preferences store's `set` does: a key whose value
 * changed is stamped, and so is every entry that changed in a per-entry map,
 * set or the role history (a removed entry keeps its stamp as a removal).
 */
const applySettingEdit = (
  values: Record<string, unknown>,
  stamps: Record<string, number>,
  change: Record<string, unknown>,
  stamp: number
) => {
  for (const [key, raw] of Object.entries(change)) {
    let after = raw
    if (MAP_KEYS.has(key)) {
      const map = { ...(values[key] as Record<string, unknown>) }
      for (const [entry, value] of Object.entries(
        raw as Record<string, unknown>
      ))
        if (value === null) delete map[entry]
        else map[entry] = value
      after = map
    }
    const before = values[key]
    if (canonicalJson(before) === canonicalJson(after)) continue
    stamps[key] = Math.max(stamp, (stamps[key] ?? 0) + 1)
    const entries = (value: unknown): Record<string, unknown> =>
      key === 'seenTipIds'
        ? Object.fromEntries((value as string[]).map((tip) => [tip, true]))
        : key === 'roleHistory'
          ? roleHistoryEntries(value)
          : ((value ?? {}) as Record<string, unknown>)
    if (MAP_KEYS.has(key) || key === 'seenTipIds' || key === 'roleHistory') {
      const old = entries(before)
      const next = entries(after)
      for (const entry of new Set([...Object.keys(old), ...Object.keys(next)]))
        if (canonicalJson(old[entry]) !== canonicalJson(next[entry]))
          stamps[`${key}:${entry}`] = stamps[key]
    }
    values[key] = after
  }
}

/** One device's synced settings: the defaults after a few of its own edits. */
export const settingsArb = fc
  .array(fc.tuple(settingEditArb, stampArb), { maxLength: 5 })
  .map((edits) => {
    const values = structuredClone(BASE_SETTINGS)
    const stamps: Record<string, number> = {}
    for (const [change, stamp] of edits)
      applySettingEdit(values, stamps, change, stamp)
    return { values, stamps }
  })

/** The profile's synced fields, the same way. */
export const profileArb = fc
  .option(fc.tuple(textArb, stampArb), { nil: undefined })
  .map((edit) =>
    edit
      ? { values: { name: edit[0] }, stamps: { name: edit[1] } }
      : { values: { name: '' }, stamps: {} as Record<string, number> }
  )

// --- Whole devices ----------------------------------------------------------

/**
 * What one device holds in its synced stores: every id once per list, and no
 * record its own tombstone covers (a store drops the tombstone, or stamps past
 * it, when a record comes back under its id).
 */
export const deviceArb: fc.Arbitrary<DeviceState> = fc
  .record({
    contacts: unique(
      fc
        .tuple(contactArb(), fc.boolean())
        // Re-added after a permanent delete: marked with the add's stamp.
        .map(([c, readded]) =>
          readded ? { ...c, readdedAt: c.updatedAt } : c
        ),
      3
    ),
    deletedContacts: unique(
      fc
        .tuple(contactArb(), fc.integer({ min: 0, max: 3 }))
        // Archived copies, now and then redacted (a permanent delete).
        .map(([c, kind]) =>
          kind === 0
            ? (JSON.parse(
                JSON.stringify(stripContactForTombstone(c, c.updatedAt))
              ) as Contact)
            : c
        ),
      2
    ),
    customFieldDefs: unique(fieldDefArb(), 2),
    conversations: unique(visitArb()),
    deletedConversations: tombstonesArb(idPool('visit', 6), 3, true),
    conversationFieldDefs: unique(
      fieldDefArb(fc.constantFrom('vfield-0', 'vfield-1')),
      2
    ),
    entries: unique(timeEntryArb(), 5),
    deletedServiceReports: tombstonesArb(idPool('entry', 6), 3, true),
    dayPlans: unique(dayPlanArb(), 3),
    deletedDayPlans: tombstonesArb(idPool('plan', 5)),
    recurringPlans: unique(recurringPlanArb(), 2),
    deletedRecurringPlans: tombstonesArb(idPool('recurring', 4), 2),
    categories: unique(categoryArb(), 3),
    deletedCategories: tombstonesArb(
      fc.constantFrom('cat-0', 'cat-1', 'cat-2'),
      2
    ),
    vehicles: unique(vehicleArb, 2),
    fuels: unique(fuelArb, 2),
    fuelPrices: unique(fuelPriceArb, 2),
    vehicleSetups: unique(vehicleSetupArb, 2),
    trips: unique(tripArb, 3),
    deletedMileageRecords: tombstonesArb(
      fc.constantFrom(
        'vehicle-0',
        'fuel-0',
        'price-0',
        'setup-0',
        'trip-0',
        'trip-1'
      )
    ),
    pet: fc.option(petArb, { nil: undefined }),
    room: fc.option(petRoomArb, { nil: undefined }),
    deletedPetRecords: tombstonesArb(
      fc.constantFrom(PET_RECORD_ID, PET_ROOM_RECORD_ID),
      2
    ),
    settings: settingsArb,
    profile: profileArb,
  })
  .map(
    ({
      entries,
      pet,
      room,
      deletedContacts,
      contacts,
      settings,
      profile,
      ...lists
    }) => {
      const live = <T extends { id: string; updatedAt?: number }>(
        records: T[],
        tombstones: { id: string; deletedAt: number }[]
      ) =>
        records.filter((record) =>
          tombstones.every(
            (t) => t.id !== record.id || (record.updatedAt ?? 0) > t.deletedAt
          )
        )
      // A contact is either active or archived on one device, never both.
      const archivedIds = new Set(deletedContacts.map((c) => c.id))
      return {
        contacts: contacts.filter((c) => !archivedIds.has(c.id)),
        deletedContacts,
        customFieldDefs: lists.customFieldDefs,
        deletedCustomFieldDefs: [],
        conversations: live(lists.conversations, lists.deletedConversations),
        deletedConversations: lists.deletedConversations,
        conversationFieldDefs: lists.conversationFieldDefs,
        deletedConversationFieldDefs: [],
        serviceReports: bucketEntries(
          live(entries, lists.deletedServiceReports)
        ),
        deletedServiceReports: lists.deletedServiceReports,
        dayPlans: live(lists.dayPlans, lists.deletedDayPlans),
        deletedDayPlans: lists.deletedDayPlans,
        recurringPlans: live(lists.recurringPlans, lists.deletedRecurringPlans),
        deletedRecurringPlans: lists.deletedRecurringPlans,
        categories: live(lists.categories, lists.deletedCategories),
        deletedCategories: lists.deletedCategories,
        vehicles: live(lists.vehicles, lists.deletedMileageRecords),
        fuels: live(lists.fuels, lists.deletedMileageRecords),
        fuelPrices: live(lists.fuelPrices, lists.deletedMileageRecords),
        vehicleSetups: live(lists.vehicleSetups, lists.deletedMileageRecords),
        trips: live(lists.trips, lists.deletedMileageRecords),
        deletedMileageRecords: lists.deletedMileageRecords,
        pets: live(pet ? [pet] : [], lists.deletedPetRecords),
        petRooms: live(room ? [room] : [], lists.deletedPetRecords),
        deletedPetRecords: lists.deletedPetRecords,
        preferencesValues: settings.values,
        preferenceUpdatedAt: settings.stamps,
        profileValues: profile.values,
        profileUpdatedAt: profile.stamps,
      } satisfies DeviceState
    }
  )

/**
 * A device as a comparable value: every list sorted by id, the time entries
 * flattened, as JSON. Two devices with the same records compare equal whatever
 * order the merge left them in.
 *
 * `stamps: false` leaves out the settings' stamps. A merge writes the stamps it
 * compared, so a key or map entry that had none gets one (`0`, or its map's
 * stamp) without any value changing, and the device that pulls first may hold
 * stamps the other doesn't. Values decide what the User sees; stamps get their
 * own property (pulling again changes nothing).
 */
export const deviceSnapshot = (
  device: DeviceState,
  { stamps = true }: { stamps?: boolean } = {}
): string => {
  const byId = (list: unknown[]) =>
    [...list]
      .map((item) => canonicalJson(JSON.parse(JSON.stringify(item))))
      .sort()
  return canonicalJson(
    Object.fromEntries(
      Object.entries(device).flatMap(([key, value]): [string, unknown][] => {
        if (
          !stamps &&
          (key === 'preferenceUpdatedAt' || key === 'profileUpdatedAt')
        )
          return []
        if (key === 'serviceReports')
          return [[key, byId(flattenEntries(value as TimeEntriesByYear))]]
        if (Array.isArray(value)) return [[key, byId(value)]]
        return [[key, value]]
      })
    )
  )
}
