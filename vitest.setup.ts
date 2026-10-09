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

// Stub expo-network globally: sync, onboarding and other shared modules read
// connectivity through `@/lib/http/online`, and the real module needs expo's
// native runtime. Tests that care mock it themselves.
vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}))
