import moment from 'moment'
import {
  RecurringPlan,
  RecurringPlanFrequencies,
  calculateMinutesRemaining,
  calculateProgress,
  getPlansIntersectingDay,
  getTimeAsMinutesForHourglass,
  getTotalMinutesForServiceYear,
  serviceReportHoursPerMonthToGoal,
  totalMinutesForCurrentMonth,
  totalMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import { Publisher } from '../types/publisher'

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

  describe('totalMinutesForCurrentMonth', () => {
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
      ]

      const minutes = totalMinutesForCurrentMonth(serviceReports)

      expect(minutes).toBe(2 * 60)
    })

    it('should return 0 if no reports provided', () => {
      const serviceReports: ServiceReport[] = []

      const minutes = totalMinutesForCurrentMonth(serviceReports)

      expect(minutes).toBe(0)
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
      ]

      const minutes = totalMinutesForCurrentMonth(serviceReports)

      expect(minutes).toBe(0)
    })
  })

  describe('totalMinutesForSpecificMonth', () => {
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
      ]

      const thisMonthsMinutes = totalMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(thisMonthsMinutes).toBe(2 * 60)
    })

    it('should return 0 if no reports provided', () => {
      const serviceReports: ServiceReport[] = []

      const minutes = totalMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(minutes).toBe(0)
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

      const minutes = totalMinutesForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(minutes).toBe(1001 * 60)
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
      const serviceReports: ServiceReport[] = []

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
      const serviceReports: ServiceReport[] = [
        {
          date: moment().month(8).year(2022).toDate(),
          hours: 25,
          id: '1',
          minutes: 0,
        },
      ]

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
      const serviceReports: ServiceReport[] = [
        {
          date: moment().month(8).year(2022).toDate(),
          hours: 50,
          id: '1',
          minutes: 0,
        },
      ]

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
      const serviceReports: ServiceReport[] = []

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
      const serviceReports: ServiceReport[] = [
        {
          date: moment().month(8).year(2022).toDate(),
          hours,
          id: '1',
          minutes: 0,
        },
      ]

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
      const serviceReports: ServiceReport[] = [
        {
          date: moment().month(8).year(2022).toDate(),
          hours: report1Hours,
          id: '1',
          minutes: 0,
        },
        {
          date: moment().month(7).year(2023).toDate(),
          hours: report2Hours,
          id: '2',
          minutes: 0,
        },
      ]

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
      const plans: RecurringPlan[] = [
        {
          id: '00',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(1, 'year').subtract(1, 'month').toDate(),
        },
        {
          id: '0',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(1, 'month').toDate(),
        },
        {
          id: '1',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '2',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '3',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(3, 'weeks').toDate(),
        },
        {
          id: '4',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '5',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(2, 'week').toDate(),
        },
      ]

      const intersectingPlans = getPlansIntersectingDay(
        moment().toDate(),
        plans
      )

      expect(intersectingPlans).toEqual(plans)
    })

    it('should not return plans that do not intersect with the day', () => {
      const plans: RecurringPlan[] = [
        {
          id: '00',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(1, 'year').subtract(1, 'month').toDate(),
        },
        {
          id: '0',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(1, 'month').toDate(),
        },
        {
          id: '1',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '2',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '3',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(3, 'weeks').toDate(),
        },
        {
          id: '4',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().toDate(),
        },
        {
          id: '5',
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.BI_WEEKLY,
            interval: 1,
            endDate: null,
          },
          startDate: moment().subtract(2, 'week').toDate(),
        },
      ]

      const intersectingPlans = getPlansIntersectingDay(
        moment().subtract(1, 'day').toDate(),
        plans
      )

      const containsNoneOfThePlans = intersectingPlans.every((plan) => {
        return !plans.includes(plan)
      })
      expect(containsNoneOfThePlans).toBe(true)
    })
  })

  describe('getTotalMinutesForServiceYear', () => {
    it('should not allow more than 50 hours per month of LDC for a single entry', () => {
      const year = 2023
      const reports: ServiceReport[] = [
        {
          minutes: 0,
          ldc: true,
          date: moment().year(year).month(10).toDate(),
          hours: 51,
          id: '0',
        },
      ]

      const minutes = getTotalMinutesForServiceYear(reports, year)
      expect(minutes).toBe(50 * 60)
    })
  })

  it('should not allow multiple entries to sum to more than 50', () => {
    const year = 2023
    const reports: ServiceReport[] = [
      {
        minutes: 0,
        ldc: true,
        date: moment().year(year).month(10).toDate(),
        hours: 25,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment().year(year).month(10).toDate(),
        hours: 26,
        id: '0',
      },
    ]

    const minutes = getTotalMinutesForServiceYear(reports, year)
    expect(minutes).toBe(50 * 60)
  })

  it('should properly add different months together, but not exceeding the ldc month cap', () => {
    const year = 2023
    const reports: ServiceReport[] = [
      {
        minutes: 0,
        ldc: true,
        date: moment().year(year).month(10).toDate(),
        hours: 25,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment().year(year).month(10).toDate(),
        hours: 26,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment().year(year).month(11).toDate(),
        hours: 10,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment()
          .year(year + 1)
          .month(0)
          .toDate(),
        hours: 10,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment()
          .year(year + 1)
          .month(1)
          .toDate(),
        hours: 25,
        id: '0',
      },
      {
        minutes: 0,
        ldc: true,
        date: moment()
          .year(year + 1)
          .month(1)
          .toDate(),
        hours: 500,
        id: '0',
      },
    ]

    const minutes = getTotalMinutesForServiceYear(reports, year)
    expect(minutes).toBe(120 * 60)
  })
})
