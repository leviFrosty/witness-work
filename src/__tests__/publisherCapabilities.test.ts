import { describe, it, expect } from 'vitest'
import {
  derivePublisherCapabilities,
  getTenureType,
} from '@/lib/publisherCapabilities'
import type { Publisher } from '@/types/publisher'

const baseInput = {
  publisherHours: {
    publisher: 0,
    regularAuxiliary: 30,
    regularPioneer: 50,
    circuitOverseer: 50,
    specialPioneer: 100,
    custom: 50,
  },
  userSpecifiedHasAnnualGoal: 'default' as boolean | 'default',
  milestoneOverrides: null as number[] | null,
  overrideCreditLimit: false,
  customCreditLimitHours: 55,
}

const derive = (
  publisher: Publisher,
  overrides: Partial<typeof baseInput> = {}
) => derivePublisherCapabilities({ publisher, ...baseInput, ...overrides })

describe('derivePublisherCapabilities', () => {
  describe('entryMode', () => {
    it("is 'checkbox' for the regular publisher role", () => {
      expect(derive('publisher').entryMode).toBe('checkbox')
    })

    it("is 'hours' for every other role", () => {
      expect(derive('regularAuxiliary').entryMode).toBe('hours')
      expect(derive('regularPioneer').entryMode).toBe('hours')
      expect(derive('circuitOverseer').entryMode).toBe('hours')
      expect(derive('specialPioneer').entryMode).toBe('hours')
      expect(derive('custom').entryMode).toBe('hours')
    })
  })

  describe('creditCapMinutes (no user override)', () => {
    it('is unlimited (null) for special pioneers and circuit overseers', () => {
      expect(derive('specialPioneer').creditCapMinutes).toBeNull()
      expect(derive('circuitOverseer').creditCapMinutes).toBeNull()
    })

    it('is the default 55-hour cap (3300 min) for every other role', () => {
      expect(derive('publisher').creditCapMinutes).toBe(55 * 60)
      expect(derive('regularAuxiliary').creditCapMinutes).toBe(55 * 60)
      expect(derive('regularPioneer').creditCapMinutes).toBe(55 * 60)
      expect(derive('custom').creditCapMinutes).toBe(55 * 60)
    })
  })

  describe('creditCapMinutes (user override)', () => {
    it('respects an enabled override with positive hours', () => {
      const caps = derive('regularPioneer', {
        overrideCreditLimit: true,
        customCreditLimitHours: 80,
      })
      expect(caps.creditCapMinutes).toBe(80 * 60)
    })

    it('treats an enabled override of 0 hours as unlimited', () => {
      const caps = derive('publisher', {
        overrideCreditLimit: true,
        customCreditLimitHours: 0,
      })
      expect(caps.creditCapMinutes).toBeNull()
    })

    it('overrides the role default — even for special pioneer', () => {
      const caps = derive('specialPioneer', {
        overrideCreditLimit: true,
        customCreditLimitHours: 40,
      })
      expect(caps.creditCapMinutes).toBe(40 * 60)
    })

    it('falls back to the role default when override is disabled', () => {
      const caps = derive('regularPioneer', {
        overrideCreditLimit: false,
        customCreditLimitHours: 80,
      })
      expect(caps.creditCapMinutes).toBe(55 * 60)
    })
  })

  describe('goal hours', () => {
    it('reads monthlyGoalHours from the publisherHours table for the role', () => {
      expect(derive('publisher').monthlyGoalHours).toBe(0)
      expect(derive('regularAuxiliary').monthlyGoalHours).toBe(30)
      expect(derive('regularPioneer').monthlyGoalHours).toBe(50)
      expect(derive('specialPioneer').monthlyGoalHours).toBe(100)
    })

    it('honors a custom monthlyGoalHours value for the custom role', () => {
      const caps = derive('custom', {
        publisherHours: { ...baseInput.publisherHours, custom: 70 },
      })
      expect(caps.monthlyGoalHours).toBe(70)
    })

    it('annualGoalHours equals monthlyGoalHours * 12', () => {
      expect(derive('regularPioneer').annualGoalHours).toBe(50 * 12)
      expect(derive('specialPioneer').annualGoalHours).toBe(100 * 12)
      expect(derive('publisher').annualGoalHours).toBe(0)
    })
  })

  describe('hasAnnualGoal', () => {
    it("uses the role default when user setting is 'default'", () => {
      // Roles whose default is true
      expect(derive('regularPioneer').hasAnnualGoal).toBe(true)
      expect(derive('circuitOverseer').hasAnnualGoal).toBe(true)
      expect(derive('custom').hasAnnualGoal).toBe(true)
      // Roles whose default is false
      expect(derive('publisher').hasAnnualGoal).toBe(false)
      expect(derive('regularAuxiliary').hasAnnualGoal).toBe(false)
      expect(derive('specialPioneer').hasAnnualGoal).toBe(false)
    })

    it('honors a user override of true', () => {
      const caps = derive('publisher', { userSpecifiedHasAnnualGoal: true })
      expect(caps.hasAnnualGoal).toBe(true)
    })

    it('honors a user override of false', () => {
      const caps = derive('regularPioneer', {
        userSpecifiedHasAnnualGoal: false,
      })
      expect(caps.hasAnnualGoal).toBe(false)
    })
  })

  describe('isInFullTimeService', () => {
    it('is true for regular pioneer, special pioneer, and circuit overseer', () => {
      expect(derive('regularPioneer').isInFullTimeService).toBe(true)
      expect(derive('specialPioneer').isInFullTimeService).toBe(true)
      expect(derive('circuitOverseer').isInFullTimeService).toBe(true)
    })

    it('is false for roles outside full-time service', () => {
      expect(derive('publisher').isInFullTimeService).toBe(false)
      expect(derive('regularAuxiliary').isInFullTimeService).toBe(false)
      expect(derive('custom').isInFullTimeService).toBe(false)
    })
  })

  describe('tracksTenure', () => {
    it('is true for pioneer-class roles and regular auxiliary', () => {
      expect(derive('regularPioneer').tracksTenure).toBe(true)
      expect(derive('specialPioneer').tracksTenure).toBe(true)
      expect(derive('circuitOverseer').tracksTenure).toBe(true)
      expect(derive('regularAuxiliary').tracksTenure).toBe(true)
    })

    it('is false for plain publisher and custom roles', () => {
      expect(derive('publisher').tracksTenure).toBe(false)
      expect(derive('custom').tracksTenure).toBe(false)
    })
  })

  describe('hours-mode affordances', () => {
    it('hides timer and year tabs for the checkbox-mode role', () => {
      const caps = derive('publisher')
      expect(caps.showsTimer).toBe(false)
      expect(caps.showsYearTabs).toBe(false)
    })

    it('shows timer and year tabs for every hours-mode role', () => {
      for (const role of [
        'regularAuxiliary',
        'regularPioneer',
        'specialPioneer',
        'circuitOverseer',
        'custom',
      ] as const) {
        const caps = derive(role)
        expect(caps.showsTimer).toBe(true)
        expect(caps.showsYearTabs).toBe(true)
      }
    })
  })

  describe('milestones', () => {
    it('always ends the milestone ladder at the annual goal', () => {
      const caps = derive('regularPioneer')
      expect(caps.milestones[caps.milestones.length - 1]).toBe(50 * 12)
    })

    it('honors a milestoneOverrides list when provided', () => {
      const caps = derive('regularPioneer', {
        milestoneOverrides: [100, 200, 300],
      })
      // overrides are filtered to <= annualGoalHours and the goal is appended
      expect(caps.milestones).toContain(100)
      expect(caps.milestones).toContain(200)
      expect(caps.milestones).toContain(300)
      expect(caps.milestones[caps.milestones.length - 1]).toBe(50 * 12)
    })
  })

  describe('tenureType', () => {
    it("is 'fullTimeService' for the three full-time roles", () => {
      expect(derive('regularPioneer').tenureType).toBe('fullTimeService')
      expect(derive('specialPioneer').tenureType).toBe('fullTimeService')
      expect(derive('circuitOverseer').tenureType).toBe('fullTimeService')
    })

    it("is 'auxiliaryPioneer' for the regularAuxiliary role", () => {
      expect(derive('regularAuxiliary').tenureType).toBe('auxiliaryPioneer')
    })

    it('is null for roles that do not track a tenure clock', () => {
      expect(derive('publisher').tenureType).toBeNull()
      expect(derive('custom').tenureType).toBeNull()
    })
  })

  describe('hasUnlimitedCreditDefault', () => {
    it('is true for special pioneer and circuit overseer', () => {
      expect(derive('specialPioneer').hasUnlimitedCreditDefault).toBe(true)
      expect(derive('circuitOverseer').hasUnlimitedCreditDefault).toBe(true)
    })

    it('is false for every other role', () => {
      expect(derive('publisher').hasUnlimitedCreditDefault).toBe(false)
      expect(derive('regularAuxiliary').hasUnlimitedCreditDefault).toBe(false)
      expect(derive('regularPioneer').hasUnlimitedCreditDefault).toBe(false)
      expect(derive('custom').hasUnlimitedCreditDefault).toBe(false)
    })

    it("ignores the user's override (it's a base-role question)", () => {
      const caps = derive('specialPioneer', {
        overrideCreditLimit: true,
        customCreditLimitHours: 40,
      })
      expect(caps.hasUnlimitedCreditDefault).toBe(true)
    })
  })
})

describe('getTenureType', () => {
  it("maps every Full-Time Service role to 'fullTimeService'", () => {
    // Glossary: regular pioneer, special pioneer, and circuit overseer share
    // a single Tenure clock. Moving between any two of these roles keeps the
    // clock running — they all map to the same Tenure Type.
    expect(getTenureType('regularPioneer')).toBe('fullTimeService')
    expect(getTenureType('specialPioneer')).toBe('fullTimeService')
    expect(getTenureType('circuitOverseer')).toBe('fullTimeService')
  })

  it("maps regularAuxiliary to 'auxiliaryPioneer'", () => {
    expect(getTenureType('regularAuxiliary')).toBe('auxiliaryPioneer')
  })

  it('returns null for roles with no Tenure clock', () => {
    // Regular Publisher (`'publisher'`) and Custom track no tenure — a move
    // into either should clear the Tenure Start Date.
    expect(getTenureType('publisher')).toBeNull()
    expect(getTenureType('custom')).toBeNull()
  })
})
