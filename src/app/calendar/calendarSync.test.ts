import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  registerDevice: vi.fn(),
  publish: vi.fn(),
  removePublished: vi.fn(),
  selectPrimary: vi.fn(),
  requestAccess: vi.fn(),
  destinations: vi.fn(),
  createCalendar: vi.fn(),
  setDestination: vi.fn(),
  forgetDestination: vi.fn(),
  configure: vi.fn(),
}))
const device = vi.hoisted(() => ({
  deviceName: 'This iPhone' as string | null,
  modelName: 'iPhone 16 Pro' as string | null,
}))
const supporter = vi.hoisted(() => ({ isSupporter: true }))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridge: () => bridge,
}))
vi.mock('../../../modules/keychain-uuid', () => ({
  getOrCreate: () => 'this-device',
}))
vi.mock('expo-device', () => device)
vi.mock('@/features/supporter/stores/supporter', () => ({
  useSupporter: { getState: () => supporter },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/address', () => ({ addressToString: () => '' }))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: { pullBeforeCalendarPublish: vi.fn(async () => undefined) },
}))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarSync: create(() => ({
      enabled: true,
      registered: true,
      destination: {
        id: 'calendar',
        title: 'WitnessWork',
        account: 'iCloud',
      } as {
        id: string
        title: string
        account: string
      } | null,
      namespace: 'namespace',
      includeDetails: false,
      defaultInclude: false,
      lastSyncedAt: null as number | null,
      sharedCalendar: null as { title: string; account: string } | null,
      optedOut: false,
    })),
    useCalendarPublishing: create(() => ({
      state: null,
      deviceId: null,
      working: false,
      error: null,
    })),
  }
})
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [], deletedContacts: [] }) },
}))
vi.mock('@/stores/conversationStore', () => ({
  default: {
    getState: () => ({ conversations: [], deletedConversations: [] }),
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({ iCloudSyncEnabled: true }) },
}))

import {
  calendarAction,
  refreshPublishing,
  publishCalendar,
  disconnectCalendar,
  calendarDestinations,
  connectCalendar,
  createCalendar,
  deviceLabel,
  reconnectSharedCalendar,
  setSharedOptions,
} from '@/app/calendar/calendarSync'
import { useCalendarSync, useCalendarPublishing } from '@/stores/calendarSync'
import { iCloudSync } from '@/app/sync/iCloudSync'

const owned = {
  primary: 'this-device' as string | null,
  pending: null,
  busy: null,
  namespace: 'namespace',
  devices: [],
  publishedKeys: [] as string[],
  calendarTitle: 'WitnessWork' as string | undefined,
  calendarAccount: 'iCloud',
  configurationToken: 'configuration-1',
}
const calendar = { id: 'calendar', title: 'WitnessWork', account: 'iCloud' }

describe('calendar publishing orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bridge.registerDevice.mockResolvedValue(owned)
    bridge.destinations.mockResolvedValue([calendar])
    bridge.selectPrimary.mockResolvedValue(owned)
    bridge.setDestination.mockResolvedValue(owned)
    bridge.forgetDestination.mockResolvedValue(owned)
    bridge.configure.mockResolvedValue(owned)
    bridge.publish.mockResolvedValue(0)
    bridge.removePublished.mockResolvedValue(undefined)
    supporter.isSupporter = true
    device.deviceName = 'This iPhone'
    useCalendarSync.setState({
      enabled: true,
      destination: calendar,
      namespace: 'namespace',
      includeDetails: false,
      lastSyncedAt: null,
      sharedCalendar: null,
      optedOut: false,
    })
    useCalendarPublishing.setState({
      state: null,
      error: null,
      working: false,
    })
  })
  it('only publishes after the data merge finishes', async () => {
    let finish!: () => void
    vi.mocked(iCloudSync.pullBeforeCalendarPublish).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined)
        })
    )
    const pending = publishCalendar()
    await vi.waitFor(() =>
      expect(iCloudSync.pullBeforeCalendarPublish).toHaveBeenCalled()
    )
    expect(bridge.publish).not.toHaveBeenCalled()
    finish()
    await pending
    expect(bridge.publish).toHaveBeenCalledWith(
      'this-device',
      'This iPhone',
      'calendar',
      {
        title: 'calendarFollowUpTitle',
        deletedContactIds: [],
        entries: [],
        removed: [],
      },
      false,
      'configuration-1'
    )
    expect(bridge.publish.mock.calls[0][1]).toBe('This iPhone')
    expect(useCalendarSync.getState().lastSyncedAt).toBeTypeOf('number')
  })
  it('does not publish or clean up from a cached primary after ownership changes', async () => {
    bridge.registerDevice.mockResolvedValue({
      primary: 'other-device',
      namespace: 'namespace',
      devices: [],
    })
    await publishCalendar()
    expect(bridge.publish).not.toHaveBeenCalled()
    expect(useCalendarSync.getState().lastSyncedAt).toBeNull()
  })
  it('fails closed when iCloud ownership cannot be checked', async () => {
    bridge.registerDevice.mockRejectedValueOnce(new Error('offline'))
    await expect(calendarAction(publishCalendar)).rejects.toThrow('offline')
    expect(bridge.publish).not.toHaveBeenCalled()
    expect(useCalendarPublishing.getState().error).toBe(
      'calendarConnectionError'
    )
  })
  it('does not publish after an app-data read failure', async () => {
    vi.mocked(iCloudSync.pullBeforeCalendarPublish).mockRejectedValueOnce(
      new Error('data pull failed')
    )
    await expect(publishCalendar()).rejects.toThrow('data pull failed')
    expect(bridge.publish).not.toHaveBeenCalled()
    expect(useCalendarSync.getState().lastSyncedAt).toBeNull()
  })
  it('keeps publishing after Supporter lapses, without waiting on data sync', async () => {
    supporter.isSupporter = false
    await publishCalendar()
    expect(iCloudSync.pullBeforeCalendarPublish).not.toHaveBeenCalled()
    expect(bridge.publish).toHaveBeenCalled()
  })
  it('skips the data pull for local edits', async () => {
    await publishCalendar({ pull: false })
    expect(iCloudSync.pullBeforeCalendarPublish).not.toHaveBeenCalled()
    expect(bridge.publish).toHaveBeenCalled()
  })
  it('publishes with the shared detail setting, not this device’s cache', async () => {
    bridge.registerDevice.mockResolvedValue({ ...owned, includeDetails: true })
    await publishCalendar()
    expect(useCalendarSync.getState().includeDetails).toBe(true)
  })
  it('does not reuse the previous account’s calendar', async () => {
    bridge.registerDevice.mockResolvedValue({
      primary: 'this-device',
      namespace: 'different-account',
      devices: [],
    })
    await expect(publishCalendar()).rejects.toThrow('CALENDAR_ACCOUNT_CHANGED')
    await expect(disconnectCalendar(true)).rejects.toThrow(
      'CALENDAR_ACCOUNT_CHANGED'
    )
    expect(bridge.publish).not.toHaveBeenCalled()
    expect(bridge.removePublished).not.toHaveBeenCalled()
  })
  it('retains settings when native cleanup fails so the user can retry', async () => {
    bridge.removePublished.mockRejectedValueOnce(
      new Error('permission revoked')
    )
    await expect(disconnectCalendar(true)).rejects.toThrow()
    expect(useCalendarSync.getState().enabled).toBe(true)
  })
  it('can disconnect and retain events without calendar permission', async () => {
    useCalendarPublishing.setState({ state: owned })
    bridge.forgetDestination.mockRejectedValueOnce(new Error('offline'))
    await disconnectCalendar(false)
    expect(useCalendarSync.getState().enabled).toBe(false)
    expect(useCalendarSync.getState().optedOut).toBe(true)
    expect(bridge.forgetDestination).toHaveBeenCalled()
    expect(bridge.removePublished).not.toHaveBeenCalled()
  })
  it('only the primary clears the shared calendar on disconnect', async () => {
    useCalendarPublishing.setState({
      state: { ...owned, primary: 'other-device' },
    })
    await disconnectCalendar(false)
    expect(bridge.forgetDestination).not.toHaveBeenCalled()
    expect(useCalendarSync.getState().enabled).toBe(false)
  })
  it('claims primary on first connect', async () => {
    useCalendarSync.setState({ enabled: false, destination: null })
    bridge.registerDevice.mockResolvedValueOnce({ ...owned, primary: null })
    await connectCalendar(calendar)
    expect(bridge.selectPrimary).toHaveBeenCalledWith(
      'this-device',
      'This iPhone',
      'this-device'
    )
    expect(bridge.setDestination).toHaveBeenCalledWith(
      'this-device',
      'This iPhone',
      'calendar',
      'WitnessWork',
      'iCloud',
      false,
      'configuration-1'
    )
    expect(useCalendarSync.getState()).toMatchObject({
      enabled: true,
      registered: true,
    })
  })
  it('does not take over from another primary', async () => {
    useCalendarSync.setState({ enabled: false })
    bridge.registerDevice.mockResolvedValue({
      ...owned,
      primary: 'other-device',
    })
    await expect(connectCalendar(calendar)).rejects.toThrow(
      'CALENDAR_NOT_PRIMARY'
    )
    expect(bridge.selectPrimary).not.toHaveBeenCalled()
    expect(bridge.publish).not.toHaveBeenCalled()
  })
  it('reconnecting the same calendar waits for replicated events', async () => {
    useCalendarSync.setState({ enabled: false })
    await connectCalendar(calendar)
    expect(bridge.publish.mock.calls[0][4]).toBe(false)
  })
  it('a different or newly created calendar starts a fresh manifest', async () => {
    useCalendarSync.setState({ enabled: false })
    bridge.registerDevice
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce({ ...owned, calendarTitle: 'Service' })
    bridge.destinations.mockResolvedValueOnce([
      { ...calendar, id: 'other', title: 'Service' },
    ])
    await connectCalendar({ ...calendar, id: 'other', title: 'Service' })
    expect(bridge.setDestination.mock.calls[0][5]).toBe(true)
    bridge.createCalendar.mockResolvedValueOnce(calendar)
    useCalendarSync.setState({ enabled: false })
    await createCalendar('source')
    expect(bridge.setDestination.mock.calls[1][5]).toBe(true)
  })
  it('explains accounts that cannot create calendars', async () => {
    bridge.createCalendar.mockRejectedValueOnce(
      Object.assign(new Error('failed'), { code: 'CALENDAR_UNAVAILABLE' })
    )
    await expect(
      calendarAction(() => createCalendar('source'))
    ).rejects.toThrow()
    expect(useCalendarPublishing.getState().error).toBe('calendarCreateError')
  })
  it('a new primary reconnects the shared calendar only on an exact match', async () => {
    useCalendarSync.setState({
      enabled: false,
      destination: null,
      sharedCalendar: { title: 'WitnessWork', account: 'iCloud' },
    })
    bridge.destinations.mockResolvedValueOnce([
      { ...calendar, account: 'Google' },
    ])
    useCalendarPublishing.setState({ state: owned })
    await expect(reconnectSharedCalendar()).rejects.toThrow(
      'CALENDAR_SHARED_NOT_FOUND'
    )
    bridge.destinations.mockResolvedValueOnce([calendar])
    expect(await reconnectSharedCalendar()).toBe(true)
    expect(useCalendarSync.getState().enabled).toBe(true)
  })
  it('never reconnects after the user disconnected, and reports missing access', async () => {
    useCalendarSync.setState({
      enabled: false,
      optedOut: true,
      sharedCalendar: { title: 'WitnessWork', account: 'iCloud' },
    })
    expect(await reconnectSharedCalendar()).toBe(false)
    useCalendarSync.setState({ optedOut: false })
    useCalendarPublishing.setState({ state: owned })
    bridge.destinations.mockRejectedValueOnce(new Error('CALENDAR_PERMISSION'))
    useCalendarSync.setState({ destination: null })
    await expect(reconnectSharedCalendar()).rejects.toThrow(
      'CALENDAR_PERMISSION'
    )
    expect(bridge.destinations).toHaveBeenCalledTimes(1)
  })
  it('rolls back a shared option that could not be saved', async () => {
    bridge.configure.mockRejectedValueOnce(new Error('offline'))
    await expect(setSharedOptions({ includeDetails: true })).rejects.toThrow()
    expect(useCalendarSync.getState().includeDetails).toBe(false)
  })
  it('uses the current shared destination when a former primary still has its old connection', async () => {
    const destination = {
      id: 'new-calendar',
      title: 'New destination',
      account: 'Google',
    }
    bridge.registerDevice.mockResolvedValue({
      ...owned,
      calendarTitle: destination.title,
      calendarAccount: destination.account,
    })
    bridge.destinations.mockResolvedValue([calendar, destination])
    await publishCalendar({ pull: false })
    expect(bridge.publish.mock.calls[0][2]).toBe('new-calendar')
    expect(useCalendarSync.getState().destination).toEqual(destination)
    expect(bridge.setDestination).not.toHaveBeenCalled()
  })

  it('stops a stale local connection after the shared destination was disconnected', async () => {
    bridge.registerDevice.mockResolvedValue({
      ...owned,
      calendarTitle: undefined,
    })
    await publishCalendar()
    expect(bridge.publish).not.toHaveBeenCalled()
    expect(useCalendarSync.getState().enabled).toBe(false)
  })

  it('resolves changed local calendar identifiers without resetting the shared manifest', async () => {
    bridge.destinations.mockResolvedValue([{ ...calendar, id: 'changed-id' }])
    await publishCalendar({ pull: false })
    expect(bridge.publish.mock.calls[0][2]).toBe('changed-id')
    expect(bridge.setDestination).not.toHaveBeenCalled()
  })

  it('does not select an ambiguous shared calendar on a new primary', async () => {
    useCalendarSync.setState({
      enabled: false,
      destination: null,
      sharedCalendar: { title: calendar.title, account: calendar.account },
    })
    useCalendarPublishing.setState({ state: owned })
    bridge.destinations.mockResolvedValue([
      calendar,
      { ...calendar, id: 'duplicate' },
    ])
    await expect(reconnectSharedCalendar()).rejects.toThrow(
      'CALENDAR_SHARED_NOT_FOUND'
    )
    expect(bridge.publish).not.toHaveBeenCalled()
  })

  it('preserves replication protection when explicitly reconnecting a new shared destination', async () => {
    useCalendarSync.setState({
      enabled: false,
      destination: { ...calendar, id: 'old', title: 'Old' },
    })
    await connectCalendar(calendar)
    expect(bridge.setDestination.mock.calls[0][5]).toBe(false)
  })

  it('rebuilds and retries a snapshot once after a concurrent shared configuration change', async () => {
    bridge.publish.mockRejectedValueOnce(
      Object.assign(new Error('configuration changed'), {
        code: 'CALENDAR_STATE_CHANGED',
      })
    )
    bridge.registerDevice.mockResolvedValueOnce(owned).mockResolvedValueOnce({
      ...owned,
      configurationToken: 'configuration-2',
      includeDetails: false,
    })
    await publishCalendar()
    expect(bridge.publish).toHaveBeenCalledTimes(2)
    expect(bridge.publish.mock.calls.map((args) => args[5])).toEqual([
      'configuration-1',
      'configuration-2',
    ])
    expect(iCloudSync.pullBeforeCalendarPublish).toHaveBeenCalledTimes(1)
  })

  it('bounds retries when shared configuration keeps changing', async () => {
    bridge.publish
      .mockRejectedValueOnce(new Error('CALENDAR_STATE_CHANGED'))
      .mockRejectedValueOnce(new Error('CALENDAR_STATE_CHANGED'))
    await expect(publishCalendar()).rejects.toThrow('CALENDAR_STATE_CHANGED')
    expect(bridge.publish).toHaveBeenCalledTimes(2)
    expect(useCalendarSync.getState().lastSyncedAt).toBeNull()
  })

  it('does not clear a paused publishing error by refreshing the device list', async () => {
    useCalendarPublishing.setState({ error: 'calendarWaitingForEvents' })
    await calendarAction(refreshPublishing)
    expect(useCalendarPublishing.getState().error).toBe(
      'calendarWaitingForEvents'
    )
  })

  it('labels devices by model when iOS hides the device name', () => {
    device.deviceName = 'iPhone'
    expect(deviceLabel()).toBe('iPhone 16 Pro')
    device.deviceName = 'Levi’s iPhone'
    expect(deviceLabel()).toBe('Levi’s iPhone')
  })
  it('does not continue setup when calendar permission is denied', async () => {
    bridge.requestAccess.mockResolvedValueOnce(false)
    await expect(calendarDestinations()).rejects.toThrow('CALENDAR_PERMISSION')
  })
  it('serializes UI actions and continues after a failed action', async () => {
    const order: string[] = []
    const first = calendarAction(async () => {
      order.push('first')
      throw new Error('failed')
    })
    const second = calendarAction(async () => {
      order.push('second')
    })
    await expect(first).rejects.toThrow()
    await second
    expect(order).toEqual(['first', 'second'])
    expect(useCalendarPublishing.getState().working).toBe(false)
  })
  it('keeps an error visible through background runs until one succeeds', async () => {
    await calendarAction(async () => {
      throw new Error('CALENDAR_WAITING_FOR_EVENTS')
    }).catch(() => undefined)
    let workingDuringRun = true
    await calendarAction(
      async () => {
        workingDuringRun = useCalendarPublishing.getState().working
        expect(useCalendarPublishing.getState().error).toBe(
          'calendarWaitingForEvents'
        )
      },
      { background: true }
    )
    expect(workingDuringRun).toBe(false)
    expect(useCalendarPublishing.getState().error).toBe(
      'calendarWaitingForEvents'
    )
    await publishCalendar({ pull: false })
    expect(useCalendarPublishing.getState().error).toBeNull()
  })
})
