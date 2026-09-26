import { describe, expect, it } from 'vitest'
import {
  addCalendarMonths,
  annualGoalHoursForServiceYear,
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

describe('serviceYearFocusMonth', () => {
  it('uses this month for the running Service Year and August otherwise', () => {
    const now = new Date(2026, 2, 15)
    expect(serviceYearFocusMonth(2025, now)).toEqual(mar2026)
    expect(serviceYearFocusMonth(2024, now)).toEqual({ year: 2025, month: 7 })
  })
})
