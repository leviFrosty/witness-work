import moment from 'moment'
import {
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
  calculateMinutesRemaining,
  calculateProgress,
  getPlansIntersectingDay,
  getTimeAsMinutesForHourglass,
  getTotalMinutesForServiceYear,
  serviceReportHoursPerMonthToGoal,
  adjustedMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { ServiceReport, ServiceReportsByYears } from '../types/serviceReport'
import { Publisher } from '../types/publisher'
import { monthCreditMaxMinutes } from '../constants/serviceReports'
import { describe, expect, it } from 'vitest'

describe('lib/serviceReport', () => {
  describe('calculateProgress', () => {
    it('should not return less than 0', () => {
      const progress = calculateProgress({ minutes: -10 * 60, goalHours: 10 })
      expect(progress).toBe(0)
    })

    it('should not return more than 1', () => {
      const progress = calculateProgress({ minutes: 1000 * 60, goalHours: 10 })
      expect(progress).toBe(1)
    })

    it('should return the percentage', () => {
      const progress = calculateProgress({ minutes: 5 * 60, goalHours: 10 })
      expect(progress).toBe(0.5)
      const progressTwo = calculateProgress({ minutes: 3 * 60, goalHours: 10 })
      expect(progressTwo).toBe(0.3)
    })
  })

  describe('calculateMinutesRemaining', () => {
    it('should not return less than 0', () => {
      const minutesRemaining = calculateMinutesRemaining({
        minutes: 100 * 60,
        goalHours: 10,
      })
      expect(minutesRemaining).toBe(0)
    })

    it('should not return more than goalHours', () => {
      const minutesRemaining = calculateMinutesRemaining({
        minutes: 0,
        goalHours: 10,
      })
      expect(minutesRemaining).toBe(10 * 60)
    })

    it('should return the correct amount of minutes remaining', () => {
      const hoursRemaining = calculateMinutesRemaining({
        minutes: 3 * 60,
        goalHours: 10,
      })
      expect(hoursRemaining).toBe(7 * 60)
    })
  })

  describe('adjustedMinutesForSpecificMonth ', () => {
    it('should return the number of minutes in the month', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: new Date(),
          hours: 1,
          minutes: 0,
        },
        {
          id: '2',
          date: new Date(),
          hours: 0,
          minutes: 15,
        },
        {
          id: '3',
          date: new Date(),
          hours: 0,
          minutes: 15,
        },
        {
          id: '4',
          date: new Date(),
          hours: 0,
          minutes: 30,
        },
        {
          id: '5',
          date: moment().add(1, 'month').toDate(),
          hours: 1,
          minutes: 0,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(2 * 60)
    })

    it('should return 0 if no reports provided', () => {
      const serviceReports: ServiceReport[] = []

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(0)
    })

    it('should not include minutes from previous or upcoming months', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().subtract(1, 'month').toDate(),
          hours: 10,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().subtract(1, 'years').toDate(),
          hours: 5,
          minutes: 0,
        },
        {
          id: '3',
          date: moment().add(1, 'month').toDate(),
          hours: 100,
          minutes: 0,
        },
        {
          id: '4',
          date: moment().add(1, 'year').toDate(),
          hours: 50,
          minutes: 0,
        },
        {
          id: '5',
          date: new Date(),
          hours: 1000,
          minutes: 60,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(1001 * 60)
    })

    it("shouldn't allow a user to have greater than 55 hours solely of credit time", () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 60,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(55 * 60)
    })

    it('should result in 55 hours if you have both standard and credit time', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 30,
          minutes: 0,
          ldc: true,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 30,
          minutes: 0,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(55 * 60)
      expect(adjustedMinutes.creditOverage).toBe(5 * 60)
    })

    it('should result in sum if you have both standard and credit time, but less than 55 hours', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 20,
          minutes: 0,
          ldc: true,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 20,
          minutes: 0,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(40 * 60)
      expect(adjustedMinutes.creditOverage).toBe(0)
    })

    it("should return as many standard hours even if it's over the credit cap", () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 100,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 20,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(adjustedMinutes.value).toBe(100 * 60)
      expect(adjustedMinutes.creditOverage).toBe(20 * 60)
    })

    it('should have no credit limit for special pioneers', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 80,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 30,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'specialPioneer'
      )

      expect(adjustedMinutes.value).toBe(110 * 60) // 80 + 30 = 110 hours total
      expect(adjustedMinutes.creditOverage).toBe(0) // No overage for special pioneers
      expect(adjustedMinutes.standard).toBe(80 * 60)
      expect(adjustedMinutes.credit).toBe(30 * 60)
    })

    it('should have no credit limit for circuit overseers', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 100,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 50,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'circuitOverseer'
      )

      expect(adjustedMinutes.value).toBe(150 * 60) // 100 + 50 = 150 hours total
      expect(adjustedMinutes.creditOverage).toBe(0) // No overage for circuit overseers
      expect(adjustedMinutes.standard).toBe(100 * 60)
      expect(adjustedMinutes.credit).toBe(50 * 60)
    })

    it('should still apply credit limit for regular pioneers', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 30,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 40,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'regularPioneer'
      )

      expect(adjustedMinutes.value).toBe(55 * 60) // Limited to 55 hours
      expect(adjustedMinutes.creditOverage).toBe(15 * 60) // 30 + 40 - 55 = 15 hours overage
      expect(adjustedMinutes.standard).toBe(30 * 60)
      expect(adjustedMinutes.credit).toBe(25 * 60) // 55 - 30 = 25 credit applied
    })

    it('should still apply credit limit for publishers', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 20,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 50,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'publisher'
      )

      expect(adjustedMinutes.value).toBe(55 * 60) // Limited to 55 hours
      expect(adjustedMinutes.creditOverage).toBe(15 * 60) // 20 + 50 - 55 = 15 hours overage
      expect(adjustedMinutes.standard).toBe(20 * 60)
      expect(adjustedMinutes.credit).toBe(35 * 60) // 55 - 20 = 35 credit applied
    })

    it('should respect user credit limit override - no limit (0 hours)', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 60,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 40,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'publisher',
        { enabled: true, customLimitHours: 0 } // No limit
      )

      expect(adjustedMinutes.value).toBe(100 * 60) // 60 + 40 = 100 hours total
      expect(adjustedMinutes.creditOverage).toBe(0) // No overage when no limit
      expect(adjustedMinutes.standard).toBe(60 * 60)
      expect(adjustedMinutes.credit).toBe(40 * 60)
    })

    it('should respect user credit limit override - custom limit (70 hours)', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 45,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 40,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'regularPioneer',
        { enabled: true, customLimitHours: 70 } // Custom 70-hour limit
      )

      expect(adjustedMinutes.value).toBe(70 * 60) // Limited to 70 hours
      expect(adjustedMinutes.creditOverage).toBe(15 * 60) // 45 + 40 - 70 = 15 hours overage
      expect(adjustedMinutes.standard).toBe(45 * 60)
      expect(adjustedMinutes.credit).toBe(25 * 60) // 70 - 45 = 25 credit applied
    })

    it('should use default behavior when override is disabled', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 30,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 40,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'publisher',
        { enabled: false, customLimitHours: 100 } // Override disabled
      )

      expect(adjustedMinutes.value).toBe(55 * 60) // Default 55-hour limit applies
      expect(adjustedMinutes.creditOverage).toBe(15 * 60) // 30 + 40 - 55 = 15 hours overage
      expect(adjustedMinutes.standard).toBe(30 * 60)
      expect(adjustedMinutes.credit).toBe(25 * 60) // 55 - 30 = 25 credit applied
    })

    it('should still respect special pioneer exemption even with override disabled', () => {
      const serviceReports: ServiceReport[] = [
        {
          id: '1',
          date: moment().toDate(),
          hours: 80,
          minutes: 0,
        },
        {
          id: '2',
          date: moment().toDate(),
          hours: 50,
          minutes: 0,
          ldc: true,
        },
      ]

      const adjustedMinutes = adjustedMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year(),
        'specialPioneer',
        { enabled: false, customLimitHours: 55 } // Override disabled, but special pioneer gets no limit
      )

      expect(adjustedMinutes.value).toBe(130 * 60) // 80 + 50 = 130 hours total (no limit)
      expect(adjustedMinutes.creditOverage).toBe(0) // No overage for special pioneers
      expect(adjustedMinutes.standard).toBe(80 * 60)
      expect(adjustedMinutes.credit).toBe(50 * 60)
    })
  })

  describe('getTimeAsMinutesForHourglass', () => {
    it('should return 1 if you are a publisher and went out for the month', () => {
      const publisher: Publisher = 'publisher'

      const minutes = getTimeAsMinutesForHourglass(publisher, true, 0)

      expect(minutes).toBe(1)
    })

    it('should return 0 if you are a publisher and did not go out for the month', () => {
      const publisher: Publisher = 'publisher'

      const minutes = getTimeAsMinutesForHourglass(publisher, false, 0)

      expect(minutes).toBe(0)
    })

    it('should return your minutes if you are a non-publisher', () => {
      const publisher: Publisher = 'regularPioneer'

      const minutes = getTimeAsMinutesForHourglass(publisher, true, 600)

      expect(minutes).toBe(600)
    })
  })

  describe('serviceYearMinutesPerMonthToGoal', () => {
    it("should be the publisher's goal minutes if 0 entries for year", () => {
      const serviceReports: ServiceReportsByYears = {}

      const goalHours = 50

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 8,
          year: 2022,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(goalHours)
    })

    it('the hours/mo should increase if the user has less than the goal hours for the first month', () => {
      const serviceReports: ServiceReportsByYears = {
        2022: {
          8: [
            {
              date: moment().month(8).year(2022).toDate(),
              hours: 25,
              id: '1',
              minutes: 0,
            },
          ],
        },
      }

      const goalHours = 50

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 8,
          year: 2022,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBeGreaterThan(goalHours)
    })

    it("the hours/mo should stay at goal hour if they hit exactly the goal last month and they're on the second month", () => {
      const serviceReports: ServiceReportsByYears = {
        2022: {
          8: [
            {
              date: moment().month(8).year(2022).toDate(),
              hours: 50,
              id: '1',
              minutes: 0,
            },
          ],
        },
      }
      const goalHours = 50

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 9,
          year: 2022,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(goalHours)
    })

    it("should return exactly the annual goal hours if you're on the last month and haven't got out the entire service year", () => {
      const serviceReports: ServiceReportsByYears = {}

      const goalHours = 50
      const annualGoalHours = goalHours * 12

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 7,
          year: 2023,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(annualGoalHours)
    })

    it("should return only the hours remaining if you're on the last month", () => {
      const hours = 500
      const serviceReports: ServiceReportsByYears = {
        2022: {
          8: [
            {
              date: moment().month(8).year(2022).toDate(),
              hours,
              id: '1',
              minutes: 0,
            },
          ],
        },
      }

      const goalHours = 50
      const annualGoalHours = goalHours * 12

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 7,
          year: 2023,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(annualGoalHours - hours)
    })

    it("should return only the hours remaining if you're on the last month and made a report on the last month", () => {
      const report1Hours = 500
      const report2Hours = 20
      const serviceReports: ServiceReportsByYears = {
        2022: {
          8: [
            {
              date: moment().month(8).year(2022).toDate(),
              hours: report1Hours,
              id: '1',
              minutes: 0,
            },
          ],
        },
        2023: {
          7: [
            {
              date: moment().month(7).year(2023).toDate(),
              hours: report2Hours,
              id: '2',
              minutes: 0,
            },
          ],
        },
      }
      const goalHours = 50
      const annualGoalHours = goalHours * 12

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 7,
          year: 2023,
        },
        goalHours,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(
        annualGoalHours - report1Hours - report2Hours
      )
    })
  })

  describe('getPlansIntersectingDay', () => {
    it('should return the plans that intersect with the day', () => {
      const date = moment('2024-05-10')
      const plans: RecurringPlan[] = [
        {
          id: '00',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date)
            .subtract(1, 'year')
            .subtract(1, 'month')
            .toDate(),
        },
        {
          id: '0',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(1, 'month').toDate(),
        },
        {
          id: '1',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '2',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '3',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(3, 'weeks').toDate(),
        },
        {
          id: '4',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '5',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(2, 'week').toDate(),
        },
      ]

      const intersectingPlans = getPlansIntersectingDay(
        moment(date).toDate(),
        plans
      )

      expect(intersectingPlans).toEqual(plans)
    })

    it('should not return plans that do not intersect with the day', () => {
      const date = moment('2024-05-15')
      const plans: RecurringPlan[] = [
        {
          id: '00',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date)
            .subtract(1, 'year')
            .subtract(1, 'month')
            .toDate(),
        },
        {
          id: '0',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(1, 'month').toDate(),
        },
        {
          id: '1',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '2',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '3',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(3, 'weeks').toDate(),
        },
        {
          id: '4',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).toDate(),
        },
        {
          id: '5',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment(date).subtract(2, 'week').toDate(),
        },
      ]

      const intersectingPlans = getPlansIntersectingDay(
        moment(date).subtract(1, 'day').toDate(),
        plans
      )

      const containsNoneOfThePlans = intersectingPlans.every((plan) => {
        return !plans.includes(plan)
      })
      expect(containsNoneOfThePlans).toBe(true)
    })
  })

  describe('getTotalMinutesForServiceYear', () => {
    it('should not allow more than 55 hours per month of LDC for a single month', () => {
      const year = 2023
      const serviceReports: ServiceReportsByYears = {
        [year]: {
          10: [
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(10).toDate(),
              hours: 70,
              id: '0',
            },
          ],
        },
      }

      const minutes = getTotalMinutesForServiceYear(serviceReports, year)
      expect(minutes).toBe(monthCreditMaxMinutes)
    })

    it('should not allow multiple entries to sum to more than 55', () => {
      const year = 2023
      const serviceReports: ServiceReportsByYears = {
        [year]: {
          10: [
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(10).toDate(),
              hours: 50,
              id: '0',
            },
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(10).toDate(),
              hours: 10,
              id: '0',
            },
          ],
        },
      }

      const minutes = getTotalMinutesForServiceYear(serviceReports, year)
      expect(minutes).toBe(monthCreditMaxMinutes)
    })

    it('should properly add different months together, but not exceeding the ldc month cap', () => {
      const year = 2023
      const reports: ServiceReportsByYears = {
        [year]: {
          10: [
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(10).toDate(),
              hours: 50,
              id: '0',
            },
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(10).toDate(),
              hours: 50,
              id: '0',
            },
          ],
          11: [
            {
              minutes: 0,
              ldc: true,
              date: moment().year(year).month(11).toDate(),
              hours: 70,
              id: '0',
            },
          ],
        },
        [year + 1]: {
          0: [
            {
              minutes: 0,
              ldc: true,
              date: moment()
                .year(year + 1)
                .month(0)
                .toDate(),
              hours: 55,
              id: '0',
            },
          ],
          1: [
            {
              minutes: 0,
              ldc: true,
              date: moment()
                .year(year + 1)
                .month(1)
                .toDate(),
              hours: 55,
              id: '0',
            },
            {
              minutes: 0,
              ldc: true,
              date: moment()
                .year(year + 1)
                .month(1)
                .toDate(),
              hours: 55,
              id: '0',
            },
          ],
        },
      }

      const minutes = getTotalMinutesForServiceYear(reports, year)
      expect(minutes).toBe(monthCreditMaxMinutes * 4)
    })

    it('should include time from the first day of the service year to the last day', () => {
      const year = 2023
      const reports: ServiceReportsByYears = {
        [year]: {
          8: [
            {
              minutes: 0,
              date: moment().year(year).month(8).startOf('month').toDate(),
              hours: 10,
              id: '0',
            },
          ],
        },
        [year + 1]: {
          7: [
            {
              minutes: 0,
              date: moment()
                .year(year + 1)
                .month(7)
                .endOf('month')
                .toDate(),
              hours: 10,
              id: '0',
            },
          ],
        },
      }

      const minutes = getTotalMinutesForServiceYear(reports, year)
      expect(minutes).toBe(20 * 60)
    })
  })

  describe('RecurringPlan Overrides', () => {
    const baseRecurringPlan: RecurringPlan = {
      id: 'test-plan',
      startDate: moment('2024-01-01').toDate(),
      minutes: 120, // 2 hours
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      note: 'Original plan note',
    }

    describe('getPlansIntersectingDay with overrides', () => {
      it('should respect deleted dates', () => {
        const testDate = moment('2024-01-08').toDate() // Next Monday
        const planWithDeleted: RecurringPlan = {
          ...baseRecurringPlan,
          deletedDates: [testDate],
        }

        const intersectingPlans = getPlansIntersectingDay(testDate, [
          planWithDeleted,
        ])
        expect(intersectingPlans).toHaveLength(0)
      })

      it('should return plans without overrides normally', () => {
        const testDate = moment('2024-01-08').toDate() // Next Monday
        const intersectingPlans = getPlansIntersectingDay(testDate, [
          baseRecurringPlan,
        ])

        expect(intersectingPlans).toHaveLength(1)
        expect(intersectingPlans[0]).toEqual(baseRecurringPlan)
      })

      it('should return plans with overrides', () => {
        const testDate = moment('2024-01-08').toDate() // Next Monday
        const override: RecurringPlanOverride = {
          date: testDate,
          minutes: 180, // 3 hours instead of 2
          note: 'Override note',
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        const intersectingPlans = getPlansIntersectingDay(testDate, [
          planWithOverride,
        ])
        expect(intersectingPlans).toHaveLength(1)
        expect(intersectingPlans[0]).toEqual(planWithOverride)
      })
    })

    describe('RecurringPlanOverride type validation', () => {
      it('should create a valid override with required fields', () => {
        const override: RecurringPlanOverride = {
          date: moment('2024-01-15').toDate(),
          minutes: 90,
        }

        expect(override.date).toBeInstanceOf(Date)
        expect(override.minutes).toBe(90)
        expect(override.note).toBeUndefined()
      })

      it('should create a valid override with optional note', () => {
        const override: RecurringPlanOverride = {
          date: moment('2024-01-15').toDate(),
          minutes: 90,
          note: 'Special override',
        }

        expect(override.date).toBeInstanceOf(Date)
        expect(override.minutes).toBe(90)
        expect(override.note).toBe('Special override')
      })
    })

    describe('RecurringPlan with overrides', () => {
      it('should allow multiple overrides on different dates', () => {
        const override1: RecurringPlanOverride = {
          date: moment('2024-01-08').toDate(),
          minutes: 180,
          note: 'First override',
        }

        const override2: RecurringPlanOverride = {
          date: moment('2024-01-15').toDate(),
          minutes: 60,
          note: 'Second override',
        }

        const planWithMultipleOverrides: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override1, override2],
        }

        expect(planWithMultipleOverrides.overrides).toHaveLength(2)
        expect(planWithMultipleOverrides.overrides![0]).toEqual(override1)
        expect(planWithMultipleOverrides.overrides![1]).toEqual(override2)
      })

      it('should work with empty overrides array', () => {
        const planWithEmptyOverrides: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [],
        }

        expect(planWithEmptyOverrides.overrides).toHaveLength(0)
      })

      it('should work with undefined overrides', () => {
        const planWithoutOverrides: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: undefined,
        }

        expect(planWithoutOverrides.overrides).toBeUndefined()
      })
    })

    describe('Override date matching', () => {
      it('should match overrides by date correctly', () => {
        const targetDate = moment('2024-01-15').toDate()
        const override: RecurringPlanOverride = {
          date: targetDate,
          minutes: 90,
          note: 'Override for Jan 15',
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        // Verify the override matches the target date
        const matchingOverride = planWithOverride.overrides?.find((o) =>
          moment(o.date).isSame(targetDate, 'day')
        )

        expect(matchingOverride).toEqual(override)
      })

      it('should not match overrides on different dates', () => {
        const overrideDate = moment('2024-01-15').toDate()
        const searchDate = moment('2024-01-16').toDate()

        const override: RecurringPlanOverride = {
          date: overrideDate,
          minutes: 90,
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        const matchingOverride = planWithOverride.overrides?.find((o) =>
          moment(o.date).isSame(searchDate, 'day')
        )

        expect(matchingOverride).toBeUndefined()
      })
    })

    describe('Override data integrity', () => {
      it('should preserve original plan data when overrides exist', () => {
        const override: RecurringPlanOverride = {
          date: moment('2024-01-08').toDate(),
          minutes: 180,
          note: 'Override note',
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        // Original plan data should remain unchanged
        expect(planWithOverride.minutes).toBe(120)
        expect(planWithOverride.note).toBe('Original plan note')
        expect(planWithOverride.startDate).toEqual(baseRecurringPlan.startDate)
        expect(planWithOverride.recurrence).toEqual(
          baseRecurringPlan.recurrence
        )

        // Override should be separate
        expect(planWithOverride.overrides![0].minutes).toBe(180)
        expect(planWithOverride.overrides![0].note).toBe('Override note')
      })

      it('should handle overrides with zero minutes', () => {
        const override: RecurringPlanOverride = {
          date: moment('2024-01-08').toDate(),
          minutes: 0, // Zero minutes override
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        expect(planWithOverride.overrides![0].minutes).toBe(0)
      })

      it('should handle overrides with very large minutes', () => {
        const override: RecurringPlanOverride = {
          date: moment('2024-01-08').toDate(),
          minutes: 24 * 60, // 24 hours
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        expect(planWithOverride.overrides![0].minutes).toBe(1440)
      })
    })

    describe('Override edge cases', () => {
      it('should handle overrides on plan start date', () => {
        const override: RecurringPlanOverride = {
          date: baseRecurringPlan.startDate, // Same as start date
          minutes: 240,
          note: 'Override on start date',
        }

        const planWithOverride: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override],
        }

        expect(planWithOverride.overrides![0].date).toEqual(
          baseRecurringPlan.startDate
        )
        expect(planWithOverride.overrides![0].minutes).toBe(240)
      })

      it('should handle multiple overrides sorted by date', () => {
        const override1: RecurringPlanOverride = {
          date: moment('2024-01-22').toDate(),
          minutes: 60,
        }

        const override2: RecurringPlanOverride = {
          date: moment('2024-01-08').toDate(),
          minutes: 180,
        }

        const override3: RecurringPlanOverride = {
          date: moment('2024-01-15').toDate(),
          minutes: 90,
        }

        const planWithOverrides: RecurringPlan = {
          ...baseRecurringPlan,
          overrides: [override1, override2, override3], // Unsorted
        }

        // Sort overrides by date for testing
        const sortedOverrides = planWithOverrides.overrides!.sort(
          (a, b) => moment(a.date).unix() - moment(b.date).unix()
        )

        expect(sortedOverrides[0]).toEqual(override2) // Jan 8
        expect(sortedOverrides[1]).toEqual(override3) // Jan 15
        expect(sortedOverrides[2]).toEqual(override1) // Jan 22
      })
    })
  })

  describe('MONTHLY_BY_WEEKDAY recurring plans', () => {
    it('should match monthly by weekday plans correctly', () => {
      const plan: RecurringPlan = {
        id: '1',
        startDate: new Date(2024, 0, 1), // January 1, 2024 (Monday)
        minutes: 60,
        recurrence: {
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          interval: 1,
          endDate: null,
          monthlyByWeekdayConfig: {
            weekday: 1, // Monday
            weekOfMonth: 1, // First week
          },
        },
      }

      // First Monday of February 2024 is February 5th
      const firstMondayFeb = new Date(2024, 1, 5)
      const plans = getPlansIntersectingDay(firstMondayFeb, [plan])
      expect(plans).toHaveLength(1)

      // February 12th is second Monday, should NOT match
      const secondMondayFeb = new Date(2024, 1, 12)
      const noPlans = getPlansIntersectingDay(secondMondayFeb, [plan])
      expect(noPlans).toHaveLength(0)

      // First Monday of March 2024 is March 4th
      const firstMondayMarch = new Date(2024, 2, 4)
      const marchPlans = getPlansIntersectingDay(firstMondayMarch, [plan])
      expect(marchPlans).toHaveLength(1)
    })

    it('should match last weekday of month correctly', () => {
      const plan: RecurringPlan = {
        id: '1',
        startDate: new Date(2024, 0, 29), // January 29, 2024 (last Monday)
        minutes: 60,
        recurrence: {
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          interval: 1,
          endDate: null,
          monthlyByWeekdayConfig: {
            weekday: 1, // Monday
            weekOfMonth: -1, // Last week
          },
        },
      }

      // Last Monday of February 2024 is February 26th
      const lastMondayFeb = new Date(2024, 1, 26)
      const plans = getPlansIntersectingDay(lastMondayFeb, [plan])
      expect(plans).toHaveLength(1)

      // February 19th is third Monday, should NOT match
      const thirdMondayFeb = new Date(2024, 1, 19)
      const noPlans = getPlansIntersectingDay(thirdMondayFeb, [plan])
      expect(noPlans).toHaveLength(0)
    })

    it('should handle edge case where fourth week is also last week', () => {
      const plan: RecurringPlan = {
        id: '1',
        startDate: new Date(2024, 8, 2), // September 2, 2024 (first Monday)
        minutes: 60,
        recurrence: {
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          interval: 1,
          endDate: null,
          monthlyByWeekdayConfig: {
            weekday: 1, // Monday
            weekOfMonth: 4, // Fourth week
          },
        },
      }

      // Fourth Monday of September 2024 is September 23rd
      const fourthMondaySep = new Date(2024, 8, 23)
      const plans = getPlansIntersectingDay(fourthMondaySep, [plan])
      expect(plans).toHaveLength(1)
    })

    it('should properly handle last Friday of months with different lengths', () => {
      const plan: RecurringPlan = {
        id: '1',
        startDate: new Date(2024, 0, 26), // January 26, 2024 (last Friday)
        minutes: 60,
        recurrence: {
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          interval: 1,
          endDate: null,
          monthlyByWeekdayConfig: {
            weekday: 5, // Friday
            weekOfMonth: -1, // Last week
          },
        },
      }

      // Last Friday of February 2024 is February 23rd
      const lastFridayFeb = new Date(2024, 1, 23)
      const februaryPlans = getPlansIntersectingDay(lastFridayFeb, [plan])
      expect(februaryPlans).toHaveLength(1)

      // Last Friday of March 2024 is March 29th
      const lastFridayMarch = new Date(2024, 2, 29)
      const marchPlans = getPlansIntersectingDay(lastFridayMarch, [plan])
      expect(marchPlans).toHaveLength(1)

      // March 22nd is fourth Friday, should NOT match
      const fourthFridayMarch = new Date(2024, 2, 22)
      const noPlans = getPlansIntersectingDay(fourthFridayMarch, [plan])
      expect(noPlans).toHaveLength(0)
    })
  })
})
