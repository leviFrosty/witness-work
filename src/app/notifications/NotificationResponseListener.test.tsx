import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  ready: false,
  initial: null as unknown,
  listener: undefined as undefined | ((response: unknown) => void),
  navigate: vi.fn(),
  openReminderTarget: vi.fn(() => true),
  requestTray: vi.fn(),
  markSeen: vi.fn(),
  sync: vi.fn(async () => {}),
  capture: vi.fn(),
  buddiesEnabled: true,
}))

vi.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  getLastNotificationResponse: () => runtime.initial,
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void
  ) => {
    runtime.listener = listener
    return { remove: vi.fn() }
  },
}))
vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: {
    isReady: () => runtime.ready,
    navigate: runtime.navigate,
  },
}))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => runtime.buddiesEnabled,
}))
vi.mock('@/features/buddies/hooks/useBuddyNotifications', () => ({
  syncBuddyNotifications: runtime.sync,
}))
vi.mock('@/features/notifications/stores/notificationsTray', () => ({
  markSeen: runtime.markSeen,
  requestNotificationsTray: runtime.requestTray,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [] }) },
}))
vi.mock('@/stores/conversationStore', () => ({
  default: { getState: () => ({ conversations: [] }) },
}))
vi.mock('@/stores/serviceReport', () => ({
  default: { getState: () => ({ dayPlans: [] }) },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({}) },
  DEFAULT_PLAN_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
}))
vi.mock('@/app/notifications/reminderTargets', () => ({
  openReminderTarget: runtime.openReminderTarget,
}))
vi.mock('@/app/notifications/useReminderNotifications', () => ({
  reminderTrayId: () => 'tray-id',
}))

import NotificationResponseListener from './NotificationResponseListener'

const response = (
  identifier: string,
  data: unknown,
  trigger: unknown = null
) => ({
  actionIdentifier: 'default',
  notification: {
    date: 1,
    request: { identifier, content: { data }, trigger },
  },
})

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  runtime.ready = false
  runtime.initial = null
  runtime.buddiesEnabled = true
  runtime.openReminderTarget.mockReturnValue(true)
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it('routes the tap that launched the app once navigation is ready', async () => {
  runtime.initial = response('launch', {
    reminder: { kind: 'visit', id: 'v', contactId: 'c' },
  })
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  expect(runtime.openReminderTarget).not.toHaveBeenCalled()
  runtime.ready = true
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(runtime.openReminderTarget).toHaveBeenCalledWith({
    kind: 'visit',
    id: 'v',
    contactId: 'c',
  })
  expect(runtime.capture).toHaveBeenCalledWith('notification_opened', {
    source: 'local',
    kind: 'visit',
    cold_start: true,
  })
})

it('does not replay an already-routed launch tap on remount', async () => {
  runtime.ready = true
  runtime.initial = response('replayed', {
    reminder: { kind: 'plan', id: 'p' },
  })
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  act(() => renderer?.unmount())
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  expect(runtime.openReminderTarget).toHaveBeenCalledTimes(1)
})

it("opens the tray when a reminder's record is gone", async () => {
  runtime.ready = true
  runtime.openReminderTarget.mockReturnValue(false)
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('gone', { reminder: { kind: 'contact', id: 'x' } })
    )
  })
  expect(runtime.navigate).toHaveBeenCalledWith('Root', { screen: 'Home' })
  expect(runtime.requestTray).toHaveBeenCalled()
})

it('syncs and opens the tray for a Buddies push', async () => {
  runtime.ready = true
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('push', undefined, {
        type: 'push',
        payload: { ww: { kind: 'plan.invite', seq: 4 } },
      })
    )
  })
  expect(runtime.sync).toHaveBeenCalledWith('open')
  expect(runtime.requestTray).toHaveBeenCalled()
})
