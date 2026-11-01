import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({ default: { t: (k: string) => k } }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))

import { canonicalJson } from '@/lib/canonicalJson'
import { getTenureType } from '@/lib/publisherCapabilities'
import { storedDayKey } from '@/lib/normalizeDate'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import {
  PREFERENCE_DEFAULTS,
  migratePreferencesPersistedState,
} from '@/stores/preferences'
import { migrateServiceReportPersistedState } from '@/stores/serviceReport'
import { migrateConversationsPersistedState } from '@/stores/conversationStore'
import type { Publisher } from '@/types/publisher'
import type { RecurringPlan, TimeEntry } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  bucketEntries,
  dayPlanArb,
  fcSeed,
  flattenEntries,
  recurringPlanArb,
  stampArb,
  tombstonesArb,
  timeEntryArb,
  visitArb,
} from '@/__tests__/helpers/dataArbitraries'

const runs = { numRuns: 120, seed: fcSeed }

const disk = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const same = (a: unknown, b: unknown) =>
  expect(canonicalJson(disk(a))).toBe(canonicalJson(disk(b)))

const TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Havana',
  'Pacific/Auckland',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
]
const originalTZ = process.env.TZ
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const legacyInstant = (stored: unknown, minuteOfDay: number): string => {
  const [y, m, d] = storedDayKey(stored as string)
    .split('-')
    .map(Number)
  return new Date(y, m - 1, d, 0, minuteOfDay).toISOString()
}

const serviceReportStateArb = fc
  .record({
    entries: fc.uniqueArray(timeEntryArb(fc.uuid()), {
      maxLength: 12,
      selector: (e) => e.id,
    }),
    dayPlans: fc.uniqueArray(dayPlanArb(fc.uuid()), {
      maxLength: 5,
      selector: (p) => p.id,
    }),
    recurringPlans: fc.uniqueArray(recurringPlanArb(fc.uuid()), {
      maxLength: 3,
      selector: (p) => p.id,
    }),
    deletedServiceReports: tombstonesArb(fc.uuid(), 3, true),
    deletedDayPlans: tombstonesArb(fc.uuid()),
    deletedRecurringPlans: tombstonesArb(fc.uuid()),
  })
  .map(({ entries, ...rest }) => ({
    ...rest,
    serviceReports: bucketEntries(entries),
  }))

type ArbValue<A> = A extends fc.Arbitrary<infer T> ? T : never
type ServiceReportState = ArbValue<typeof serviceReportStateArb>

const downgradeServiceReports = (
  state: ServiceReportState,
  version: number,
  minuteOfDay: number
) => {
  const blob = disk(state) as unknown as Record<string, unknown> & {
    serviceReports: Record<string, Record<string, TimeEntry[]>>
    dayPlans: { date: string }[]
    recurringPlans: RecurringPlan[]
  }
  if (version >= 2) return blob

  const local = (date: unknown) => legacyInstant(date, minuteOfDay)
  const entries = flattenEntries(blob.serviceReports).map((e) => ({
    ...e,
    date: local(e.date),
  }))
  const dayPlans = blob.dayPlans.map((p) => ({ ...p, date: local(p.date) }))
  const recurringPlans = blob.recurringPlans.map((p) => ({
    ...p,
    startDate: local(p.startDate),
    recurrence: {
      ...p.recurrence,
      endDate: p.recurrence.endDate ? local(p.recurrence.endDate) : null,
    },
    deletedDates: p.deletedDates?.map(local),
    overrides: p.overrides?.map((o) => ({ ...o, date: local(o.date) })),
  }))
  if (version === 1) {
    const buckets: Record<string, Record<string, unknown[]>> = {}
    for (const e of entries) {
      const d = new Date(e.date)
      const [y, m] = [d.getFullYear(), d.getMonth()]
      ;((buckets[y] ??= {})[m] ??= []).push(e)
    }
    return { ...blob, serviceReports: buckets, dayPlans, recurringPlans }
  }
  return { ...blob, serviceReports: entries, dayPlans, recurringPlans }
}

describe('service report store migrate (v5)', () => {
  it('is a no-op on current data', () => {
    fc.assert(
      fc.property(serviceReportStateArb, (state) => {
        same(migrateServiceReportPersistedState(disk(state), 5), state)
      }),
      runs
    )
  })

  it('keeps every record from any older version, on its calendar day', () => {
    fc.assert(
      fc.property(
        serviceReportStateArb,
        fc.integer({ min: 0, max: 4 }),

        fc.integer({ min: 0, max: 1439 }),
        fc.constantFrom(...TIME_ZONES),
        (state, version, minuteOfDay, tz) => {
          process.env.TZ = tz
          const migrated = disk(
            migrateServiceReportPersistedState(
              downgradeServiceReports(state, version, minuteOfDay),
              version
            )
          )

          same(migrated.serviceReports, state.serviceReports)
          same(migrated.dayPlans, state.dayPlans)

          same(migrated.deletedServiceReports, state.deletedServiceReports)
          same(migrated.deletedDayPlans, state.deletedDayPlans)
          same(migrated.deletedRecurringPlans, state.deletedRecurringPlans)

          expect(migrated.recurringPlans).toHaveLength(
            state.recurringPlans.length
          )
          state.recurringPlans.forEach((plan, i) => {
            const after = migrated.recurringPlans[i] as RecurringPlan
            const {
              deletedDates: before,
              updatedAt: _u,
              ...fields
            } = disk(plan)
            const { deletedDates, updatedAt, ...afterFields } = after
            same(afterFields, fields)
            const kept = (deletedDates ?? []).map(String)
            for (const day of (before ?? []).map(String))
              expect(kept).toContain(day)
            for (const day of kept.slice((before ?? []).length)) {
              expect(
                state.dayPlans.some(
                  (p) => storedDayKey(p.date) === storedDayKey(day)
                )
              ).toBe(true)
              const [y, m, d] = storedDayKey(day).split('-').map(Number)
              expect(
                getPlansIntersectingDay(new Date(y, m - 1, d, 12), [disk(plan)])
              ).toHaveLength(1)
            }
            if (kept.length > (before ?? []).length)
              expect(updatedAt).toBeGreaterThan(plan.updatedAt ?? 0)
            else expect(updatedAt).toBe(plan.updatedAt)
          })
        }
      ),
      runs
    )
  })
})

const visitsArb = fc.uniqueArray(visitArb(fc.uuid()), {
  maxLength: 10,
  selector: (v) => v.id,
})

describe('conversation store migrate (v1)', () => {
  it('is a no-op on current data', () => {
    fc.assert(
      fc.property(visitsArb, tombstonesArb(fc.uuid()), (visits, deleted) => {
        const state = { conversations: visits, deletedConversations: deleted }
        same(migrateConversationsPersistedState(disk(state), 1), state)
      }),
      runs
    )
  })

  it('keeps every Visit and every real follow-up from v0', () => {
    fc.assert(
      fc.property(
        visitsArb.map((visits) =>
          visits.map((v) =>
            v.followUp && !v.followUp.notifyMe && !v.followUp.topic
              ? { ...v, followUp: { ...v.followUp, notifyMe: true } }
              : v
          )
        ),
        fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
        (visits, placeholders) => {
          const v0 = visits.map((v, i) =>
            v.followUp || !placeholders[i]
              ? v
              : ({
                  ...v,
                  followUp: { date: v.date, notifyMe: false, topic: '' },
                } as Visit)
          )
          const migrated = migrateConversationsPersistedState(
            disk({ conversations: v0, deletedConversations: [] }),
            0
          )
          same(migrated.conversations, visits)
        }
      ),
      runs
    )
  })
})

const ROLES: Publisher[] = [
  'publisher',
  'regularAuxiliary',
  'regularPioneer',
  'circuitOverseer',
  'specialPioneer',
  'custom',
]

const monthKeyArb = fc
  .tuple(fc.integer({ min: 2024, max: 2027 }), fc.integer({ min: 1, max: 12 }))
  .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`)

const preferencesArb = fc
  .record({
    role: fc.constantFrom(...ROLES),
    tenureDay: fc.option(fc.constantFrom('2019-09-01', '2026-03-08'), {
      nil: null,
    }),
    offDays: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 3 }),
    meetingDays: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), {
      maxLength: 2,
    }),
    startOfWeek: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
    monthlyGoalOverrides: fc.dictionary(
      monthKeyArb,
      fc.constantFrom(0, 15, 50, 72.5),
      { maxKeys: 3 }
    ),
    contactSort: fc.constantFrom('suggested', 'recentConversation', 'az'),
    contactSortDirection: fc.constantFrom('asc', 'desc'),
    showPet: fc.boolean(),
    showThisWeek: fc.boolean(),
    stamps: fc.dictionary(
      fc.constantFrom(
        'role',
        'offDays',
        'meetingDays',
        'tenureStartDate',
        'monthlyGoalOverrides',
        'contactSort',
        'contactSortDirection',
        'startOfWeek'
      ),
      stampArb,
      { maxKeys: 5 }
    ),
  })
  .map(({ tenureDay, showPet, showThisWeek, stamps, startOfWeek, ...p }) => {
    const hasTenure = getTenureType(p.role) !== null
    const timestamps = { ...stamps }
    if (!hasTenure) delete timestamps.tenureStartDate
    if (startOfWeek === undefined) delete timestamps.startOfWeek

    if (!('contactSort' in timestamps)) p.contactSort = 'suggested'
    if (!('contactSortDirection' in timestamps)) p.contactSortDirection = 'desc'
    return disk({
      ...PREFERENCE_DEFAULTS,
      ...p,
      ...(startOfWeek === undefined ? {} : { startOfWeek }),
      tenureStartDate:
        hasTenure && tenureDay ? `${tenureDay}T12:00:00.000Z` : null,
      homeScreenElements: {
        ...PREFERENCE_DEFAULTS.homeScreenElements,
        pet: showPet,
        thisWeek: showThisWeek,
      },
      preferenceUpdatedAt: timestamps,
    }) as Record<string, unknown> & {
      preferenceUpdatedAt: Record<string, number>
      homeScreenElements: Record<string, boolean>
    }
  })

type Preferences = ArbValue<typeof preferencesArb>

const rename = (
  record: Record<string, unknown>,
  from: string,
  to: string
): Record<string, unknown> => {
  if (!(from in record)) return record
  const { [from]: value, ...rest } = record
  return { ...rest, [to]: value }
}

const downgradePreferences = (
  prefs: Preferences,
  version: number,
  extras: { retiredFlag: boolean; dropShown: boolean }
): Record<string, unknown> => {
  let blob: Record<string, unknown> = disk(prefs)
  let stamps: Record<string, unknown> = { ...prefs.preferenceUpdatedAt }
  const home = { ...prefs.homeScreenElements }
  if (version < 14) {
    blob.displayDetailsOnProgressBarHomeScreen = extras.retiredFlag
    stamps.displayDetailsOnProgressBarHomeScreen = 1
  }

  if (version < 13 && home.thisWeek && extras.dropShown) delete home.thisWeek
  if (version < 12 && home.pet && extras.dropShown) delete home.pet
  blob.homeScreenElements = home

  if (
    version < 11 &&
    prefs.contactSort === 'suggested' &&
    prefs.contactSortDirection === 'desc' &&
    !('contactSort' in stamps) &&
    !('contactSortDirection' in stamps)
  )
    blob.contactSort = 'recentConversation'
  if (version < 10) {
    blob.onboardingIntents = ['track']
    stamps.onboardingIntents = 1
  }
  if (version < 9) blob.seenFoundingSupporterReveal = extras.retiredFlag
  if (version < 8) {
    blob.seenMilestoneUpdateReveal = extras.retiredFlag
    blob.dismissedMilestoneRevealOnce = extras.retiredFlag
  }
  if (version < 7) {
    blob.profileCardShaderEnabled = extras.retiredFlag
    blob.profileCardShaderId = 'aurora'
    stamps.profileCardShaderEnabled = 1
  }
  if (version < 6) {
    blob.oneOffGoalHours = Object.entries(
      prefs.monthlyGoalOverrides as Record<string, number>
    ).map(([month, hours]) => ({ month: `${month}-15T12:00:00.000Z`, hours }))
    delete blob.monthlyGoalOverrides
    stamps = rename(stamps, 'monthlyGoalOverrides', 'oneOffGoalHours')
  }

  if (version < 5 && !('startOfWeek' in prefs)) blob.startOfWeek = 0
  if (version < 4) {
    blob = rename(blob, 'tenureStartDate', 'pioneerStartDate')
    stamps = rename(stamps, 'tenureStartDate', 'pioneerStartDate')
  }
  if (version < 2) {
    blob = rename(blob, 'role', 'publisher')
    stamps = rename(stamps, 'role', 'publisher')
  }
  if (version < 1) {
    blob = rename(blob, 'offDays', 'excludedWeekdays')
    blob = rename(blob, 'meetingDays', 'meetingWeekdays')
    stamps = rename(stamps, 'offDays', 'excludedWeekdays')
    stamps = rename(stamps, 'meetingDays', 'meetingWeekdays')
  }
  return { ...blob, preferenceUpdatedAt: stamps }
}

describe('preferences store migrate (v14)', () => {
  it('is a no-op on current data', () => {
    fc.assert(
      fc.property(preferencesArb, (prefs) => {
        same(migratePreferencesPersistedState(disk(prefs), 14), prefs)
      }),
      runs
    )
  })

  it('brings any older version back to the same settings', () => {
    fc.assert(
      fc.property(
        preferencesArb,
        fc.integer({ min: 0, max: 13 }),
        fc.boolean(),
        fc.boolean(),
        (prefs, version, retiredFlag, dropShown) => {
          const older = downgradePreferences(prefs, version, {
            retiredFlag,
            dropShown,
          })
          same(migratePreferencesPersistedState(older, version), prefs)
        }
      ),
      runs
    )
  })

  it('is idempotent on any older blob', () => {
    fc.assert(
      fc.property(
        preferencesArb,
        fc.integer({ min: 0, max: 13 }),
        (prefs, version) => {
          const once = migratePreferencesPersistedState(
            downgradePreferences(prefs, version, {
              retiredFlag: true,
              dropShown: true,
            }),
            version
          )
          same(migratePreferencesPersistedState(disk(once), 14), once)
        }
      ),
      runs
    )
  })
})
