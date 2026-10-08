import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openSettings: vi.fn() },
}))
vi.mock('lucide-react-native', () => ({ CalendarX: 'CalendarX' }))
vi.mock('@react-navigation/native', () => ({ useNavigation: vi.fn() }))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridgeAvailable: true,
}))
vi.mock('@/app/calendar/confirmDisconnectCalendar', () => ({
  confirmDisconnectCalendar: vi.fn(),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarSync: create(() => ({})),
    useCalendarPublishing: create(() => ({})),
  }
})

import {
  pausedCalendarSync,
  TRANSIENT_ALERT_DELAY_MS,
} from '@/app/calendar/useCalendarSyncPausedNotification'

const NOW = 10 * TRANSIENT_ALERT_DELAY_MS
const settings = {
  enabled: true,
  registered: true,
  destination: { id: 'calendar', title: 'WitnessWork', account: 'iCloud' },
  namespace: 'namespace',
  includeDetails: false,
  lastSyncedAt: 1,
  failingSince: (NOW - 60_000) as number | null,
  upcomingCount: 3,
  sharedCalendar: { title: 'WitnessWork', account: 'iCloud' },
  optedOut: false,
  promptAnswered: true,
}
const publishing = {
  state: {
    primary: 'this-device' as string | null,
    pending: null,
    busy: null,
    namespace: 'namespace',
    devices: [],
    publishedKeys: [],
  },
  deviceId: 'this-device',
  working: false,
  error: 'calendarPermissionError' as string | null,
}

describe('Calendar Sync paused alert', () => {
  it('shows at once when only the user can fix it', () => {
    expect(pausedCalendarSync(settings, publishing, NOW)).toEqual({
      error: 'calendarPermissionError',
      since: NOW - 60_000,
    })
  })

  it.each(['calendarConnectionError', 'calendarWaitingForEvents'])(
    'waits a day before alerting about %s',
    (error) => {
      const failing = { ...publishing, error }
      expect(pausedCalendarSync(settings, failing, NOW)).toBeNull()
      expect(
        pausedCalendarSync(
          { ...settings, failingSince: NOW - TRANSIENT_ALERT_DELAY_MS },
          failing,
          NOW
        )
      ).not.toBeNull()
    }
  )

  it.each([
    ['turned off', { enabled: false }],
    ['declined or disconnected', { optedOut: true }],
    ['no calendar connected here', { destination: null }],
  ])('never alerts someone with Calendar Sync %s', (_, change) => {
    expect(
      pausedCalendarSync({ ...settings, ...change }, publishing, NOW)
    ).toBeNull()
  })

  it('stays quiet without a failure or while another device publishes', () => {
    expect(
      pausedCalendarSync(settings, { ...publishing, error: null }, NOW)
    ).toBeNull()
    expect(
      pausedCalendarSync(
        settings,
        { ...publishing, state: { ...publishing.state, primary: 'ipad' } },
        NOW
      )
    ).toBeNull()
  })

  it("alerts about a changed iCloud account even when the new account's record names another primary", () => {
    expect(
      pausedCalendarSync(
        settings,
        {
          ...publishing,
          error: 'calendarAccountChanged',
          state: {
            ...publishing.state,
            primary: 'ipad',
            namespace: 'other-account',
          },
        },
        NOW
      )
    ).toEqual({ error: 'calendarAccountChanged', since: NOW - 60_000 })
  })
})
