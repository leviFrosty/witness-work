import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AndroidCalendarEvent,
  AndroidEventWrite,
  CalendarDestination,
} from '../../../modules/calendar-bridge'

/** An in-memory CalendarContract: one calendar's events and reminders. */
const provider = vi.hoisted(() => {
  const state = {
    granted: true,
    nextId: 1,
    events: [] as (AndroidCalendarEvent & { alertMinutes?: number })[],
    calendars: [] as CalendarDestination[],
  }
  return {
    state,
    bridge: {
      requestAccess: vi.fn(async () => state.granted),
      destinations: vi.fn(async () => state.calendars),
      createCalendar: vi.fn(async (title: string) => {
        const calendar = {
          id: 'local-calendar',
          title,
          account: 'WitnessWork',
          local: true,
        }
        state.calendars.push(calendar)
        return calendar
      }),
      events: vi.fn(async (_calendarId: string) => {
        if (!state.granted) throw new Error('CALENDAR_PERMISSION')
        return state.events.map(({ alertMinutes: _, ...event }) => event)
      }),
      apply: vi.fn(
        async (
          _calendarId: string,
          writes: AndroidEventWrite[],
          deletes: string[]
        ) => {
          state.events = state.events.filter(
            (event) => !deletes.includes(event.id)
          )
          for (const { id, resetAlert, alertMinutes, ...fields } of writes) {
            const existing = state.events.find((event) => event.id === id)
            if (existing) {
              Object.assign(existing, fields)
              if (resetAlert) existing.alertMinutes = alertMinutes
            } else {
              state.events.push({
                ...fields,
                alertMinutes,
                id: String(state.nextId++),
                syncId: null,
                allDay: false,
              })
            }
          }
        }
      ),
    },
  }
})
const data = vi.hoisted(() => ({
  contacts: [] as { id: string; name: string }[],
  deletedContacts: [] as { id: string }[],
  conversations: [] as unknown[],
  deletedConversations: [] as { id: string }[],
}))

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('../../../modules/calendar-bridge', () => ({
  androidCalendarBridge: () => provider.bridge,
  calendarBridge: () => {
    throw new Error('iOS bridge used on Android')
  },
}))
vi.mock('../../../modules/keychain-uuid', () => ({ getOrCreate: () => null }))
vi.mock('expo-device', () => ({}))
vi.mock('@/features/supporter/stores/supporter', () => ({
  useSupporter: { getState: () => ({ isSupporter: false }) },
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string) =>
      ({
        calendarName: 'WitnessWork',
        calendarFollowUpTitle: 'Follow-up',
        calendarThisDeviceAndroid: 'This device',
      })[key] ?? key,
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/address', () => ({
  addressToString: (address?: string) => address ?? '',
}))
vi.mock('@/app/sync/iCloudSync', () => ({ iCloudSync: {} }))
vi.mock('@/stores/contactsStore', () => ({
  default: {
    getState: () => ({
      contacts: data.contacts,
      deletedContacts: data.deletedContacts,
    }),
  },
}))
vi.mock('@/stores/conversationStore', () => ({
  default: {
    getState: () => ({
      conversations: data.conversations,
      deletedConversations: data.deletedConversations,
    }),
  },
}))
vi.mock('@/stores/preferences', () => ({
  DEFAULT_PLAN_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: { amount: 2, unit: 'hours' },
  usePreferences: {
    getState: () => ({ returnVisitNotificationOffset: null }),
  },
}))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarSync: create(() => ({
      enabled: false,
      destination: null as CalendarDestination | null,
      includeDetails: false,
      lastSyncedAt: null as number | null,
      failingSince: null as number | null,
      upcomingCount: 0,
      optedOut: false,
    })),
    useCalendarPublishing: create(() => ({ error: null as string | null })),
  }
})

import {
  calendarDestinations,
  calendarErrorKey,
  calendarSources,
  connectCalendar,
  disconnectCalendar,
  publishCalendar,
  quickConnectCalendar,
  setSharedOptions,
} from '@/app/calendar/calendarSync'
import { useCalendarSync } from '@/stores/calendarSync'
import { analytics } from '@/lib/analytics'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const google = { id: '7', title: 'Ministry', account: 'sam@example.com' }

const followUp = (id: string, date: string, extra: object = {}) => ({
  id,
  date: new Date('2026-10-01'),
  contact: { id: 'contact-1' },
  isBibleStudy: false,
  followUp: { date: new Date(date), notifyMe: false, ...extra },
})

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.clearAllMocks()
  Object.assign(provider.state, {
    granted: true,
    nextId: 1,
    events: [],
    calendars: [google],
  })
  data.contacts = [{ id: 'contact-1', name: 'Sam Rivera' }]
  data.deletedContacts = []
  data.conversations = [followUp('visit-1', '2026-10-09T15:00:00Z')]
  data.deletedConversations = []
  useCalendarSync.setState({
    enabled: false,
    destination: null,
    includeDetails: false,
    lastSyncedAt: null,
    failingSince: null,
    upcomingCount: 0,
    optedOut: false,
  })
})

describe('Android Calendar Sync', () => {
  it('connects a chosen calendar and adds every upcoming follow-up', async () => {
    useCalendarSync.setState({ failingSince: NOW - 1000, optedOut: true })
    expect(await calendarDestinations()).toEqual([google])
    await connectCalendar(google)
    expect(useCalendarSync.getState()).toMatchObject({
      enabled: true,
      optedOut: false,
      failingSince: null,
      destination: google,
      upcomingCount: 1,
      lastSyncedAt: NOW,
    })
    expect(provider.state.events).toEqual([
      expect.objectContaining({
        title: 'Follow-up',
        start: Date.parse('2026-10-09T15:00:00Z'),
        end: Date.parse('2026-10-09T15:30:00Z'),
        description:
          'witnesswork://contact/contact-1/visit-1?followUp=visit-1&alert=none',
      }),
    ])
    expect(analytics.capture).toHaveBeenCalledWith('calendar_connected', {
      created: false,
      local_calendar: false,
    })
  })

  it('stays idempotent: repeated syncs never duplicate events', async () => {
    await connectCalendar(google)
    await publishCalendar()
    await publishCalendar()
    expect(provider.state.events).toHaveLength(1)
    expect(provider.bridge.apply).toHaveBeenCalledOnce()
  })

  it('updates the same event when a follow-up is rescheduled, then removes it', async () => {
    await connectCalendar(google)
    const [created] = provider.state.events
    data.conversations = [followUp('visit-1', '2026-10-10T09:00:00Z')]
    await publishCalendar()
    expect(provider.state.events).toEqual([
      expect.objectContaining({
        id: created.id,
        start: Date.parse('2026-10-10T09:00:00Z'),
      }),
    ])
    data.conversations = []
    data.deletedConversations = [{ id: 'visit-1' }]
    await publishCalendar()
    expect(provider.state.events).toEqual([])
  })

  it('mirrors Notify Me and removes dismissed follow-ups', async () => {
    data.conversations = [
      followUp('visit-1', '2026-10-09T15:00:00Z', { notifyMe: true }),
    ]
    await connectCalendar(google)
    expect(provider.state.events).toEqual([
      expect.objectContaining({ alertMinutes: 120 }),
    ])
    data.conversations = [
      followUp('visit-1', '2026-10-09T15:00:00Z', { dismissed: true }),
    ]
    await publishCalendar()
    expect(provider.state.events).toEqual([])
  })

  it('adds names and addresses only when asked', async () => {
    await connectCalendar(google)
    await setSharedOptions({ includeDetails: true })
    await publishCalendar()
    expect(provider.state.events[0].title).toBe('Follow-up: Sam Rivera')
    await setSharedOptions({ includeDetails: false })
    await publishCalendar()
    expect(provider.state.events[0].title).toBe('Follow-up')
  })

  it('creates a local calendar for one-tap setup, and reuses it later', async () => {
    provider.state.calendars = []
    expect(await quickConnectCalendar()).toBe('connected')
    expect(provider.bridge.createCalendar).toHaveBeenCalledWith('WitnessWork')
    expect(useCalendarSync.getState().destination).toEqual({
      id: 'local-calendar',
      title: 'WitnessWork',
      account: 'This device',
      local: true,
    })
    expect(analytics.capture).toHaveBeenCalledWith('calendar_connected', {
      created: true,
      local_calendar: true,
    })
    await disconnectCalendar(false)
    await quickConnectCalendar()
    expect(provider.bridge.createCalendar).toHaveBeenCalledOnce()
  })

  it('asks which calendar to use when several are named WitnessWork', async () => {
    provider.state.calendars = [
      { id: '1', title: 'WitnessWork', account: 'a@example.com' },
      { id: '2', title: 'WitnessWork', account: 'b@example.com' },
    ]
    await expect(quickConnectCalendar()).rejects.toThrow(
      'CALENDAR_CHOOSE_EXISTING'
    )
  })

  it('reports a denied permission with Android copy', async () => {
    provider.state.granted = false
    const error = await calendarDestinations().catch((cause) => cause)
    expect(calendarErrorKey(error)).toBe('calendarPermissionErrorAndroid')
    expect(calendarErrorKey(new Error('offline'))).toBe(
      'calendarConnectionErrorAndroid'
    )
  })

  it('keeps or removes events on disconnect', async () => {
    await connectCalendar(google)
    await disconnectCalendar(false)
    expect(provider.state.events).toHaveLength(1)
    expect(useCalendarSync.getState()).toMatchObject({
      enabled: false,
      optedOut: true,
    })
    await publishCalendar()
    expect(provider.bridge.apply).toHaveBeenCalledOnce()

    await connectCalendar(google)
    await disconnectCalendar(true, 'tray')
    expect(provider.state.events).toEqual([])
    expect(analytics.capture).toHaveBeenLastCalledWith(
      'calendar_disconnected',
      { removed_events: true, source: 'tray' }
    )
  })

  it('creates calendars only on this device', async () => {
    await expect(calendarSources()).resolves.toEqual([
      { id: 'local', title: 'This device' },
    ])
  })
})
