import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('lucide-react-native', () => ({ CalendarSync: 'CalendarSync' }))
vi.mock('@react-navigation/native', () => ({ useNavigation: vi.fn() }))
vi.mock('@tamagui/toast', () => ({ useToastController: vi.fn() }))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridgeAvailable: true,
}))
vi.mock('@/app/calendar/calendarSync', () => ({}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/calendarSync', async () => ({
  useCalendarSync: (await import('zustand')).create(() => ({})),
}))

import { shouldInviteToCalendarSync } from '@/app/calendar/useCalendarSyncNotification'

const fresh = {
  enabled: false,
  registered: false,
  destination: null,
  namespace: null,
  defaultInclude: true,
  includeDetails: false,
  lastSyncedAt: null,
  upcomingCount: 0,
  sharedCalendar: null,
  optedOut: false,
  promptAnswered: false,
}

describe('Calendar Sync invitation', () => {
  it('invites someone who has never answered or used Calendar Sync', () => {
    expect(shouldInviteToCalendarSync(fresh)).toBe(true)
  })
  it.each([
    { promptAnswered: true },
    { enabled: true },
    { optedOut: true },
    { sharedCalendar: { title: 'WitnessWork', account: 'iCloud' } },
  ])('stays hidden once answered or in use: %o', (change) => {
    expect(shouldInviteToCalendarSync({ ...fresh, ...change })).toBe(false)
  })
})
