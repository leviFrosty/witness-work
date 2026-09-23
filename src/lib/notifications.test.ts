import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'android',
  channel: vi.fn(),
  permissions: vi.fn(),
  request: vi.fn(),
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.platform
    },
  },
}))
vi.mock('@/lib/locales', () => ({ default: { t: () => 'Notifications' } }))
vi.mock('expo-notifications', () => ({
  setNotificationChannelAsync: native.channel,
  getPermissionsAsync: native.permissions,
  requestPermissionsAsync: native.request,
  AndroidImportance: { HIGH: 4 },
}))
import { registerForPushNotificationsAsync } from '@/lib/notifications'

describe('notification permission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.platform = 'android'
    native.permissions.mockResolvedValue({ granted: false })
    native.request.mockResolvedValue({ granted: true })
  })
  it('creates the fallback reminder channel before requesting Android permission', async () => {
    const result = await registerForPushNotificationsAsync()
    expect(native.channel).toHaveBeenCalledWith(
      'expo_notifications_fallback_notification_channel',
      { name: 'Notifications', importance: 4 }
    )
    expect(native.channel.mock.invocationCallOrder[0]).toBeLessThan(
      native.request.mock.invocationCallOrder[0]
    )
    expect(result.granted).toBe(true)
  })
  it('does not request permission again when already granted', async () => {
    native.permissions.mockResolvedValue({ granted: true })
    expect((await registerForPushNotificationsAsync()).granted).toBe(true)
    expect(native.request).not.toHaveBeenCalled()
  })
  it('does not create Android channels on iOS', async () => {
    native.platform = 'ios'
    await registerForPushNotificationsAsync()
    expect(native.channel).not.toHaveBeenCalled()
  })
})
