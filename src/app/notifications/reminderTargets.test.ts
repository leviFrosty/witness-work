import { describe, expect, it, vi } from 'vitest'
import type * as Notifications from 'expo-notifications'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: { isReady: () => true, navigate },
}))
vi.mock('@/lib/currentServiceStreak', () => ({
  currentServiceStreak: vi.fn(),
}))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [] }) },
}))
vi.mock('@/stores/conversationStore', () => ({
  default: { getState: () => ({ conversations: [] }) },
}))
vi.mock('@/stores/serviceReport', () => ({
  default: {
    getState: () => ({ dayPlans: [], recurringPlans: [], serviceReports: {} }),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { openReminderTarget } from '@/app/notifications/reminderTargets'
import { reminderData } from '@/lib/notificationData'

describe('an invitation to plan next week', () => {
  it("opens the Schedule at the week's month", () => {
    expect(openReminderTarget({ kind: 'weekPlan', id: '2026-11-01' })).toBe(
      true
    )
    expect(navigate).toHaveBeenCalledWith(
      'Root',
      { screen: 'Schedule', params: { month: 10, year: 2026 } },
      { pop: true }
    )
  })

  it('falls back to the tray for an unreadable week', () => {
    navigate.mockClear()
    expect(openReminderTarget({ kind: 'weekPlan', id: 'week' })).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('reads its tap data back from the notification', () => {
    const notification = {
      request: {
        content: { data: { reminder: { kind: 'weekPlan', id: '2026-11-01' } } },
      },
    } as unknown as Notifications.Notification
    expect(reminderData(notification)).toEqual({
      kind: 'weekPlan',
      id: '2026-11-01',
    })
  })
})
