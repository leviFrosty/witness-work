import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
import type { Visit, VisitTombstone } from '@/types/visit'
import type { PublishingState } from '../../../modules/calendar-bridge'

const runtime = vi.hoisted(() => ({
  platform: 'ios',
  appState: 'active',
  foreground: (_state: string) => {},
  calendarChanged: () => {},
  removeForeground: vi.fn(),
  removeCalendar: vi.fn(),
  addForeground: vi.fn(),
  subscribeCalendar: vi.fn(),
}))
const publishing = vi.hoisted(() => ({
  action: vi.fn(),
  publish: vi.fn(),
  refresh: vi.fn(),
  reconnect: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      runtime.addForeground()
      runtime.foreground = listener
      return { remove: runtime.removeForeground }
    },
  },
}))
vi.mock('../../../modules/calendar-bridge', () => ({
  subscribeCalendarChanges: (listener: () => void) => {
    runtime.subscribeCalendar()
    runtime.calendarChanged = listener
    return { remove: runtime.removeCalendar }
  },
}))
vi.mock('@/app/calendar/calendarSync', () => ({
  calendarAction: publishing.action,
  publishCalendar: publishing.publish,
  refreshPublishing: publishing.refresh,
  reconnectSharedCalendar: publishing.reconnect,
}))
vi.mock('@/stores/contactsStore', async () => ({
  default: (await import('zustand')).create(() => ({
    contacts: [] as Contact[],
    deletedContacts: [] as Contact[],
  })),
}))
vi.mock('@/stores/conversationStore', async () => ({
  default: (await import('zustand')).create(() => ({
    conversations: [] as Visit[],
    deletedConversations: [] as VisitTombstone[],
  })),
}))
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    returnVisitNotificationOffset: null as {
      amount: number
      unit: string
    } | null,
  })),
}))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarSync: create(() => ({
      enabled: true,
      registered: true,
      sharedCalendar: { title: 'WitnessWork', account: 'iCloud' } as {
        title: string
        account: string
      } | null,
      includeDetails: false,
      optedOut: false,
    })),
    useCalendarPublishing: create(() => ({
      state: null as PublishingState | null,
      deviceId: 'this-device',
    })),
  }
})

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import {
  useCalendarPublishing,
  useCalendarSync as useCalendarSettings,
} from '@/stores/calendarSync'
import { useCalendarSync } from '@/app/calendar/useCalendarSync'

const state = (primary = 'this-device'): PublishingState => ({
  primary,
  pending: null,
  busy: null,
  namespace: 'namespace',
  devices: [],
  publishedKeys: [],
  calendarTitle: 'WitnessWork',
  calendarAccount: 'iCloud',
})
const contact = (): Contact => ({
  id: 'contact',
  name: 'Contact',
  createdAt: new Date('2026-10-01'),
})
const visit = (): Visit => ({
  id: 'visit',
  date: new Date('2026-10-01'),
  contact: { id: 'contact' },
  isBibleStudy: false,
  followUp: {
    date: new Date('2026-11-01'),
    notifyMe: false,
    calendarIncluded: true,
  },
})
const Harness = ({ ready = true }: { ready?: boolean }) => {
  useCalendarSync(ready)
  return null
}
let renderer: ReactTestRenderer | undefined
const mount = async (ready = true) => {
  await act(async () => {
    renderer = create(<Harness ready={ready} />)
  })
}
const advance = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  runtime.platform = 'ios'
  runtime.appState = 'active'
  publishing.action.mockImplementation(async (action: () => Promise<unknown>) =>
    action()
  )
  publishing.publish.mockResolvedValue(undefined)
  publishing.refresh.mockResolvedValue(state())
  publishing.reconnect.mockResolvedValue(true)
  useContacts.setState({ contacts: [contact()], deletedContacts: [] })
  useConversations.setState({
    conversations: [visit()],
    deletedConversations: [],
  })
  useCalendarSettings.setState({
    enabled: true,
    registered: true,
    sharedCalendar: { title: 'WitnessWork', account: 'iCloud' },
    includeDetails: false,
    optedOut: false,
  })
  useCalendarPublishing.setState({ state: state(), deviceId: 'this-device' })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

describe('foreground calendar maintenance', () => {
  it.each([
    { platform: 'android', ready: true },
    { platform: 'ios', ready: false },
  ])(
    'does no work on $platform when ready=$ready',
    async ({ platform, ready }) => {
      runtime.platform = platform
      await mount(ready)
      await advance(300_000)
      expect(publishing.action).not.toHaveBeenCalled()
      expect(runtime.addForeground).not.toHaveBeenCalled()
      expect(runtime.subscribeCalendar).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('preserves the data-pull requirement through bounded failed retries', async () => {
    publishing.publish.mockRejectedValue(new Error('offline'))
    await mount()
    await advance(1499)
    expect(publishing.publish).not.toHaveBeenCalled()
    await advance(1)
    expect(publishing.publish).toHaveBeenCalledExactlyOnceWith({ pull: true })
    for (const [index, delay] of [5_000, 20_000, 60_000].entries()) {
      await advance(delay - 1)
      expect(publishing.publish).toHaveBeenCalledTimes(index + 1)
      await advance(1)
      expect(publishing.publish).toHaveBeenCalledTimes(index + 2)
      expect(publishing.publish).toHaveBeenLastCalledWith({ pull: true })
    }
    await advance(300_000)
    expect(publishing.publish).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries local edits without pulling and resets the retry budget on success', async () => {
    await mount()
    await advance(1500)
    publishing.publish.mockClear()
    publishing.publish.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      useConversations.setState({
        conversations: [
          {
            ...visit(),
            followUp: { ...visit().followUp!, calendarDurationMinutes: 60 },
          },
        ],
      })
    })
    await advance(1500)
    expect(publishing.publish).toHaveBeenCalledExactlyOnceWith({ pull: false })
    await advance(5_000)
    expect(publishing.publish).toHaveBeenLastCalledWith({ pull: false })
    expect(publishing.publish).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reconciles a newly selected primary without leaving the screen', async () => {
    useCalendarSettings.setState({ enabled: false })
    useCalendarPublishing.setState({ state: state('other-device') })
    publishing.refresh.mockResolvedValueOnce(state('other-device'))
    await mount()
    await advance(1500)
    expect(publishing.reconnect).not.toHaveBeenCalled()
    await act(async () => {
      useCalendarPublishing.setState({ state: state() })
    })
    await advance(1500)
    expect(publishing.refresh).toHaveBeenCalledTimes(2)
    expect(publishing.reconnect).toHaveBeenCalledOnce()
  })

  it('runs again when a calendar change arrives during an in-flight publish', async () => {
    let finish!: () => void
    publishing.publish.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    await mount()
    await advance(1500)
    expect(publishing.publish).toHaveBeenCalledOnce()
    await act(async () => {
      runtime.calendarChanged()
    })
    await advance(10_000)
    expect(publishing.publish).toHaveBeenCalledOnce()
    await act(async () => {
      finish()
    })
    await advance(1500)
    expect(publishing.publish).toHaveBeenCalledTimes(2)
    expect(publishing.publish).toHaveBeenLastCalledWith({ pull: false })
  })

  it('ignores edits to private notes and topics', async () => {
    await mount()
    await advance(1500)
    publishing.publish.mockClear()
    await act(async () => {
      useContacts.setState({
        contacts: [
          {
            ...contact(),
            phone: '123',
            customFields: { notes: 'Private contact note' },
            updatedAt: Date.now(),
          },
        ],
      })
      useConversations.setState({
        conversations: [
          {
            ...visit(),
            note: 'Private note',
            followUp: {
              ...visit().followUp!,
              topic: 'Private topic',
            },
          },
        ],
      })
    })
    await advance(60_000)
    expect(publishing.publish).not.toHaveBeenCalled()
  })
  it('republishes when a reminder or the default reminder time changes', async () => {
    await mount()
    await advance(1500)
    publishing.publish.mockClear()
    await act(async () => {
      useConversations.setState({
        conversations: [
          { ...visit(), followUp: { ...visit().followUp!, notifyMe: true } },
        ],
      })
    })
    await advance(1500)
    expect(publishing.publish).toHaveBeenCalledTimes(1)
    await act(async () => {
      usePreferences.setState({
        returnVisitNotificationOffset: { amount: 1, unit: 'days' },
      })
    })
    await advance(1500)
    expect(publishing.publish).toHaveBeenCalledTimes(2)
  })

  it('cancels retries and removes subscriptions after unmount', async () => {
    publishing.publish.mockRejectedValue(new Error('offline'))
    await mount()
    await advance(1500)
    expect(vi.getTimerCount()).toBe(1)
    act(() => renderer?.unmount())
    renderer = undefined
    expect(runtime.removeForeground).toHaveBeenCalledOnce()
    expect(runtime.removeCalendar).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => {
      useContacts.setState({ contacts: [{ ...contact(), name: 'Changed' }] })
      useConversations.setState({ conversations: [] })
      useCalendarSettings.setState({ enabled: false, includeDetails: true })
      useCalendarPublishing.setState({ state: state('other-device') })
    })
    await advance(300_000)
    expect(publishing.publish).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not schedule another run when an in-flight request finishes after unmount', async () => {
    let fail!: (error: Error) => void
    publishing.publish.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        })
    )
    await mount()
    await advance(1500)
    act(() => renderer?.unmount())
    renderer = undefined
    await act(async () => {
      fail(new Error('offline'))
    })
    await advance(300_000)
    expect(publishing.publish).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
