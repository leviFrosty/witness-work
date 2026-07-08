import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import {
  DayPlan,
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
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'
import * as Notifications from 'expo-notifications'
import { getServiceYearFromDate } from '@/lib/serviceYear'

const initialState = {
  serviceReports: {} as TimeEntriesByYear,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  /**
   * Tombstones for deleted service reports. Populated by `deleteServiceReport`
   * so iCloud sync can propagate deletions across devices.
   */
  deletedServiceReports: [] as TimeEntryTombstone[],
}

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
    const normalized = migrateNormalizeDates({
      serviceReports: next.serviceReports ?? {},
      dayPlans: next.dayPlans ?? [],
      recurringPlans: next.recurringPlans ?? [],
    } as PersistedServiceReportState)
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
            updatedAt: Date.now(),
          })

          return {
            serviceReports: reports,
          }
        }),
      addDayPlan: (dayPlan: DayPlan) =>
        set(({ dayPlans }) => {
          const normalized: DayPlan = {
            ...dayPlan,
            date: normalizeDateForStorage(dayPlan.date),
          }
          const foundDayPlan = dayPlans.find((c) => c.id === normalized.id)
          const foundDayPlanDate = dayPlans.find((c) =>
            momentStoredDate(c.date).isSame(
              momentStoredDate(normalized.date),
              'day'
            )
          )

          // Overrides existing day if already added.
          if (foundDayPlanDate) {
            return {
              dayPlans: dayPlans.map((c) => {
                if (
                  !momentStoredDate(c.date).isSame(
                    momentStoredDate(normalized.date),
                    'day'
                  )
                ) {
                  return c
                }
                return { ...c, ...normalized, updatedAt: Date.now() }
              }),
            }
          }

          if (foundDayPlan) {
            return {}
          }

          return {
            dayPlans: [...dayPlans, { ...normalized, updatedAt: Date.now() }],
          }
        }),
      updateDayPlan: (dayPlan: Partial<DayPlan>) => {
        set(({ dayPlans }) => {
          const normalized: Partial<DayPlan> = dayPlan.date
            ? { ...dayPlan, date: normalizeDateForStorage(dayPlan.date) }
            : dayPlan
          return {
            dayPlans: dayPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }
              return { ...c, ...normalized, updatedAt: Date.now() }
            }),
          }
        })
      },
      deleteDayPlan: (id: string) =>
        set(({ dayPlans }) => {
          const foundDayPlan = dayPlans.find((plan) => plan.id === id)
          if (!foundDayPlan) {
            return {}
          }

          foundDayPlan.notifications?.forEach(
            async ({ id: notificationId }) =>
              await Notifications.cancelScheduledNotificationAsync(
                notificationId
              )
          )

          return {
            dayPlans: dayPlans.filter((plan) => plan.id !== id),
          }
        }),
      addRecurringPlan: (recurringPlan: RecurringPlan) =>
        set(({ recurringPlans }) => {
          const normalized = normalizeRecurringPlan(recurringPlan)
          const foundRecurringPlanStartDate = recurringPlans.find((c) =>
            momentStoredDate(c.startDate).isSame(
              momentStoredDate(normalized.startDate),
              'day'
            )
          )

          if (foundRecurringPlanStartDate) {
            return {
              recurringPlans: recurringPlans.map((c) => {
                if (
                  !momentStoredDate(c.startDate).isSame(
                    momentStoredDate(normalized.startDate),
                    'day'
                  )
                ) {
                  return c
                }
                return { ...c, ...normalized, updatedAt: Date.now() }
              }),
            }
          }

          return {
            recurringPlans: [
              ...recurringPlans,
              { ...normalized, updatedAt: Date.now() },
            ],
          }
        }),
      updateRecurringPlan: (recurringPlan: Partial<RecurringPlan>) => {
        set(({ recurringPlans }) => {
          const normalized = normalizePartialRecurringPlan(recurringPlan)
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }
              // Stamp updatedAt (mirrors the day-plan actions) — iCloud merge
              // is whole-object last-writer-wins on this timestamp; without
              // it a remote copy always beats a local edit.
              return { ...c, ...normalized, updatedAt: Date.now() }
            }),
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
              return { ...c, overrides: [...updatedOverrides, normalized] }
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
              return { ...c, overrides: updatedOverrides }
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
              return { ...c, overrides: updatedOverrides }
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
              return { ...c, deletedDates: updatedDeleted }
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
              return { ...c, deletedDates: [...deleted, normalizedDate] }
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
              }
            }),
          }
        })
      },
      deleteRecurringPlan: (id: string) =>
        set(({ recurringPlans }) => {
          const foundRecurringPlan = recurringPlans.find(
            (plan) => plan.id === id
          )
          if (!foundRecurringPlan) {
            return {}
          }

          return {
            recurringPlans: recurringPlans.filter((plan) => plan.id !== id),
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
              { id: report.id, deletedAt: Date.now() },
            ],
          }
        }),
      deleteRolloverPair: (_report: TimeEntry) =>
        set(({ serviceReports, deletedServiceReports }) => {
          const groupId = _report.rolloverGroupId
          const now = Date.now()
          const reports: TimeEntriesByYear = {}
          const removedIds: string[] = []

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
                  removedIds.push(r.id)
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

          if (removedIds.length === 0) return {}

          const newTombstones = removedIds.map((id) => ({
            id,
            deletedAt: now,
          }))
          const removedSet = new Set(removedIds)
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
          const now = Date.now()
          const reports: TimeEntriesByYear = {}
          const removedIds: string[] = []

          for (const yearKey of Object.keys(serviceReports)) {
            const yearMap: TimeEntriesByMonth = {}
            const months = serviceReports[yearKey]
            for (const monthKey of Object.keys(months)) {
              const filtered = months[monthKey].filter((r) => {
                const reportStartYear = getServiceYearFromDate(
                  momentStoredDate(r.date)
                )
                if (reportStartYear === startYear) {
                  removedIds.push(r.id)
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

          if (removedIds.length === 0) return {}

          const removedSet = new Set(removedIds)
          return {
            serviceReports: reports,
            deletedServiceReports: [
              ...deletedServiceReports.filter((t) => !removedSet.has(t.id)),
              ...removedIds.map((id) => ({ id, deletedAt: now })),
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
          const { month, year } = foundReport
          const updatedMonth = serviceReports[year][month].map((c) => {
            if (c.id !== normalized.id) {
              return c
            }
            return { ...c, ...normalized, updatedAt: Date.now() }
          })

          reports[year][month] = updatedMonth

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
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
      version: 4,
      migrate: (persistedState, version) =>
        migrateServiceReportPersistedState(persistedState, version),
    }
  )
)

export default useServiceReport
