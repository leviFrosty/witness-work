import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  },
}))

import { publisherChoices, publishers } from '@/constants/publisher'
import {
  AUXILIARY_REDUCED_GOAL_HOURS,
  monthStatusItems,
  monthStatuses,
  roleOfMonthStatus,
} from '@/lib/monthStatus'
import type { Publisher } from '@/types/publisher'

const publisherHours: Record<Publisher, number> = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 90,
  custom: 12,
}

describe('publisherChoices', () => {
  it('lists every Publisher role exactly once', () => {
    expect([...publisherChoices].sort()).toEqual([...publishers].sort())
  })
})

describe('monthStatuses', () => {
  it('lists the roles in the same order as Settings, plus the 15h auxiliary goal', () => {
    expect(monthStatuses).toEqual([
      'publisher',
      'regularAuxiliary',
      'regularAuxiliaryReduced',
      'regularPioneer',
      'specialPioneer',
      'circuitOverseer',
      'custom',
    ])
    expect([...new Set(monthStatuses.map(roleOfMonthStatus))]).toEqual([
      ...publisherChoices,
    ])
  })

  it('labels roles with the same names as Settings and auxiliary goals with their hours', () => {
    const labels = Object.fromEntries(
      monthStatusItems(publisherHours).map(({ value, label }) => [value, label])
    )
    for (const role of publisherChoices) {
      if (role === 'regularAuxiliary') continue
      expect(labels[role]).toBe(role)
    }
    expect(labels.regularAuxiliary).toBe('monthStatus.auxiliary:30')
    expect(labels.regularAuxiliaryReduced).toBe(
      `monthStatus.auxiliary:${AUXILIARY_REDUCED_GOAL_HOURS}`
    )
  })
})
