import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NotificationItem } from '@/types/notifications'

const tray = vi.hoisted(() => {
  Object.assign(globalThis, { __DEV__: false })
  return {
    renders: 0,
    items: [] as NotificationItem[],
    applyPendingUpdate: vi.fn(),
  }
})

vi.mock('@/features/badges/hooks/useBadgeNotifications', () => ({
  default: () => [],
}))
vi.mock('@/features/pet/hooks/usePetUnlockNotifications', () => ({
  default: () => [],
}))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  Alert: { alert: () => {} },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_, name) => String(name), has: () => true })
)
vi.mock('@react-navigation/native', () => {
  const navigation = { navigate: () => {} }
  return { useNavigation: () => navigation }
})
vi.mock('@/lib/analytics', () => ({
  analytics: { capture: () => {} },
  surveyClient: () => null,
}))
vi.mock('@/lib/surveySdk', () => ({
  closeSurvey: () => {},
  seenSurveys: () => [],
}))
vi.mock('@/stores/householderData', () => ({
  deleteHouseholderContact: () => {},
}))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: false, since: null }),
}))
// Platform-bound sources with narrow selectors of their own; they'd only add
// native mocks here.
vi.mock('@/app/notifications/useAnnouncementNotification', () => ({
  default: () => null,
}))
vi.mock('@/app/notifications/devNotifications', () => ({ default: () => [] }))
vi.mock('@/app/notifications/reminderTargets', () => ({
  openReminderTarget: () => {},
}))
vi.mock('@/app/calendar/useCalendarSyncNotification', () => ({
  default: () => null,
}))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridgeAvailable: true,
}))
vi.mock('@/app/calendar/confirmDisconnectCalendar', () => ({
  confirmDisconnectCalendar: () => {},
}))
vi.mock('@/features/settings/hooks/useBackupNotification', () => ({
  default: () => null,
}))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => false,
}))
vi.mock('@/features/buddies/hooks/useBuddyNotifications', () => ({
  default: () => [],
  syncBuddyNotifications: () => {},
  useBuddyTraySyncStatus: () => ({ state: 'idle', retry: () => {} }),
}))
vi.mock('@/features/updates/lib/updates', () => ({
  applyPendingUpdate: tray.applyPendingUpdate,
}))
vi.mock('@/features/notifications/components/NotificationsTray', () => ({
  default: ({ items }: { items: NotificationItem[] }) => {
    tray.renders++
    tray.items = items
    return null
  },
}))

import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import NotificationsBell from '@/app/notifications/NotificationsBell'

const HOUR = 60 * 60_000
const missed = () =>
  tray.items.filter((item) => item.kind === 'missed_follow_up')

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  tray.renders = 0
  tray.items = []
  useContacts.setState({
    contacts: [{ id: 'c1', name: 'Ada Example' }] as never,
  })
  useConversations.setState({ conversations: [] })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it("doesn't re-render the bell for writes it doesn't read", async () => {
  await act(async () => {
    renderer = create(<NotificationsBell />)
  })
  const settled = tray.renders

  const writes = [
    () => usePreferences.getState().set({ colorScheme: 'dark' }),
    () => usePreferences.getState().set({ lastiCloudSyncAt: Date.now() }),
    () => useContacts.setState({ deletedContacts: [] }),
    () => useConversations.setState({ deletedConversations: [] }),
    () => useServiceReport.setState({ deletedServiceReports: [] }),
    () => useCalendarSync.setState({ lastSyncedAt: Date.now() }),
    () => useCalendarPublishing.setState({ working: true }),
  ]
  for (const write of writes) {
    await act(async () => write())
  }
  expect(tray.renders).toBe(settled)
})

it('lists a missed Follow-up as soon as it is saved', async () => {
  await act(async () => {
    renderer = create(<NotificationsBell />)
  })
  expect(missed()).toHaveLength(0)

  await act(async () => {
    useConversations.setState({
      conversations: [
        {
          id: 'v1',
          contact: { id: 'c1' },
          date: new Date(Date.now() - 48 * HOUR),
          isBibleStudy: false,
          followUp: {
            date: new Date(Date.now() - 24 * HOUR),
            notifyMe: false,
            topic: 'Psalm 37',
          },
        },
      ],
    })
  })
  expect(missed()).toHaveLength(1)
  expect(missed()[0]?.description).toBe('Psalm 37')
})

it('offers to restart into a downloaded update until the app runs it', async () => {
  await act(async () => {
    renderer = create(<NotificationsBell />)
  })
  const pending = () =>
    tray.items.find((item) => item.kind === 'pending_update')
  expect(pending()).toBeUndefined()

  await act(async () => usePendingUpdate.setState({ bundleId: 'b2' }))
  expect(pending()?.id).toBe('pending_update:b2')
  pending()?.actions?.[0]?.onPress()
  expect(tray.applyPendingUpdate).toHaveBeenCalledOnce()

  await act(async () => usePendingUpdate.setState({ bundleId: null }))
  expect(pending()).toBeUndefined()
})
