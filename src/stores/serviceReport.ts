import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'
import { RecurringPlan } from '../lib/serviceReport'

export type DayPlan = {
  id: string
  date: Date
  minutes: number
  note?: string
}

const initialState = {
  serviceReports: [] as ServiceReport[],
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
}

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (serviceReport: ServiceReport) =>
        set(({ serviceReports }) => {
          const foundCurrentServiceReport = serviceReports.find(
            (c) => c.id === serviceReport.id
          )

          if (foundCurrentServiceReport) {
            return {}
          }

          return {
            serviceReports: [...serviceReports, serviceReport],
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
      deleteServiceReport: (id: string) =>
        set(({ serviceReports: serviceReport }) => {
          const foundServiceReport = serviceReport.find(
            (serviceReport) => serviceReport.id === id
          )
          if (!foundServiceReport) {
            return {}
          }

          return {
            serviceReports: serviceReport.filter(
              (serviceReport) => serviceReport.id !== id
            ),
          }
        }),
      updateServiceReport: (serviceReport: Partial<ServiceReport>) => {
        set(({ serviceReports }) => {
          return {
            serviceReports: serviceReports.map((c) => {
              if (c.id !== serviceReport.id) {
                return c
              }
              return { ...c, ...serviceReport }
            }),
          }
        })
      },
      _WARNING_forceDeleteServiceReports: () => set({ serviceReports: [] }),
      _WARNING_forceDeleteDayPlans: () => set({ dayPlans: [] }),
      _WARNING_forceDeleteRecurringPlans: () => set({ recurringPlans: [] }),
    })),
    {
      name: 'serviceReports',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

export default useServiceReport
