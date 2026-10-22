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

// Stub expo-localization globally: the date and number helpers in
// `src/lib/dates.ts` read the device's locale through it, and the real module
// needs React Native. A US-English device; tests that care mock it themselves.
vi.mock('expo-localization', () => ({
  getLocales: () => [
    { languageTag: 'en-US', languageCode: 'en', regionCode: 'US' },
  ],
  getCalendars: () => [
    { uses24hourClock: false, firstWeekday: 1, timeZone: 'UTC' },
  ],
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

// Stub the native SHA-256 globally with Node's: backup and Cloud Sync hash
// their snapshots and blobs through it, and expo-crypto needs the native
// module. `src/lib/sha256.test.ts` checks the real wrapper.
vi.mock('@/lib/sha256', async () => {
  const { createHash } = await import('node:crypto')
  return {
    sha256Native: vi.fn(
      async (bytes: Uint8Array) =>
        new Uint8Array(createHash('sha256').update(bytes).digest())
    ),
  }
})
