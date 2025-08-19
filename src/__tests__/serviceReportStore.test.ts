import moment from 'moment'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import useServiceReport from '../stores/serviceReport'
import {
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
} from '../lib/serviceReport'

// Type for the result of getRecurringPlanForDate
type RecurringPlanWithOverrideInfo = RecurringPlan &
  (
    | { isOverride: false }
    | { isOverride: true; originalMinutes: number; originalNote?: string }
  )

// Mock the MMKV storage to avoid dependencies in tests
vi.mock('../stores/mmkv', () => ({
  hasMigratedFromAsyncStorage: () => true,
  MmkvStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}))

describe('ServiceReport Store - Override Functionality', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useServiceReport.getState()._WARNING_forceDeleteRecurringPlans()
  })

  describe('addRecurringPlanOverride', () => {
    it('should add an override to a recurring plan', () => {
      const { addRecurringPlan, addRecurringPlanOverride } =
        useServiceReport.getState()

      // First create a recurring plan
      const basePlan = {
        id: 'test-plan-1',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      // Add an override
      const override: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 180,
        note: 'Override note',
      }

      addRecurringPlanOverride('test-plan-1', override)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-1')

      expect(updatedPlan).toBeDefined()
      expect(updatedPlan!.overrides).toHaveLength(1)
      expect(updatedPlan!.overrides![0]).toEqual(override)
    })

    it('should replace existing override on same date', () => {
      const { addRecurringPlan, addRecurringPlanOverride } =
        useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-2',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()

      // Add first override
      const firstOverride: RecurringPlanOverride = {
        date: testDate,
        minutes: 180,
        note: 'First override',
      }
      addRecurringPlanOverride('test-plan-2', firstOverride)

      // Add second override on same date
      const secondOverride: RecurringPlanOverride = {
        date: testDate,
        minutes: 240,
        note: 'Second override',
      }
      addRecurringPlanOverride('test-plan-2', secondOverride)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-2')

      expect(updatedPlan!.overrides).toHaveLength(1)
      expect(updatedPlan!.overrides![0]).toEqual(secondOverride)
    })

    it('should not affect non-matching plans', () => {
      const { addRecurringPlan, addRecurringPlanOverride } =
        useServiceReport.getState()

      const plan1 = {
        id: 'test-plan-1',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      const plan2 = {
        id: 'test-plan-2',
        startDate: moment('2024-01-02').toDate(),
        minutes: 90,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(plan1)
      addRecurringPlan(plan2)

      const override: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 180,
      }

      addRecurringPlanOverride('test-plan-1', override)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan1 = updatedPlans.find((p) => p.id === 'test-plan-1')
      const updatedPlan2 = updatedPlans.find((p) => p.id === 'test-plan-2')

      expect(updatedPlan1!.overrides).toHaveLength(1)
      expect(updatedPlan2!.overrides).toBeUndefined()
    })
  })

  describe('updateRecurringPlanOverride', () => {
    it('should update an existing override', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        updateRecurringPlanOverride,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-3',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()
      const originalOverride: RecurringPlanOverride = {
        date: testDate,
        minutes: 180,
        note: 'Original note',
      }

      addRecurringPlanOverride('test-plan-3', originalOverride)

      const updatedOverride: RecurringPlanOverride = {
        date: testDate,
        minutes: 240,
        note: 'Updated note',
      }

      updateRecurringPlanOverride('test-plan-3', updatedOverride)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-3')

      expect(updatedPlan!.overrides).toHaveLength(1)
      expect(updatedPlan!.overrides![0]).toEqual(updatedOverride)
    })

    it('should not update non-matching overrides', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        updateRecurringPlanOverride,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-4',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const override1: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 180,
        note: 'First override',
      }

      const override2: RecurringPlanOverride = {
        date: moment('2024-01-15').toDate(),
        minutes: 90,
        note: 'Second override',
      }

      addRecurringPlanOverride('test-plan-4', override1)
      addRecurringPlanOverride('test-plan-4', override2)

      const updatedOverride: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 240,
        note: 'Updated first override',
      }

      updateRecurringPlanOverride('test-plan-4', updatedOverride)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-4')

      expect(updatedPlan!.overrides).toHaveLength(2)

      const firstOverride = updatedPlan!.overrides!.find((o) =>
        moment(o.date).isSame(moment('2024-01-08'), 'day')
      )
      const secondOverride = updatedPlan!.overrides!.find((o) =>
        moment(o.date).isSame(moment('2024-01-15'), 'day')
      )

      expect(firstOverride).toEqual(updatedOverride)
      expect(secondOverride).toEqual(override2) // Unchanged
    })
  })

  describe('removeRecurringPlanOverride', () => {
    it('should remove an override by date', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        removeRecurringPlanOverride,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-5',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const override: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 180,
        note: 'To be removed',
      }

      addRecurringPlanOverride('test-plan-5', override)

      // Verify override was added
      let updatedPlans = useServiceReport.getState().recurringPlans
      let updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-5')
      expect(updatedPlan!.overrides).toHaveLength(1)

      // Remove the override
      removeRecurringPlanOverride('test-plan-5', moment('2024-01-08').toDate())

      updatedPlans = useServiceReport.getState().recurringPlans
      updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-5')

      expect(updatedPlan!.overrides).toHaveLength(0)
    })

    it('should only remove the matching override', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        removeRecurringPlanOverride,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-6',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const override1: RecurringPlanOverride = {
        date: moment('2024-01-08').toDate(),
        minutes: 180,
        note: 'First override',
      }

      const override2: RecurringPlanOverride = {
        date: moment('2024-01-15').toDate(),
        minutes: 90,
        note: 'Second override',
      }

      addRecurringPlanOverride('test-plan-6', override1)
      addRecurringPlanOverride('test-plan-6', override2)

      // Remove only the first override
      removeRecurringPlanOverride('test-plan-6', moment('2024-01-08').toDate())

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find((p) => p.id === 'test-plan-6')

      expect(updatedPlan!.overrides).toHaveLength(1)
      expect(updatedPlan!.overrides![0]).toEqual(override2)
    })
  })

  describe('getRecurringPlanForDate', () => {
    it('should return plan with override data when override exists', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        getRecurringPlanForDate,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-7',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        note: 'Original note',
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()
      const override: RecurringPlanOverride = {
        date: testDate,
        minutes: 180,
        note: 'Override note',
      }

      addRecurringPlanOverride('test-plan-7', override)

      const result = getRecurringPlanForDate('test-plan-7', testDate)

      expect(result).toBeDefined()
      expect(result!.minutes).toBe(180) // Override minutes
      expect(result!.note).toBe('Override note') // Override note
      expect(result!.isOverride).toBe(true)
      if (result!.isOverride) {
        expect(
          (result as RecurringPlanWithOverrideInfo & { isOverride: true })
            .originalMinutes
        ).toBe(120) // Original minutes
        expect(
          (result as RecurringPlanWithOverrideInfo & { isOverride: true })
            .originalNote
        ).toBe('Original note') // Original note
      }
    })

    it('should return plan without override data when no override exists', () => {
      const { addRecurringPlan, getRecurringPlanForDate } =
        useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-8',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        note: 'Original note',
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()
      const result = getRecurringPlanForDate('test-plan-8', testDate)

      expect(result).toBeDefined()
      expect(result!.minutes).toBe(120) // Original minutes
      expect(result!.note).toBe('Original note') // Original note
      expect(result!.isOverride).toBe(false)
      expect('originalMinutes' in result!).toBe(false)
      expect('originalNote' in result!).toBe(false)
    })

    it('should return null for non-existent plan', () => {
      const { getRecurringPlanForDate } = useServiceReport.getState()

      const testDate = moment('2024-01-08').toDate()
      const result = getRecurringPlanForDate('non-existent-plan', testDate)

      expect(result).toBeNull()
    })

    it('should handle plans with undefined note fields', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        getRecurringPlanForDate,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'test-plan-9',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        // note is undefined
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()
      const override: RecurringPlanOverride = {
        date: testDate,
        minutes: 180,
        // note is undefined
      }

      addRecurringPlanOverride('test-plan-9', override)

      const result = getRecurringPlanForDate('test-plan-9', testDate)

      expect(result).toBeDefined()
      expect(result!.minutes).toBe(180)
      expect(result!.note).toBeUndefined()
      expect(result!.isOverride).toBe(true)
      if (result!.isOverride) {
        expect(
          (result as RecurringPlanWithOverrideInfo & { isOverride: true })
            .originalMinutes
        ).toBe(120)
        expect(
          (result as RecurringPlanWithOverrideInfo & { isOverride: true })
            .originalNote
        ).toBeUndefined()
      }
    })
  })

  describe('restoreRecurringPlanInstance', () => {
    it('should restore a deleted instance', () => {
      const {
        addRecurringPlan,
        deleteSingleEventFromRecurringPlan,
        restoreRecurringPlanInstance,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'restore-test-plan',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()

      // Delete an instance
      deleteSingleEventFromRecurringPlan('restore-test-plan', testDate)

      // Verify it's deleted
      let updatedPlans = useServiceReport.getState().recurringPlans
      let updatedPlan = updatedPlans.find((p) => p.id === 'restore-test-plan')
      expect(updatedPlan!.deletedDates).toHaveLength(1)
      expect(updatedPlan!.deletedDates![0]).toEqual(testDate)

      // Restore the instance
      restoreRecurringPlanInstance('restore-test-plan', testDate)

      // Verify it's restored
      updatedPlans = useServiceReport.getState().recurringPlans
      updatedPlan = updatedPlans.find((p) => p.id === 'restore-test-plan')
      expect(updatedPlan!.deletedDates).toHaveLength(0)
    })

    it('should only restore the matching deleted instance', () => {
      const {
        addRecurringPlan,
        deleteSingleEventFromRecurringPlan,
        restoreRecurringPlanInstance,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'restore-test-plan-2',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const date1 = moment('2024-01-08').toDate()
      const date2 = moment('2024-01-15').toDate()

      // Delete multiple instances
      deleteSingleEventFromRecurringPlan('restore-test-plan-2', date1)
      deleteSingleEventFromRecurringPlan('restore-test-plan-2', date2)

      // Verify both are deleted
      let updatedPlans = useServiceReport.getState().recurringPlans
      let updatedPlan = updatedPlans.find((p) => p.id === 'restore-test-plan-2')
      expect(updatedPlan!.deletedDates).toHaveLength(2)

      // Restore only the first instance
      restoreRecurringPlanInstance('restore-test-plan-2', date1)

      // Verify only the first is restored, second remains deleted
      updatedPlans = useServiceReport.getState().recurringPlans
      updatedPlan = updatedPlans.find((p) => p.id === 'restore-test-plan-2')
      expect(updatedPlan!.deletedDates).toHaveLength(1)
      expect(
        updatedPlan!.deletedDates!.some((d) => moment(d).isSame(date2, 'day'))
      ).toBe(true)
      expect(
        updatedPlan!.deletedDates!.some((d) => moment(d).isSame(date1, 'day'))
      ).toBe(false)
    })

    it('should not affect plans that do not match', () => {
      const {
        addRecurringPlan,
        deleteSingleEventFromRecurringPlan,
        restoreRecurringPlanInstance,
      } = useServiceReport.getState()

      const plan1 = {
        id: 'restore-test-plan-3a',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      const plan2 = {
        id: 'restore-test-plan-3b',
        startDate: moment('2024-01-02').toDate(),
        minutes: 90,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(plan1)
      addRecurringPlan(plan2)

      const testDate = moment('2024-01-08').toDate()

      // Delete instance from both plans
      deleteSingleEventFromRecurringPlan('restore-test-plan-3a', testDate)
      deleteSingleEventFromRecurringPlan('restore-test-plan-3b', testDate)

      // Restore instance only from first plan
      restoreRecurringPlanInstance('restore-test-plan-3a', testDate)

      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan1 = updatedPlans.find(
        (p) => p.id === 'restore-test-plan-3a'
      )
      const updatedPlan2 = updatedPlans.find(
        (p) => p.id === 'restore-test-plan-3b'
      )

      // First plan should be restored, second should remain deleted
      expect(updatedPlan1!.deletedDates).toHaveLength(0)
      expect(updatedPlan2!.deletedDates).toHaveLength(1)
    })

    it('should handle restoring non-existent deleted instances gracefully', () => {
      const { addRecurringPlan, restoreRecurringPlanInstance } =
        useServiceReport.getState()

      const basePlan = {
        id: 'restore-test-plan-4',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      const testDate = moment('2024-01-08').toDate()

      // Try to restore a date that was never deleted
      restoreRecurringPlanInstance('restore-test-plan-4', testDate)

      // Should not cause any issues (may initialize as empty array)
      const updatedPlans = useServiceReport.getState().recurringPlans
      const updatedPlan = updatedPlans.find(
        (p) => p.id === 'restore-test-plan-4'
      )
      expect(updatedPlan!.deletedDates || []).toHaveLength(0)
    })
  })

  describe('Integration tests', () => {
    it('should handle complex override scenarios', () => {
      const {
        addRecurringPlan,
        addRecurringPlanOverride,
        updateRecurringPlanOverride,
        removeRecurringPlanOverride,
        getRecurringPlanForDate,
      } = useServiceReport.getState()

      const basePlan = {
        id: 'integration-test-plan',
        startDate: moment('2024-01-01').toDate(),
        minutes: 120,
        note: 'Original plan',
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      }

      addRecurringPlan(basePlan)

      // Add multiple overrides
      const dates = [
        moment('2024-01-08').toDate(),
        moment('2024-01-15').toDate(),
        moment('2024-01-22').toDate(),
      ]

      const overrides: RecurringPlanOverride[] = [
        { date: dates[0], minutes: 180, note: 'First override' },
        { date: dates[1], minutes: 90, note: 'Second override' },
        { date: dates[2], minutes: 240, note: 'Third override' },
      ]

      overrides.forEach((override) => {
        addRecurringPlanOverride('integration-test-plan', override)
      })

      // Verify all overrides exist
      dates.forEach((date, index) => {
        const result = getRecurringPlanForDate('integration-test-plan', date)
        expect(result!.isOverride).toBe(true)
        expect(result!.minutes).toBe(overrides[index].minutes)
        expect(result!.note).toBe(overrides[index].note)
      })

      // Update middle override
      const updatedOverride: RecurringPlanOverride = {
        date: dates[1],
        minutes: 150,
        note: 'Updated second override',
      }

      updateRecurringPlanOverride('integration-test-plan', updatedOverride)

      const updatedResult = getRecurringPlanForDate(
        'integration-test-plan',
        dates[1]
      )
      expect(updatedResult!.minutes).toBe(150)
      expect(updatedResult!.note).toBe('Updated second override')

      // Remove last override
      removeRecurringPlanOverride('integration-test-plan', dates[2])

      const removedResult = getRecurringPlanForDate(
        'integration-test-plan',
        dates[2]
      )
      expect(removedResult!.isOverride).toBe(false)
      expect(removedResult!.minutes).toBe(120) // Back to original

      // Verify other overrides still exist
      const firstResult = getRecurringPlanForDate(
        'integration-test-plan',
        dates[0]
      )
      expect(firstResult!.isOverride).toBe(true)
      expect(firstResult!.minutes).toBe(180)

      const secondResult = getRecurringPlanForDate(
        'integration-test-plan',
        dates[1]
      )
      expect(secondResult!.isOverride).toBe(true)
      expect(secondResult!.minutes).toBe(150)
    })
  })
})
