import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import {
  DayPlan,
  ServiceReport,
  ServiceReportsByYears,
  ServiceReportTombstone,
} from '../types/serviceReport'
import moment from 'moment'
import {
  getReport,
  RecurringPlan,
  RecurringPlanOverride,
} from '../lib/serviceReport'
import {
  migrateNormalizeDates,
  momentStoredDate,
  normalizeDateForStorage,
  normalizePartialRecurringPlan,
  normalizeRecurringPlan,
  PersistedServiceReportState,
} from '../lib/normalizeDate'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'

const initialState = {
  serviceReports: {} as ServiceReportsByYears,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  /**
   * Tombstones for deleted service reports. Populated by `deleteServiceReport`
   * so iCloud sync can propagate deletions across devices.
   */
  deletedServiceReports: [] as ServiceReportTombstone[],
}

/**
 * Migrates legacy service report data: `ServiceReport[]` ->
 * `ServiceReportsByYears`
 */
export const migrateServiceReports = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldServiceReports: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  const years: ServiceReportsByYears = {}

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
 * - V0 → v1: reshape `ServiceReport[]` into `ServiceReportsByYears` (legacy).
 * - V1 → v2: anchor every persisted Date to noon UTC so calendar days survive
 *   device timezone changes. See `migrateNormalizeDates`.
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
    const previousReports = (next as { serviceReports: ServiceReport[] })
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
  return next
}

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (report: ServiceReport) =>
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
                return { ...c, ...normalized }
              }),
            }
          }

          return {
            recurringPlans: [...recurringPlans, normalized],
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
              return { ...c, ...normalized }
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
            isOverride: true,
            originalMinutes: plan.minutes,
            originalNote: plan.note,
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
      deleteServiceReport: (_report: ServiceReport) =>
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
      updateServiceReport: (serviceReport: ServiceReport) => {
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const normalized: ServiceReport = {
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
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
      version: 2,
      migrate: (persistedState, version) =>
        migrateServiceReportPersistedState(persistedState, version),
    }
  )
)

export default useServiceReport
