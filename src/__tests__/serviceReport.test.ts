import moment from 'moment'
import {
  calculateHoursRemaining,
  calculateProgress,
  getTimeAsMinutesForHourglass,
  serviceReportHoursPerMonthToGoal,
  totalHoursForCurrentMonth,
  totalHoursForSpecificMonth,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import { Publisher } from '../types/publisher'

describe('service report', () => {
  describe('calculateProgress', () => {
    it('should not return less than 0', () => {
      const progress = calculateProgress({ hours: -10, goalHours: 10 })
      expect(progress).toBe(0)
    })

    it('should not return more than 1', () => {
      const progress = calculateProgress({ hours: 1000, goalHours: 10 })
      expect(progress).toBe(1)
    })

    it('should return the percentage', () => {
      const progress = calculateProgress({ hours: 5, goalHours: 10 })
      expect(progress).toBe(0.5)
      const progressTwo = calculateProgress({ hours: 3, goalHours: 10 })
      expect(progressTwo).toBe(0.3)
    })
  })

  describe('calculateHoursRemaining', () => {
    it('should not return less than 0', () => {
      const hoursRemaining = calculateHoursRemaining({
        hours: 100,
        goalHours: 10,
      })
      expect(hoursRemaining).toBe(0)
    })

    it('should not return more than goalHours', () => {
      const hoursRemaining = calculateHoursRemaining({
        hours: 0,
        goalHours: 10,
      })
      expect(hoursRemaining).toBe(10)
    })

    it('should return the correct amount of hours remaining', () => {
      const hoursRemaining = calculateHoursRemaining({
        hours: 3,
        goalHours: 10,
      })
      expect(hoursRemaining).toBe(7)
    })
  })

  describe('totalHoursForCurrentMonth', () => {
    it('should return the number of hours in the month', () => {
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

      const hours = totalHoursForCurrentMonth(serviceReports)

      expect(hours).toBe(2)
    })

    it('should round down time to nearest hour', () => {
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
          minutes: 14,
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

      const hours = totalHoursForCurrentMonth(serviceReports)

      expect(hours).toBe(1)
    })

    it('should return 0 if no reports provided', () => {
      const serviceReports: ServiceReport[] = []

      const hours = totalHoursForCurrentMonth(serviceReports)

      expect(hours).toBe(0)
    })

    it('should not include hours from previous or upcoming months', () => {
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

      const hours = totalHoursForCurrentMonth(serviceReports)

      expect(hours).toBe(0)
    })
  })

  describe('totalHoursForSpecificMonth', () => {
    it('should return the number of hours in the month', () => {
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

      const thisMonthsHours = totalHoursForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(thisMonthsHours).toBe(2)
    })

    it('should round down time to nearest hour', () => {
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
          minutes: 14,
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

      const hours = totalHoursForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(hours).toBe(1)
    })

    it('should return 0 if no reports provided', () => {
      const serviceReports: ServiceReport[] = []

      const hours = totalHoursForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(hours).toBe(0)
    })

    it('should not include hours from previous or upcoming months', () => {
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

      const hours = totalHoursForSpecificMonth(
        serviceReports,
        moment().month(),
        moment().year()
      )

      expect(hours).toBe(1001)
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

    it('should return your hours as minutes if you are a non-publisher', () => {
      const publisher: Publisher = 'regularPioneer'

      const minutes = getTimeAsMinutesForHourglass(publisher, true, 10)

      expect(minutes).toBe(600)
    })

    it('should not return hours', () => {
      const publisher: Publisher = 'regularPioneer'

      const minutes = getTimeAsMinutesForHourglass(publisher, true, 10)

      expect(minutes).not.toBe(10)
    })
  })

  describe('serviceYearHoursPerMonthToGoal', () => {
    it('should be the publishers goal hours if 0 entries for year', () => {
      const serviceReports: ServiceReport[] = []

      const goalHours = 50

      const hoursPerMonthToGoal = serviceReportHoursPerMonthToGoal({
        serviceReports,
        currentDate: {
          month: 7,
          year: 2022,
        },
        goalHours: 50,
        serviceYear: 2022,
      })

      expect(hoursPerMonthToGoal).toBe(goalHours)
    })
  })
})
