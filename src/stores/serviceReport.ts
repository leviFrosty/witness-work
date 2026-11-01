import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone, withoutTombstones } from '@/lib/syncTombstones'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
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
  normalizeDateForUpdate,
  normalizePartialRecurringPlan,
  normalizeRecurringPlan,
  PersistedServiceReportState,
} from '@/lib/normalizeDate'
import { PersistStorage } from '@/stores/mmkv'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { skipRecurringInstancesOnDayPlanDates } from '@/lib/recurrence'
import { hasNote } from '@/lib/richText/notes'

const initialState = {
  serviceReports: {} as TimeEntriesByYear,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],

  deletedServiceReports: [] as TimeEntryTombstone[],

  deletedDayPlans: [] as PlanTombstone[],
  deletedRecurringPlans: [] as PlanTombstone[],
}

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

const withoutPlanTombstone = (
  tombstones: PlanTombstone[],
  id: string | undefined
): PlanTombstone[] =>
  id === undefined ? tombstones : withoutTombstones(tombstones, new Set([id]))

export type PlanSaveOptions = {
  automatic?: boolean
}

const savedOnStamp = (
  options?: PlanSaveOptions,
  savedOn?: string
): { savedOn?: string } =>
  options?.automatic
    ? {}
    : { savedOn: savedOn ?? moment().format('YYYY-MM-DD') }

export const migrateServiceReports = (oldServiceReports: any): any => {
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

export const migrateServiceReportPersistedState = (
  persistedState: any,
  version: number
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

const withAddedServiceReports = (
  {
    serviceReports,
    deletedServiceReports,
  }: Pick<typeof initialState, 'serviceReports' | 'deletedServiceReports'>,
  incoming: TimeEntry[]
): Pick<typeof initialState, 'serviceReports' | 'deletedServiceReports'> => {
  const reports = { ...serviceReports }
  const copiedYears = new Set<number>()
  const copiedMonths = new Set<string>()
  for (const report of incoming) {
    const normalizedDate = normalizeDateForStorage(report.date)
    const m = momentStoredDate(normalizedDate)
    const month = m.month()
    const year = m.year()
    if (!copiedYears.has(year)) {
      reports[year] = { ...reports[year] }
      copiedYears.add(year)
    }
    if (!copiedMonths.has(`${year}-${month}`)) {
      reports[year][month] = [...(reports[year][month] ?? [])]
      copiedMonths.add(`${year}-${month}`)
    }
    reports[year][month].push({
      ...report,
      date: normalizedDate,
      updatedAt: stampPastTombstone(deletedServiceReports, report.id),
    })
  }
  return {
    serviceReports: reports,
    deletedServiceReports: withoutTombstones(
      deletedServiceReports,
      new Set(incoming.map((report) => report.id))
    ),
  }
}

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (report: TimeEntry) =>
        set((state) => withAddedServiceReports(state, [report])),

      addServiceReports: (reports: TimeEntry[]) =>
        set((state) => withAddedServiceReports(state, reports)),
      addDayPlan: (dayPlan: DayPlan, options?: PlanSaveOptions) =>
        set(({ dayPlans, deletedDayPlans }) => {
          const normalized: DayPlan = {
            ...dayPlan,
            date: normalizeDateForStorage(dayPlan.date),
          }

          const foundDayPlan = dayPlans.find((c) => c.id === normalized.id)
          if (foundDayPlan) {
            return {}
          }

          return {
            dayPlans: [
              ...dayPlans,
              {
                ...normalized,
                ...savedOnStamp(options),
                updatedAt: stampPastTombstone(deletedDayPlans, normalized.id),
              },
            ],

            deletedDayPlans: withoutPlanTombstone(
              deletedDayPlans,
              normalized.id
            ),
          }
        }),
      updateDayPlan: (dayPlan: Partial<DayPlan>, options?: PlanSaveOptions) => {
        set(({ dayPlans, deletedDayPlans }) => {
          const existing = dayPlans.find((c) => c.id === dayPlan.id)
          const normalized: Partial<DayPlan> = dayPlan.date
            ? {
                ...dayPlan,
                date: normalizeDateForUpdate(dayPlan.date, existing?.date),
              }
            : dayPlan
          const found = !!existing
          return {
            dayPlans: dayPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }
              return {
                ...c,
                ...normalized,
                ...savedOnStamp(options, c.savedOn),
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),

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
      addRecurringPlan: (
        recurringPlan: RecurringPlan,
        options?: PlanSaveOptions
      ) =>
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
                ...savedOnStamp(options),
                updatedAt: stampPastTombstone(
                  deletedRecurringPlans,
                  normalized.id
                ),
              },
            ],

            deletedRecurringPlans: withoutPlanTombstone(
              deletedRecurringPlans,
              normalized.id
            ),
          }
        }),
      updateRecurringPlan: (
        recurringPlan: Partial<RecurringPlan>,
        options?: PlanSaveOptions
      ) => {
        set(({ recurringPlans, deletedRecurringPlans }) => {
          const existing = recurringPlans.find((c) => c.id === recurringPlan.id)
          const normalized = normalizePartialRecurringPlan(
            recurringPlan,
            existing
          )
          const found = !!existing
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== normalized.id) {
                return c
              }

              return {
                ...c,
                ...normalized,
                ...savedOnStamp(options, c.savedOn),
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),

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

              return {
                ...c,
                overrides: [...updatedOverrides, normalized],
                ...savedOnStamp(undefined, c.savedOn),
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
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== planId) {
                return c
              }
              const existingOverrides = c.overrides || []
              const normalized: RecurringPlanOverride = {
                ...override,
                date: normalizeDateForUpdate(
                  override.date,
                  ...existingOverrides.map((o) => o.date)
                ),
              }
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
                ...savedOnStamp(undefined, c.savedOn),
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
          const noteSource = hasNote(override) ? override : plan
          return {
            ...plan,
            minutes: override.minutes,
            note: noteSource.note,
            noteDoc: noteSource.noteDoc,
            startTimeInMinutes:
              override.startTimeInMinutes ?? plan.startTimeInMinutes,
            anytime: override.anytime ?? plan.anytime,
            isOverride: true,
            originalMinutes: plan.minutes,
            originalNote: plan.note,
            originalNoteDoc: plan.noteDoc,
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

          reports[year] = { ...reports[year] }
          if (!monthWithRemovedReport.length) {
            delete reports[year][month]
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
          const foundReport = getReport(reports, serviceReport)
          if (!foundReport) {
            return {}
          }
          const { month, year, report: previous } = foundReport
          const normalized: TimeEntry = {
            ...serviceReport,
            date: normalizeDateForUpdate(serviceReport.date, previous.date),
          }
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
