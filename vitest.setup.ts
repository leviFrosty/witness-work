import { vi } from 'vitest'

vi.mock('./modules/display-regions', () => ({
  default: () => null,
  supportsDisplayRegions: false,
}))

vi.mock('@/components/ui/layout/FoldPane', async () => {
  const reactNative = await import('react-native')
  const passThrough = ({ children }: { children: unknown }) => children
  return {
    default: passThrough,
    FoldArea: passThrough,
    FoldHandled: passThrough,
    useFoldHandled: () => false,
    useLocalFoldPane: () => ({
      onRegionsChange: () => {},
      pane: null,
      width: 0,
    }),
    useFoldColumn: () => null,
    useWindowFoldColumn: () => null,
    useWindowFoldPane: () => {
      const { width } = reactNative.useWindowDimensions()
      return { x: 0, width, start: 0 }
    },
  }
})

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

vi.mock('expo-localization', () => ({
  getLocales: () => [
    { languageTag: 'en-US', languageCode: 'en', regionCode: 'US' },
  ],
  getCalendars: () => [
    { uses24hourClock: false, firstWeekday: 1, timeZone: 'UTC' },
  ],
}))

vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}))

vi.mock('@/lib/sha256', async () => {
  const { createHash } = await import('node:crypto')
  return {
    sha256Native: vi.fn(
      async (bytes: Uint8Array) =>
        new Uint8Array(createHash('sha256').update(bytes).digest())
    ),
  }
})
