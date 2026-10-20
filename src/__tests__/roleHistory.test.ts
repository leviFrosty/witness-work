import { describe, expect, it } from 'vitest'
import {
  addCalendarMonths,
  annualGoalHoursByMonth,
  annualGoalHoursForServiceYear,
  laterRoleReplacedFrom,
  normalizeRoleHistory,
  publisherCapabilitiesForMonth,
  roleForMonth,
  serviceYearFocusMonth,
  setRoleForPeriod,
  standingRole,
  type RolePreferences,
} from '@/lib/roleHistory'
import type { PublisherHours } from '@/types/publisher'

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

const sep2025 = { year: 2025, month: 8 }
const mar2026 = { year: 2026, month: 2 }
const apr2026 = { year: 2026, month: 3 }

describe('addCalendarMonths', () => {
  it('crosses year boundaries in both directions', () => {
    expect(addCalendarMonths({ year: 2025, month: 11 }, 1)).toEqual({
      year: 2026,
      month: 0,
    })
    expect(addCalendarMonths({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    })
    expect(addCalendarMonths(sep2025, 12)).toEqual({ year: 2026, month: 8 })
  })
})

describe('roleForMonth', () => {
  it('uses the current role when no history is recorded', () => {
    expect(roleForMonth(null, 'regularPioneer', sep2025)).toBe('regularPioneer')
  })

  it('uses the initial role before the first change and the latest change after', () => {
    const history = {
      initial: 'publisher' as const,
      changes: { '2025-09': 'regularPioneer' as const },
    }
    expect(
      roleForMonth(history, 'regularPioneer', { year: 2025, month: 7 })
    ).toBe('publisher')
    expect(roleForMonth(history, 'regularPioneer', sep2025)).toBe(
      'regularPioneer'
    )
    expect(roleForMonth(history, 'regularPioneer', mar2026)).toBe(
      'regularPioneer'
    )
  })
})

describe('setRoleForPeriod', () => {
  it('records a standing change and keeps earlier months', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      sep2025,
      null,
      'regularPioneer'
    )
    expect(history).toEqual({
      initial: 'publisher',
      changes: { '2025-09': 'regularPioneer' },
    })
    expect(standingRole(history, 'publisher')).toBe('regularPioneer')
  })

  it('records a one-off month that returns to the surrounding role', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      mar2026,
      'regularAuxiliary'
    )
    expect(history).toEqual({
      initial: 'publisher',
      changes: { '2026-03': 'regularAuxiliary', '2026-04': 'publisher' },
    })
    expect(roleForMonth(history, 'publisher', mar2026)).toBe('regularAuxiliary')
    expect(roleForMonth(history, 'publisher', apr2026)).toBe('publisher')
    expect(standingRole(history, 'publisher')).toBe('publisher')
  })

  it('collapses back to no history when a one-off month is undone', () => {
    const withAux = setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      mar2026,
      'regularAuxiliary'
    )
    expect(
      setRoleForPeriod(withAux, 'publisher', mar2026, mar2026, 'publisher')
    ).toBeNull()
  })

  it('a standing change replaces later changes', () => {
    const withAux = setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      mar2026,
      'regularAuxiliary'
    )
    const history = setRoleForPeriod(
      withAux,
      'publisher',
      sep2025,
      null,
      'regularPioneer'
    )
    expect(history).toEqual({
      initial: 'publisher',
      changes: { '2025-09': 'regularPioneer' },
    })
  })

  it('a range keeps the role of the months after it', () => {
    const pioneer = setRoleForPeriod(
      null,
      'publisher',
      sep2025,
      null,
      'regularPioneer'
    )
    const history = setRoleForPeriod(
      pioneer,
      'regularPioneer',
      { year: 2025, month: 6 },
      { year: 2025, month: 7 },
      'regularAuxiliary'
    )
    expect(
      roleForMonth(history, 'regularPioneer', { year: 2025, month: 5 })
    ).toBe('publisher')
    expect(
      roleForMonth(history, 'regularPioneer', { year: 2025, month: 7 })
    ).toBe('regularAuxiliary')
    expect(roleForMonth(history, 'regularPioneer', sep2025)).toBe(
      'regularPioneer'
    )
  })

  it('rejects a period that ends before it starts', () => {
    expect(() =>
      setRoleForPeriod(null, 'publisher', apr2026, mar2026, 'regularAuxiliary')
    ).toThrow(RangeError)
  })
})

describe('normalizeRoleHistory', () => {
  it('drops malformed keys, unknown roles, and redundant changes', () => {
    expect(
      normalizeRoleHistory({
        initial: 'publisher',
        changes: {
          '2025-09': 'regularPioneer',
          '2025-10': 'regularPioneer',
          '2025-13': 'publisher',
          nope: 'publisher',
          '2026-01': 'wizard',
        },
      })
    ).toEqual({
      initial: 'publisher',
      changes: { '2025-09': 'regularPioneer' },
    })
  })

  it('rejects shapes it cannot read', () => {
    expect(normalizeRoleHistory(null)).toBeNull()
    expect(normalizeRoleHistory([])).toBeNull()
    expect(normalizeRoleHistory({ initial: 'wizard', changes: {} })).toBeNull()
    expect(normalizeRoleHistory({ initial: 'publisher' })).toBeNull()
  })
})

describe('annualGoalHoursForServiceYear', () => {
  const base = {
    publisherHours,
    userSpecifiedHasAnnualGoal: 'default' as const,
    serviceYear: 2025,
  }

  it('is the monthly goal × 12 without a history', () => {
    expect(
      annualGoalHoursForServiceYear({
        ...base,
        history: null,
        currentRole: 'regularPioneer',
      })
    ).toBe(600)
  })

  it('prorates a pioneer appointed mid Service Year', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      null,
      'regularPioneer'
    )
    // March through August: six pioneer months.
    expect(
      annualGoalHoursForServiceYear({
        ...base,
        history,
        currentRole: 'regularPioneer',
      })
    ).toBe(300)
  })

  it('leaves auxiliary months out of a pioneer Annual Goal', () => {
    const pioneer = setRoleForPeriod(
      null,
      'publisher',
      sep2025,
      null,
      'regularPioneer'
    )
    const history = setRoleForPeriod(
      pioneer,
      'regularPioneer',
      mar2026,
      mar2026,
      'regularAuxiliary'
    )
    expect(
      annualGoalHoursForServiceYear({
        ...base,
        history,
        currentRole: 'regularPioneer',
      })
    ).toBe(550)
  })
})

describe('annualGoalHoursByMonth', () => {
  const base = {
    publisherHours,
    userSpecifiedHasAnnualGoal: 'default' as const,
    serviceYear: 2025,
  }

  it("splits the Annual Goal into each month's share, September first", () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      null,
      'regularPioneer'
    )
    const input = { ...base, history, currentRole: 'regularPioneer' as const }
    const shares = annualGoalHoursByMonth(input)

    // Sep–Feb as a publisher, Mar–Aug as a pioneer.
    expect(shares).toEqual([0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(
      annualGoalHoursForServiceYear(input)
    )
  })

  it('gives an auxiliary month no share of a pioneer Annual Goal', () => {
    const pioneer = setRoleForPeriod(
      null,
      'publisher',
      sep2025,
      null,
      'regularPioneer'
    )
    const history = setRoleForPeriod(
      pioneer,
      'regularPioneer',
      mar2026,
      mar2026,
      'regularAuxiliary'
    )
    expect(
      annualGoalHoursByMonth({
        ...base,
        history,
        currentRole: 'regularPioneer',
      })
    ).toEqual([50, 50, 50, 50, 50, 50, 0, 50, 50, 50, 50, 50])
  })

  it("is the role's monthly goal every month without a history", () => {
    expect(
      annualGoalHoursByMonth({
        ...base,
        history: null,
        currentRole: 'regularPioneer',
      })
    ).toEqual(Array(12).fill(50))
  })
})

describe('publisherCapabilitiesForMonth', () => {
  const prefs: RolePreferences = {
    role: 'regularPioneer',
    roleHistory: setRoleForPeriod(
      null,
      'publisher',
      mar2026,
      null,
      'regularPioneer'
    ),
    publisherHours,
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    logsHours: false,
  }

  it('reports a Regular Publisher month as a checkbox month', () => {
    const february = publisherCapabilitiesForMonth(prefs, {
      year: 2026,
      month: 1,
    })
    expect(february.type).toBe('publisher')
    expect(february.entryMode).toBe('checkbox')
    expect(february.monthlyGoalHours).toBe(0)
  })

  it('reports a pioneer month in hours with the prorated Annual Goal', () => {
    const april = publisherCapabilitiesForMonth(prefs, apr2026)
    expect(april.type).toBe('regularPioneer')
    expect(april.entryMode).toBe('hours')
    expect(april.annualGoalHours).toBe(300)
    expect(april.milestones.at(-1)).toBe(300)
  })
})

describe('a status set ahead for next month', () => {
  // Today is October 2026; November is next month.
  const oct2026 = { year: 2026, month: 9 }
  const nov2026 = { year: 2026, month: 10 }
  const dec2026 = { year: 2026, month: 11 }
  const prefsWith = (
    role: RolePreferences['role'],
    roleHistory: RolePreferences['roleHistory']
  ): RolePreferences => ({
    role,
    roleHistory,
    publisherHours,
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    logsHours: false,
  })

  it('applies a one-off next month without touching this month', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      nov2026,
      nov2026,
      'regularAuxiliary'
    )
    expect(roleForMonth(history, 'publisher', oct2026)).toBe('publisher')
    expect(roleForMonth(history, 'publisher', nov2026)).toBe('regularAuxiliary')
    expect(roleForMonth(history, 'publisher', dec2026)).toBe('publisher')
    expect(standingRole(history, 'publisher')).toBe('publisher')

    const prefs = prefsWith('publisher', history)
    const october = publisherCapabilitiesForMonth(prefs, oct2026)
    const november = publisherCapabilitiesForMonth(prefs, nov2026)
    expect(october.entryMode).toBe('checkbox')
    expect(october.monthlyGoalHours).toBe(0)
    expect(november.entryMode).toBe('hours')
    expect(november.monthlyGoalHours).toBe(30)
    expect(november.creditCapMinutes).toBe(55 * 60)
  })

  it('starts a standing role next month and keeps this month as it was', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      nov2026,
      null,
      'regularPioneer'
    )
    // The standing role is the one the timeline ends on.
    const role = standingRole(history, 'publisher')
    expect(role).toBe('regularPioneer')

    const prefs = prefsWith(role, history)
    expect(publisherCapabilitiesForMonth(prefs, oct2026).type).toBe('publisher')
    const november = publisherCapabilitiesForMonth(prefs, nov2026)
    expect(november.type).toBe('regularPioneer')
    expect(november.monthlyGoalHours).toBe(50)
    // November through August of Service Year 2026: 10 pioneer months.
    expect(november.annualGoalHours).toBe(500)
  })

  it('names a next month that "onward" from this month would replace', () => {
    const history = setRoleForPeriod(
      null,
      'publisher',
      nov2026,
      nov2026,
      'regularAuxiliary'
    )
    expect(laterRoleReplacedFrom(history, oct2026, 'regularPioneer')).toEqual({
      month: nov2026,
      role: 'regularAuxiliary',
    })
    // Saving it replaces November's auxiliary month.
    const after = setRoleForPeriod(
      history,
      'publisher',
      oct2026,
      null,
      'regularPioneer'
    )
    expect(roleForMonth(after, 'publisher', nov2026)).toBe('regularPioneer')
  })

  it('names the first later month whose role would change', () => {
    const history = setRoleForPeriod(
      setRoleForPeriod(null, 'publisher', nov2026, null, 'regularAuxiliary'),
      'publisher',
      dec2026,
      null,
      'regularPioneer'
    )
    // November already matches, so December is the month that changes.
    expect(laterRoleReplacedFrom(history, oct2026, 'regularAuxiliary')).toEqual(
      { month: dec2026, role: 'regularPioneer' }
    )
  })

  it('names nothing when no later month has its own status', () => {
    expect(laterRoleReplacedFrom(null, oct2026, 'regularPioneer')).toBeNull()
    const history = setRoleForPeriod(
      null,
      'publisher',
      oct2026,
      null,
      'regularPioneer'
    )
    expect(
      laterRoleReplacedFrom(history, oct2026, 'regularAuxiliary')
    ).toBeNull()
    expect(laterRoleReplacedFrom(history, nov2026, 'publisher')).toBeNull()
    // An earlier change isn't replaced by "onward" from a later month.
    expect(
      laterRoleReplacedFrom(history, dec2026, 'regularAuxiliary')
    ).toBeNull()
  })
})

describe('serviceYearFocusMonth', () => {
  it('uses this month for the running Service Year and August otherwise', () => {
    const now = new Date(2026, 2, 15)
    expect(serviceYearFocusMonth(2025, now)).toEqual(mar2026)
    expect(serviceYearFocusMonth(2024, now)).toEqual({ year: 2025, month: 7 })
  })
})
