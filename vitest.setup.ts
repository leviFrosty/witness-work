import { vi } from 'vitest'

// Stub expo-notifications globally — several stores import it for
// fire-and-forget OS calls (e.g., cancelling on delete) and the real module
// pulls in expo's runtime which expects React Native's __DEV__ global.
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    void id
    return undefined
  }),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => undefined),
  scheduleNotificationAsync: vi.fn(async () => 'mock-id'),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  getPermissionsAsync: vi.fn(async () => ({ granted: false })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: false })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}))
