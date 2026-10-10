import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AndroidCalendarEvent,
  CalendarDestination,
} from '../../../modules/calendar-bridge'

const mocks = vi.hoisted(() => ({
  os: 'android',
  disconnect: vi.fn(async (_remove: boolean, _source: string) => {}),
  events: {} as Record<string, AndroidCalendarEvent[]>,
  calendars: [] as CalendarDestination[],
  removeAllMarkedEvents: vi.fn(async () => 7),
}))
const android = vi.hoisted(() => ({
  requestAccess: vi.fn(async () => true),
  destinations: vi.fn(async () => mocks.calendars),
  events: vi.fn(async (id: string) => mocks.events[id] ?? []),
  apply: vi.fn(async (id: string, _writes: unknown[], deletes: string[]) => {
    mocks.events[id] = (mocks.events[id] ?? []).filter(
      (event) => !deletes.includes(event.id)
    )
  }),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.os
    },
  },
}))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridgeAvailable: true,
  androidCalendarBridge: () => android,
  calendarBridge: () => ({
    requestAccess: async () => true,
    removeAllMarkedEvents: mocks.removeAllMarkedEvents,
  }),
}))
vi.mock('@/app/calendar/calendarSync', () => ({
  calendarAction: <T>(action: () => Promise<T>) => action(),
  disconnectCalendar: mocks.disconnect,
}))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarSync: create(() => ({
      enabled: false,
      destination: null as CalendarDestination | null,
      optedOut: false,
      lastSyncedAt: null as number | null,
      failingSince: null as number | null,
      upcomingCount: 0,
    })),
    useCalendarPublishing: create(() => ({ error: null as string | null })),
  }
})

import { useCalendarSync } from '@/stores/calendarSync'
import {
  removeAllCalendarEvents,
  removeConnectedCalendarEvents,
  stopCalendarSyncForMockData,
} from '@/app/calendar/devCalendarTools'

const destination = { id: 'ww', title: 'WitnessWork', account: 'Google' }

function event(id: string, description: string): AndroidCalendarEvent {
  return {
    id,
    syncId: null,
    title: 'Follow-up',
    start: 0,
    end: 0,
    location: '',
    description,
    allDay: false,
  }
}

const marked = (id: string) =>
  event(id, `witnesswork://contact/c${id}/v${id}?followUp=k${id}&alert=none`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.os = 'android'
  mocks.events = {}
  mocks.calendars = []
  useCalendarSync.setState({
    enabled: false,
    destination: null,
    optedOut: false,
  })
})

describe('stopCalendarSyncForMockData', () => {
  it('disconnects a connected calendar and keeps its events', async () => {
    useCalendarSync.setState({ enabled: true, destination })
    await stopCalendarSyncForMockData()
    expect(mocks.disconnect).toHaveBeenCalledWith(false, 'tools')
    expect(useCalendarSync.getState()).toMatchObject({
      enabled: false,
      optedOut: true,
    })
  })

  it('still switches off when the disconnect fails', async () => {
    useCalendarSync.setState({ enabled: true, destination })
    mocks.disconnect.mockRejectedValueOnce(new Error('offline'))
    await stopCalendarSyncForMockData()
    expect(useCalendarSync.getState().enabled).toBe(false)
  })

  it('opts out without disconnecting when already off', async () => {
    await stopCalendarSyncForMockData()
    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(useCalendarSync.getState().optedOut).toBe(true)
  })
})

describe('removeConnectedCalendarEvents', () => {
  it('removes published events only when connected', async () => {
    expect(await removeConnectedCalendarEvents()).toBe(false)
    expect(mocks.disconnect).not.toHaveBeenCalled()
    useCalendarSync.setState({ enabled: true, destination })
    expect(await removeConnectedCalendarEvents()).toBe(true)
    expect(mocks.disconnect).toHaveBeenCalledWith(true, 'tools')
  })
})

describe('removeAllCalendarEvents', () => {
  it('sweeps marked events from every calendar on Android', async () => {
    mocks.calendars = [destination, { ...destination, id: 'old' }]
    mocks.events = {
      ww: [marked('1'), event('2', 'Dentist')],
      old: [marked('3'), marked('4')],
    }
    expect(await removeAllCalendarEvents()).toBe(3)
    expect(mocks.events).toEqual({ ww: [event('2', 'Dentist')], old: [] })
    expect(useCalendarSync.getState()).toMatchObject({
      enabled: false,
      optedOut: true,
    })
  })

  it('disconnects first, then sweeps what is left', async () => {
    useCalendarSync.setState({ enabled: true, destination })
    await removeAllCalendarEvents()
    expect(mocks.disconnect).toHaveBeenCalledWith(true, 'tools')
  })

  it('uses the native sweep on iOS', async () => {
    mocks.os = 'ios'
    expect(await removeAllCalendarEvents()).toBe(7)
    expect(mocks.removeAllMarkedEvents).toHaveBeenCalled()
  })
})
