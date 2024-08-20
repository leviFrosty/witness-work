import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { ServiceReport, ServiceReportsByYears } from '../types/serviceReport'
import moment from 'moment'
import { getReport, RecurringPlan } from '../lib/serviceReport'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'

export type DayPlan = {
  id: string
  date: Date
  minutes: number
  note?: string
}

const initialState = {
  serviceReports: {} as ServiceReportsByYears,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  persistedStopwatch: {
    startTime: 0,
    isRunning: false,
    timeWhenLastStopped: 0,
  },
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

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (report: ServiceReport) =>
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const month = moment(report.date).month()
          const year = moment(report.date).year()
          if (!reports[year]) {
            reports[year] = {}
          }

          if (!reports[year][month]) {
            reports[year][month] = []
          }

          reports[year][month].push(report)

          return {
            serviceReports: reports,
          }
        }),
      addDayPlan: (dayPlan: DayPlan) =>
        set(({ dayPlans }) => {
          const foundDayPlan = dayPlans.find((c) => c.id === dayPlan.id)
          const foundDayPlanDate = dayPlans.find((c) =>
            moment(c.date).isSame(dayPlan.date, 'day')
          )

          // Overrides existing day if already added.
          if (foundDayPlanDate) {
            return {
              dayPlans: dayPlans.map((c) => {
                if (!moment(c.date).isSame(dayPlan.date, 'day')) {
                  return c
                }
                return { ...c, ...dayPlan }
              }),
            }
          }

          if (foundDayPlan) {
            return {}
          }

          return {
            dayPlans: [...dayPlans, dayPlan],
          }
        }),
      updateDayPlan: (dayPlan: Partial<DayPlan>) => {
        set(({ dayPlans }) => {
          return {
            dayPlans: dayPlans.map((c) => {
              if (c.id !== dayPlan.id) {
                return c
              }
              return { ...c, ...dayPlan }
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
          const foundRecurringPlanStartDate = recurringPlans.find((c) =>
            moment(c.startDate).isSame(recurringPlan.startDate, 'day')
          )

          if (foundRecurringPlanStartDate) {
            return {
              recurringPlans: recurringPlans.map((c) => {
                if (
                  !moment(c.startDate).isSame(recurringPlan.startDate, 'day')
                ) {
                  return c
                }
                return { ...c, ...recurringPlan }
              }),
            }
          }

          return {
            recurringPlans: [...recurringPlans, recurringPlan],
          }
        }),
      updateRecurringPlan: (recurringPlan: Partial<RecurringPlan>) => {
        set(({ recurringPlans }) => {
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== recurringPlan.id) {
                return c
              }
              return { ...c, ...recurringPlan }
            }),
          }
        })
      },
      deleteSingleEventFromRecurringPlan: (id: string, date: Date) => {
        set(({ recurringPlans }) => {
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== id) {
                return c
              }
              const deleted = c.deletedDates || []
              return { ...c, deletedDates: [...deleted, date] }
            }),
          }
        })
      },
      deleteEventAndFutureEvents: (id: string, date: Date) => {
        set(({ recurringPlans }) => {
          return {
            recurringPlans: recurringPlans.map((c) => {
              if (c.id !== id) {
                return c
              }
              const deleted = c.deletedDates || []
              return {
                ...c,
                deletedDates: [...deleted, date],
                recurrence: {
                  ...c.recurrence,
                  endDate: date,
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
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const foundReport = getReport(reports, _report)

          if (!foundReport) {
            return {}
          }

          const { month, year, report } = foundReport
          const monthWithRemovedReport = reports[year][month].filter(
            (r) => r.id !== report.id
          )

          reports[year][month] = monthWithRemovedReport

          return {
            serviceReports: reports,
          }
        }),
      updateServiceReport: (serviceReport: ServiceReport) => {
        set(({ serviceReports }) => {
          const reports = { ...serviceReports }
          const foundReport = getReport(reports, serviceReport)
          if (!foundReport) {
            return {}
          }
          const { month, year } = foundReport
          const updatedMonth = serviceReports[year][month].map((c) => {
            if (c.id !== serviceReport.id) {
              return c
            }
            return { ...c, ...serviceReport }
          })

          reports[year][month] = updatedMonth

          return {
            serviceReports: reports,
          }
        })
      },
      _WARNING_forceDeleteServiceReports: () => set({ serviceReports: {} }),
      _WARNING_forceDeleteDayPlans: () => set({ dayPlans: [] }),
      _WARNING_forceDeleteRecurringPlans: () => set({ recurringPlans: [] }),
    })),
    {
      name: 'serviceReports',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0) {
          const previousReports = (
            persistedState as { serviceReports: ServiceReport[] }
          ).serviceReports

          const years = migrateServiceReports(previousReports)

          // @ts-expect-error This cannot be type checked because legacy data
          persistedState.serviceReports = years
        }

        return persistedState
      },
    }
  )
)

export default useServiceReport
