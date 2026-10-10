import { syncTimestamp } from '@/lib/syncClock'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import {
  DayPlan,
  PlanTombstone,
  TimeEntry,
  TimeEntriesByYear,
  TimeEntryTombstone,
  TimeEntriesByMonth,
} from '@/types/timeEntry'
import moment from 'moment'
import {
  getReport,
  RecurringPlan,
  RecurringPlanOverride,
} from '@/lib/serviceReport'
import {
  migrateNormalizeDates,
  momentStoredDate,
  normalizeDateForStorage,
  normalizePartialRecurringPlan,
  normalizeRecurringPlan,
  PersistedServiceReportState,
} from '@/lib/normalizeDate'
import { PersistStorage } from '@/stores/mmkv'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { skipRecurringInstancesOnDayPlanDates } from '@/lib/recurrence'

const initialState = {
  serviceReports: {} as TimeEntriesByYear,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  /**
   * Tombstones for deleted service reports. Populated by `deleteServiceReport`
   * so iCloud sync can propagate deletions across devices.
   */
  deletedServiceReports: [] as TimeEntryTombstone[],
  /**
   * Tombstones for removed Day Plans and Recurring Plans, so iCloud sync
   * propagates the removal instead of another device's copy bringing the Plan
   * back. Every action that removes a Plan writes one; adding a Plan with that
   * id, or updating one that's still here, clears it.
   */
  deletedDayPlans: [] as PlanTombstone[],
  deletedRecurringPlans: [] as PlanTombstone[],
}

/**
 * `tombstones` with a fresh one for `plan`, replacing any earlier one for its
 * id. Stamped past the Plan's last edit and that earlier deletion, so it beats
 * every copy of the Plan this device has seen.
 */
const withPlanTombstone = (
  tombstones: PlanTombstone[],
  plan: { id: string; updatedAt?: number }
): PlanTombstone[] => {
  const previous = tombstones.find((tombstone) => tombstone.id === plan.id)
  return [
    ...tombstones.filter((tombstone) => tombstone.id !== plan.id),
    {
      id: plan.id,
      deletedAt: syncTimestamp(
        Math.max(plan.updatedAt ?? 0, previous?.deletedAt ?? 0)
      ),
    },
  ]
}

/** `tombstones` without the one for `id`; the same array when there is none. */
const withoutPlanTombstone = (
  tombstones: PlanTombstone[],
  id: string | undefined
): PlanTombstone[] =>
  tombstones.some((tombstone) => tombstone.id === id)
    ? tombstones.filter((tombstone) => tombstone.id !== id)
    : tombstones

/**
 * The `updatedAt` for a Plan added under `id`. A removed id can come back (a
 * buddy's linked Plan has a fixed id), so it's stamped past that removal: other
 * devices keep the tombstone, and the Plan must outlive it there too.
 */
const addedPlanStamp = (tombstones: PlanTombstone[], id: string) =>
  syncTimestamp(tombstones.find((tombstone) => tombstone.id === id)?.deletedAt)

/** Migrates legacy service report data: `TimeEntry[]` -> `TimeEntriesByYear` */
export const migrateServiceReports = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldServiceReports: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  const years: TimeEntriesByYear = {}

  for (const report of oldServiceReports) {
    const month = moment(report.date).month()
    const year = moment(report.date).year()
    if (!years[year]) {
      years[year] = {}
    }

    if (!years[year][month]) {
      years[year][month] = []
    }

    years[year][month].push(report)
  }

  return years
}

/**
 * Persist-middleware migration entry point. Chains:
 *
 * - V0 → v1: reshape `TimeEntry[]` into `TimeEntriesByYear` (legacy).
 * - V1 → v2: anchor every persisted Date to noon UTC so calendar days survive
 *   device timezone changes. See `migrateNormalizeDates`.
 * - V2 → v3: structural bump for the tag → Category refactor. The actual
 *   tag-to-categoryId rewrite happens in a boot-time runner
 *   (`migrateTagsToCategories` in `src/lib/categories.ts`) that needs to
 *   coordinate writes across three stores; this version bump exists so the
 *   TimeEntry store's persisted shape is tagged as post-migration once the
 *   runner has executed. The migration step itself is a no-op at the persist
 *   layer — the boot runner is the source of truth.
 * - V3 → v4: structural bump for the LDC collapse refactor. The actual `ldc:
 *   true` → `categoryId: LDC_BUILTIN_CATEGORY_ID, credit: true` rewrite happens
 *   in a boot-time runner (`migrateLdcToCategory` in `src/lib/categories.ts`)
 *   for the same multi-store coordination reason. Same no-op pattern — the
 *   version bump tags the on-disk shape as post-collapse.
 * - V4 → v5: Plans on one day now add up, where a Day Plan used to hide that
 *   day's recurring instances. Skips each of those instances
 *   (`skipRecurringInstancesOnDayPlanDates`) so every forecast stays as it
 *   was.
 *
 * Additive fields need no bump: persist's default shallow merge fills any key
 * missing from the saved state from `initialState`, which is how existing
 * installs start with empty `deletedDayPlans` / `deletedRecurringPlans`.
 *
 * Exported for unit testing.
 */
export const migrateServiceReportPersistedState = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  persistedState: any,
  version: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  let next = persistedState
  if (version === 0) {
    const previousReports = (next as { serviceReports: TimeEntry[] })
      .serviceReports
    const years = migrateServiceReports(previousReports)
    next = { ...next, serviceReports: years }
  }
  if (version < 2) {
    const normalized = migrateNormalizeDates(
      {
        serviceReports: next.serviceReports ?? {},
        dayPlans: next.dayPlans ?? [],
        recurringPlans: next.recurringPlans ?? [],
      } as PersistedServiceReportState,
      normalizeDateForStorage
    )
    next = {
      ...next,
      serviceReports: normalized.serviceReports,
      dayPlans: normalized.dayPlans,
      recurringPlans: normalized.recurringPlans,
    }
  }
  // v2 → v3: structural marker for the tag → categoryId rewrite. The rewrite
  // itself is performed by the boot-time runner in `src/app/App.tsx`; this
  // hook only exists so the persisted-state version reflects the on-disk
  // schema once the runner has executed.
  // v3 → v4: structural marker for the LDC → builtin Category collapse. Same
  // shape as v2 → v3 — no on-disk rewrite here; the boot runner in
  // `src/app/App.tsx` (`migrateLdcToCategory`) coordinates the actual change
  // because it needs to write across the categories + service reports +
  // preferences stores in one shot.
  if (version < 5) {
    next = {
      ...next,
      recurringPlans: skipRecurringInstancesOnDayPlanDates(
        next.dayPlans ?? [],
        next.recurringPlans ?? [],
        syncTimestamp
      ),
    }
  }
  return next
}

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (report: TimeEntry) =>
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const normalizedDate = normalizeDateForStorage(report.date)
          const m = momentStoredDate(normalizedDate)
          const month = m.month()
          const year = m.year()
          if (!reports[year]) {
            reports[year] = {}
          }

          if (!reports[year][month]) {
            reports[year][month] = []
          }

          reports[year][month].push({
            ...report,
            date: normalizedDate,
            updatedAt: syncTimestamp(),
          })

          return {
            serviceReports: reports,
          }
        }),
      addDayPlan: (dayPlan: DayPlan) =>
        set(({ dayPlans, deletedDayPlans }) => {
          const normalized: DayPlan = {
            ...dayPlan,
            date: normalizeDateForStorage(dayPlan.date),
          }
          // Multiple Day Plans may coexist on the same calendar day — they
          // stack additively. Only an identical id is rejected as a duplicate.
          const foundDayPlan = dayPlans.find((c) => c.id === normalized.id)
          if (foundDayPlan) {
            return {}
          }

          return {
            dayPlans: [
              ...dayPlans,
              {
                ...normalized,
                updatedAt: addedPlanStamp(deletedDayPlans, normalized.id),
              },
            ],
            // A removed id can come back (a buddy's linked Plan has a fixed
            // id); it's live again.
            deletedDayPlans: withoutPlanTombstone(
              deletedDayPlans,
              normalized.id
            ),
          }
        }),
      updateDayPlan: (dayPlan: Partial<DayPlan>) => {
        set(({ dayPlans, deletedDayPlans }) => {
          const normalized: Partial<DayPlan> = dayPlan.date
            ? { ...dayPlan, date: normalizeDateForStorage(dayPlan.date) }
            : dayPlan
          const found = dayPlans.some((c) => c.id === normalized.id)
          return {
            dayPlans: dayPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }
              return {
                ...c,
                ...normalized,
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
            // Only a Plan that's still here: clearing the tombstone of one
            // removed meanwhile (an edit screen saved after a pull removed
            // it) would let a stale copy bring it back.
            ...(found
              ? {
                  deletedDayPlans: withoutPlanTombstone(
                    deletedDayPlans,
                    normalized.id
                  ),
                }
              : {}),
          }
        })
      },
      deleteDayPlan: (id: string) =>
        set(({ dayPlans, deletedDayPlans }) => {
          const foundDayPlan = dayPlans.find((plan) => plan.id === id)
          if (!foundDayPlan) {
            return {}
          }

          return {
            dayPlans: dayPlans.filter((plan) => plan.id !== id),
            deletedDayPlans: withPlanTombstone(deletedDayPlans, foundDayPlan),
          }
        }),
      addRecurringPlan: (recurringPlan: RecurringPlan) =>
        set(({ recurringPlans, deletedRecurringPlans }) => {
          const normalized = normalizeRecurringPlan(recurringPlan)
          const existing = recurringPlans.find(
            (plan) => plan.id === normalized.id
          )
          if (existing) return {}

          return {
            recurringPlans: [
              ...recurringPlans,
              {
                ...normalized,
                updatedAt: addedPlanStamp(deletedRecurringPlans, normalized.id),
              },
            ],
            // Same rule as `addDayPlan`.
            deletedRecurringPlans: withoutPlanTombstone(
              deletedRecurringPlans,
              normalized.id
            ),
          }
        }),
      updateRecurringPlan: (recurringPlan: Partial<RecurringPlan>) => {
        set(({ recurringPlans, deletedRecurringPlans }) => {
          const normalized = normalizePartialRecurringPlan(recurringPlan)
          const found = recurringPlans.some((c) => c.id === normalized.id)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }
              // Stamp updatedAt (mirrors the day-plan actions) — iCloud merge
              // is whole-object last-writer-wins on this timestamp; without
              // it a remote copy always beats a local edit.
              return {
                ...c,
                ...normalized,
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
            // Same rule as `updateDayPlan`.
            ...(found
              ? {
                  deletedRecurringPlans: withoutPlanTombstone(
                    deletedRecurringPlans,
                    normalized.id
                  ),
                }
              : {}),
          }
        })
      },
      addRecurringPlanOverride: (
        planId: string,
        override: RecurringPlanOverride
      ) => {
        set(({ recurringPlans }) => {
          const normalized: RecurringPlanOverride = {
            ...override,
            date: normalizeDateForStorage(override.date),
          }
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== planId) {
                return c
              }
              const existingOverrides = c.overrides || []
              const updatedOverrides = existingOverrides.filter(
                (o) =>
                  !momentStoredDate(o.date).isSame(
                    momentStoredDate(normalized.date),
                    'day'
                  )
              )
              // Every occurrence edit stamps the Plan: iCloud merge is
              // whole-record last-writer-wins on `updatedAt`, so an unstamped
              // edit never reaches other devices and their next edit
              // reverts it.
              return {
                ...c,
                overrides: [...updatedOverrides, normalized],
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      updateRecurringPlanOverride: (
        planId: string,
        override: RecurringPlanOverride
      ) => {
        set(({ recurringPlans }) => {
          const normalized: RecurringPlanOverride = {
            ...override,
            date: normalizeDateForStorage(override.date),
          }
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== planId) {
                return c
              }
              const existingOverrides = c.overrides || []
              const updatedOverrides = existingOverrides.map((o) => {
                if (
                  momentStoredDate(o.date).isSame(
                    momentStoredDate(normalized.date),
                    'day'
                  )
                ) {
                  return normalized
                }
                return o
              })
              return {
                ...c,
                overrides: updatedOverrides,
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      removeRecurringPlanOverride: (planId: string, date: Date) => {
        set(({ recurringPlans }) => {
          const normalizedDate = normalizeDateForStorage(date)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== planId) {
                return c
              }
              const existingOverrides = c.overrides || []
              const updatedOverrides = existingOverrides.filter(
                (o) =>
                  !momentStoredDate(o.date).isSame(
                    momentStoredDate(normalizedDate),
                    'day'
                  )
              )
              return {
                ...c,
                overrides: updatedOverrides,
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      getRecurringPlanForDate: (planId: string, date: Date) => {
        const { recurringPlans } = useServiceReport.getState()
        const plan = recurringPlans.find((p) => p.id === planId)
        if (!plan) return null

        const normalizedDate = normalizeDateForStorage(date)
        const override = plan.overrides?.find((o) =>
          momentStoredDate(o.date).isSame(
            momentStoredDate(normalizedDate),
            'day'
          )
        )

        if (override) {
          return {
            ...plan,
            minutes: override.minutes,
            note: override.note,
            startTimeInMinutes:
              override.startTimeInMinutes ?? plan.startTimeInMinutes,
            anytime: override.anytime ?? plan.anytime,
            isOverride: true,
            originalMinutes: plan.minutes,
            originalNote: plan.note,
            originalStartTimeInMinutes: plan.startTimeInMinutes,
          }
        }

        return { ...plan, isOverride: false }
      },
      restoreRecurringPlanInstance: (planId: string, date: Date) => {
        set(({ recurringPlans }) => {
          const normalizedDate = normalizeDateForStorage(date)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== planId) {
                return c
              }
              const existingDeleted = c.deletedDates || []
              const updatedDeleted = existingDeleted.filter(
                (deletedDate) =>
                  !momentStoredDate(deletedDate).isSame(
                    momentStoredDate(normalizedDate),
                    'day'
                  )
              )
              return {
                ...c,
                deletedDates: updatedDeleted,
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      deleteSingleEventFromRecurringPlan: (id: string, date: Date) => {
        set(({ recurringPlans }) => {
          const normalizedDate = normalizeDateForStorage(date)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== id) {
                return c
              }
              const deleted = c.deletedDates || []
              return {
                ...c,
                deletedDates: [...deleted, normalizedDate],
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      deleteEventAndFutureEvents: (id: string, date: Date) => {
        set(({ recurringPlans }) => {
          const normalizedDate = normalizeDateForStorage(date)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== id) {
                return c
              }
              const deleted = c.deletedDates || []
              return {
                ...c,
                deletedDates: [...deleted, normalizedDate],
                recurrence: {
                  ...c.recurrence,
                  endDate: normalizedDate,
                },
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      deleteRecurringPlan: (id: string) =>
        set(({ recurringPlans, deletedRecurringPlans }) => {
          const foundRecurringPlan = recurringPlans.find(
            (plan) => plan.id === id
          )
          if (!foundRecurringPlan) {
            return {}
          }

          return {
            recurringPlans: recurringPlans.filter((plan) => plan.id !== id),
            deletedRecurringPlans: withPlanTombstone(
              deletedRecurringPlans,
              foundRecurringPlan
            ),
          }
        }),
      deleteServiceReport: (_report: TimeEntry) =>
        set(({ serviceReports, deletedServiceReports }) => {
          const reports = { ...serviceReports }
          const foundReport = getReport(reports, _report)

          if (!foundReport) {
            return {}
          }

          const { month, year, report } = foundReport
          const monthWithRemovedReport = reports[year][month].filter(
            (r) => r.id !== report.id
          )

          if (!monthWithRemovedReport.length) {
            delete reports[year]?.[month]
          } else {
            reports[year][month] = monthWithRemovedReport
          }

          return {
            serviceReports: reports,
            deletedServiceReports: [
              ...deletedServiceReports.filter((t) => t.id !== report.id),
              {
                id: report.id,
                deletedAt: syncTimestamp(report.updatedAt),
              },
            ],
          }
        }),
      deleteRolloverPair: (_report: TimeEntry) =>
        set(({ serviceReports, deletedServiceReports }) => {
          const groupId = _report.rolloverGroupId
          const reports: TimeEntriesByYear = {}
          const removed: TimeEntry[] = []

          // Walk the whole tree once. With or without a groupId we always
          // remove the passed report itself; with a groupId we also drop any
          // sibling sharing it. Pre-grouping legacy entries hit the no-id
          // path and just delete the one row.
          for (const yearKey of Object.keys(serviceReports)) {
            const yearMap: TimeEntriesByMonth = {}
            const months = serviceReports[yearKey]
            for (const monthKey of Object.keys(months)) {
              const filtered = months[monthKey].filter((r) => {
                const matchesGroup =
                  groupId !== undefined && r.rolloverGroupId === groupId
                const matchesId = r.id === _report.id
                if (matchesGroup || matchesId) {
                  removed.push(r)
                  return false
                }
                return true
              })
              if (filtered.length > 0) {
                yearMap[monthKey] = filtered
              }
            }
            if (Object.keys(yearMap).length > 0) {
              reports[yearKey] = yearMap
            }
          }

          if (removed.length === 0) return {}

          const newTombstones = removed.map((entry) => ({
            id: entry.id,
            deletedAt: syncTimestamp(entry.updatedAt),
          }))
          const removedSet = new Set(removed.map((entry) => entry.id))
          return {
            serviceReports: reports,
            deletedServiceReports: [
              ...deletedServiceReports.filter((t) => !removedSet.has(t.id)),
              ...newTombstones,
            ],
          }
        }),
      deleteServiceYearReports: (endYear: number) =>
        set(({ serviceReports, deletedServiceReports }) => {
          // Service year Sep `endYear - 1` → Aug `endYear`; entries carry the
          // start year, so match on that.
          const startYear = endYear - 1
          const reports: TimeEntriesByYear = {}
          const removed: TimeEntry[] = []

          for (const yearKey of Object.keys(serviceReports)) {
            const yearMap: TimeEntriesByMonth = {}
            const months = serviceReports[yearKey]
            for (const monthKey of Object.keys(months)) {
              const filtered = months[monthKey].filter((r) => {
                const reportStartYear = getServiceYearFromDate(
                  momentStoredDate(r.date)
                )
                if (reportStartYear === startYear) {
                  removed.push(r)
                  return false
                }
                return true
              })
              if (filtered.length > 0) {
                yearMap[monthKey] = filtered
              }
            }
            if (Object.keys(yearMap).length > 0) {
              reports[yearKey] = yearMap
            }
          }

          if (removed.length === 0) return {}

          const removedSet = new Set(removed.map((entry) => entry.id))
          return {
            serviceReports: reports,
            deletedServiceReports: [
              ...deletedServiceReports.filter((t) => !removedSet.has(t.id)),
              ...removed.map((entry) => ({
                id: entry.id,
                deletedAt: syncTimestamp(entry.updatedAt),
              })),
            ],
          }
        }),
      updateServiceReport: (serviceReport: TimeEntry) => {
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const normalized: TimeEntry = {
            ...serviceReport,
            date: normalizeDateForStorage(serviceReport.date),
          }
          const foundReport = getReport(reports, normalized)
          if (!foundReport) {
            return {}
          }
          const { month, year, report: previous } = foundReport
          const nextDate = momentStoredDate(normalized.date)
          const nextYear = nextDate.year(),
            nextMonth = nextDate.month()
          const updated = {
            ...previous,
            ...normalized,
            updatedAt: syncTimestamp(previous.updatedAt),
          }
          const oldEntries = serviceReports[year][month].filter(
            (entry) => entry.id !== normalized.id
          )
          reports[year] = { ...reports[year], [month]: oldEntries }
          reports[nextYear] = {
            ...reports[nextYear],
            [nextMonth]: [...(reports[nextYear]?.[nextMonth] ?? []), updated],
          }
          return {
            serviceReports: reports,
          }
        })
      },
      _WARNING_forceDeleteServiceReports: () =>
        set({ serviceReports: {}, deletedServiceReports: [] }),
      _WARNING_forceDeleteDayPlans: () => set({ dayPlans: [] }),
      _WARNING_forceDeleteRecurringPlans: () => set({ recurringPlans: [] }),
    })),
    {
      name: 'serviceReports',
      storage: createJSONStorage(() => PersistStorage),
      version: 5,
      migrate: (persistedState, version) =>
        migrateServiceReportPersistedState(persistedState, version),
    }
  )
)

export default useServiceReport
