import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ platform: 'ios' }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('expo-notifications', () => ({
  setBadgeCountAsync: vi.fn(async () => true),
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import * as Notifications from 'expo-notifications'
import {
  setUnreadCount,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationsTray.setState({ unread: null })
})

it('shows each new unread count on the iOS app icon', () => {
  runtime.platform = 'ios'
  setUnreadCount(3)
  setUnreadCount(3)
  setUnreadCount(0)
  expect(vi.mocked(Notifications.setBadgeCountAsync).mock.calls).toEqual([
    [3],
    [0],
  ])
})

it('never sets the Android badge, which would clear delivered notifications', () => {
  runtime.platform = 'android'
  setUnreadCount(3)
  setUnreadCount(0)
  expect(useNotificationsTray.getState().unread).toBe(0)
  expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalled()
})
