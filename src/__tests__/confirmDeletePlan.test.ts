import { beforeEach, describe, expect, it, vi } from 'vitest'

const alert = vi.hoisted(() => vi.fn())
const store = vi.hoisted(() => ({
  deleteDayPlan: vi.fn(),
  deleteRecurringPlan: vi.fn(),
  deleteSingleEventFromRecurringPlan: vi.fn(),
  deleteEventAndFutureEvents: vi.fn(),
}))

vi.mock('react-native', () => ({ Alert: { alert } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/serviceReport', () => ({
  default: { getState: () => store },
}))

import confirmDeletePlan, {
  confirmDeletePlanScope,
  deletePlan,
} from '@/lib/confirmDeletePlan'

type AlertButton = { text: string; onPress?: () => void }
const buttons = () => alert.mock.lastCall![2] as AlertButton[]

describe('confirmDeletePlan', () => {
  beforeEach(() => vi.clearAllMocks())

  const date = new Date(2026, 8, 28)

  it('removes a Day Plan, whatever the scope', () => {
    deletePlan({ kind: 'day', planId: 'd1' }, 'instance')
    expect(store.deleteDayPlan).toHaveBeenCalledWith('d1')
  })

  it('removes the chosen occurrences of a recurring plan', () => {
    const target = { kind: 'recurring' as const, planId: 'r1', date }
    deletePlan(target, 'instance')
    expect(store.deleteSingleEventFromRecurringPlan).toHaveBeenCalledWith(
      'r1',
      date
    )
    deletePlan(target, 'future')
    expect(store.deleteEventAndFutureEvents).toHaveBeenCalledWith('r1', date)
    deletePlan(target)
    expect(store.deleteRecurringPlan).toHaveBeenCalledWith('r1')
  })

  it('asks which occurrences for a recurring plan', () => {
    const onDelete = vi.fn()
    confirmDeletePlan({ recurring: true, onDelete })
    expect(buttons().map((b) => b.text)).toEqual([
      'cancel',
      'deleteThisPlan',
      'deleteThisAndFollowingPlans',
      'deleteAllPlans',
    ])
    buttons()[2].onPress!()
    expect(onDelete).toHaveBeenCalledWith('future')
  })

  it('confirms a scope picked from a menu with a button naming it', () => {
    const onDelete = vi.fn()
    confirmDeletePlanScope({ scope: 'all', onDelete })
    expect(buttons().map((b) => b.text)).toEqual(['cancel', 'deleteAllPlans'])
    expect(onDelete).not.toHaveBeenCalled()
    buttons()[1].onPress!()
    expect(onDelete).toHaveBeenCalledWith('all')
  })
})
