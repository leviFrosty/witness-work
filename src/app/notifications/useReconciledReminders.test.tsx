import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan } from '@/types/timeEntry'
const runtime = vi.hoisted(() => ({
  platform: 'ios',
  scheduled: [] as { identifier: string }[],
  presented: [] as {
    request: { identifier: string; content: { data: unknown } }
  }[],
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}))
vi.mock('@/stores/contactsStore', async () => ({
  default: (await import('zustand')).create(() => ({
    contacts: [] as Contact[],
  })),
}))
vi.mock('@/stores/conversationStore', async () => ({
  default: (await import('zustand')).create(() => ({
    conversations: [] as Visit[],
  })),
}))
vi.mock('@/stores/serviceReport', async () => ({
  default: (await import('zustand')).create(() => ({
    dayPlans: [] as DayPlan[],
  })),
}))
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    returnVisitNotificationOffset: null,
    planNotificationOffset: null,
    dataProtectionMode: false,
    timeDisplayFormat: 'short',
  })),
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
  DEFAULT_PLAN_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => [...runtime.scheduled]),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    runtime.scheduled = runtime.scheduled.filter(
      (item) => item.identifier !== id
    )
  }),
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: vi.fn(async (request: { identifier: string }) => {
    runtime.scheduled.push({ identifier: request.identifier })
    return request.identifier
  }),
  setNotificationChannelAsync: vi.fn(async () => {}),
  getPresentedNotificationsAsync: vi.fn(async () => runtime.presented),
  dismissNotificationAsync: vi.fn(async (id: string) => {
    runtime.presented = runtime.presented.filter(
      (item) => item.request.identifier !== id
    )
  }),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}))
import * as Notifications from 'expo-notifications'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useReconciledReminders } from './useReconciledReminders'
const Harness = () => {
  useReconciledReminders(true)
  return null
}
let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.clearAllMocks()
  runtime.scheduled = []
  runtime.presented = []
  useContacts.setState({
    contacts: [{ id: 'c', name: 'Contact', createdAt: new Date() }],
  })
  useConversations.setState({ conversations: [] })
  useServiceReport.setState({ dayPlans: [] })
  usePreferences.setState({ dataProtectionMode: false })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it.each(['ios', 'android'])(
  'rebuilds local reminders after restore/reschedule/deletion on %s',
  async (platform) => {
    runtime.platform = platform
    const date = new Date(Date.now() + 24 * 60 * 60_000)
    const visit: Visit = {
      id: 'v',
      date: new Date(),
      isBibleStudy: false,
      contact: { id: 'c' },
      followUp: {
        date,
        notifyMe: true,
        notifications: [
          { id: 'foreign', date: new Date(date.getTime() - 30 * 60_000) },
        ],
      },
    }
    useConversations.setState({ conversations: [visit] })
    runtime.scheduled = [{ identifier: 'foreign' }]
    await act(async () => {
      renderer = create(<Harness />)
    })
    expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-visit-v' }])
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'foreign'
    )
    if (platform === 'android')
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledOnce()
    const nextDate = new Date(date.getTime() + 60 * 60_000)
    await act(async () => {
      useConversations.setState({
        conversations: [
          { ...visit, followUp: { date: nextDate, notifyMe: true } },
        ],
      })
    })
    expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        identifier: 'witness-work-visit-v',
        trigger: expect.objectContaining({
          date: new Date(nextDate.getTime() - 30 * 60_000),
        }),
      })
    )
    await act(async () => {
      useConversations.setState({ conversations: [] })
    })
    expect(runtime.scheduled).toEqual([])
  }
)

it('removes new legacy ids created by a form while reconciliation is installed', async () => {
  runtime.platform = 'ios'
  await act(async () => {
    renderer = create(<Harness />)
  })
  runtime.scheduled.push({ identifier: 'new-form-id' })
  await act(async () => {
    useContacts.setState({
      contacts: [
        {
          id: 'c',
          name: 'Contact',
          createdAt: new Date(),
          dismissedUntil: new Date(Date.now() + 60 * 60_000),
          dismissedNotificationId: 'new-form-id',
        },
      ],
    })
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-contact-c' }])
})

it('finishes all reminders when an unrelated edit interrupts scheduling', async () => {
  runtime.platform = 'ios'
  const date = new Date(Date.now() + 24 * 60 * 60_000)
  useConversations.setState({
    conversations: ['one', 'two'].map((id) => ({
      id,
      date: new Date(),
      isBibleStudy: false,
      contact: { id: 'c' },
      followUp: { date, notifyMe: true },
    })),
  })
  let finish: (identifier: string) => void = () => {}
  vi.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(
    async (request) => {
      runtime.scheduled.push({ identifier: request.identifier! })
      return new Promise((resolve) => {
        finish = resolve
      })
    }
  )
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-visit-one' }])
  await act(async () => {
    useContacts.setState({
      contacts: useContacts.getState().contacts.map((contact) => ({
        ...contact,
        phone: '123',
      })),
    })
    finish('witness-work-visit-one')
  })
  expect(runtime.scheduled).toEqual([
    { identifier: 'witness-work-visit-one' },
    { identifier: 'witness-work-visit-two' },
  ])
})

it.each(['ios', 'android'])(
  'keeps legacy IDs added while OS cancellation is pending on %s',
  async (platform) => {
    runtime.platform = platform
    const date = new Date(Date.now() + 24 * 60 * 60_000)
    const visits: Visit[] = ['one', 'two'].map((id) => ({
      id,
      date: new Date(),
      isBibleStudy: false,
      contact: { id: 'c' },
      followUp: { date, notifyMe: true },
    }))
    visits[0].followUp!.notifications = [{ id: 'old-uuid', date }]
    useConversations.setState({ conversations: visits })
    runtime.scheduled = [{ identifier: 'old-uuid' }]
    let finish: () => void = () => {}
    vi.mocked(
      Notifications.cancelScheduledNotificationAsync
    ).mockImplementationOnce(async (id) => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      runtime.scheduled = runtime.scheduled.filter(
        (item) => item.identifier !== id
      )
    })
    await act(async () => {
      renderer = create(<Harness />)
    })
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'old-uuid'
    )
    await act(async () => {
      runtime.scheduled.push({ identifier: 'form-created-uuid' })
      useConversations.setState({
        conversations: visits.map((visit) =>
          visit.id === 'two'
            ? {
                ...visit,
                followUp: {
                  ...visit.followUp!,
                  notifications: [{ id: 'form-created-uuid', date }],
                },
              }
            : visit
        ),
      })
      finish()
    })
    expect(runtime.scheduled.map((item) => item.identifier).sort()).toEqual([
      'witness-work-visit-one',
      'witness-work-visit-two',
    ])
  }
)

it('retains obsolete IDs for retry after the OS fails to list reminders', async () => {
  runtime.scheduled = [{ identifier: 'old-uuid' }]
  useContacts.setState({
    contacts: [
      {
        ...useContacts.getState().contacts[0],
        dismissedNotificationId: 'old-uuid',
      },
    ],
  })
  vi.mocked(
    Notifications.getAllScheduledNotificationsAsync
  ).mockRejectedValueOnce(new Error('OS unavailable'))
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'old-uuid' }])
  await act(async () => {
    // This retry does not re-collect any IDs from contact subscriptions.
    usePreferences.setState({ dataProtectionMode: true })
  })
  expect(runtime.scheduled).toEqual([])
})

it.each(['ios', 'android'])(
  'keeps at-time plan and visit reminders on %s',
  async (platform) => {
    runtime.platform = platform
    const date = new Date(Date.now() + 10 * 60_000)
    useConversations.setState({
      conversations: [
        {
          id: 'v',
          date: new Date(),
          isBibleStudy: false,
          contact: { id: 'c' },
          followUp: {
            date,
            notifyMe: true,
            notifications: [{ id: 'old-v', date }],
          },
        },
      ],
    })
    useServiceReport.setState({
      dayPlans: [
        {
          id: 'p',
          date,
          minutes: 30,
          startTimeInMinutes: date.getHours() * 60 + date.getMinutes(),
          notifyMe: true,
          notifications: [
            {
              id: 'old-p',
              date: new Date(
                date.getTime() -
                  date.getSeconds() * 1000 -
                  date.getMilliseconds()
              ),
            },
          ],
        },
      ],
    })
    await act(async () => {
      renderer = create(<Harness />)
    })
    expect(runtime.scheduled.map((item) => item.identifier).sort()).toEqual([
      'witness-work-plan-p',
      'witness-work-visit-v',
    ])
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'witness-work-visit-v',
        trigger: expect.objectContaining({ date }),
      })
    )
  }
)

it('keeps one OS reminder when a Visit is saved again unchanged', async () => {
  runtime.platform = 'ios'
  const date = new Date(Date.now() + 24 * 60 * 60_000)
  const visit: Visit = {
    id: 'v',
    date: new Date(),
    isBibleStudy: false,
    contact: { id: 'c' },
    followUp: { date, notifyMe: true, reminderOffsetMinutes: 120 },
  }
  useConversations.setState({ conversations: [visit] })
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    // A notes-only edit: a new record with the same reminder intent.
    useConversations.setState({
      conversations: [{ ...visit, note: 'Edited' }],
    })
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-visit-v' }])
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
    expect.objectContaining({
      trigger: expect.objectContaining({
        date: new Date(date.getTime() - 120 * 60_000),
      }),
    })
  )
})

it('routes taps with record ids and keeps names out in data protection mode', async () => {
  runtime.platform = 'ios'
  usePreferences.setState({ dataProtectionMode: true })
  useContacts.setState({
    contacts: [
      {
        id: 'c',
        name: 'Contact',
        createdAt: new Date(),
        dismissedUntil: new Date(Date.now() + 60 * 60_000),
      },
    ],
  })
  await act(async () => {
    renderer = create(<Harness />)
  })
  const request = vi.mocked(Notifications.scheduleNotificationAsync).mock
    .calls[0][0]
  expect(request.content.data).toEqual({
    reminder: { kind: 'contact', id: 'c', contactId: 'c' },
  })
  expect(JSON.stringify(request.content)).not.toContain('Contact"')
  expect(request.content.body).toBe('contactAvailableReminderPrivate')
})

it("cancels and retracts an erased Contact's reminder", async () => {
  runtime.platform = 'android'
  useContacts.setState({
    contacts: [
      {
        id: 'c',
        name: 'Contact',
        createdAt: new Date(),
        dismissedUntil: new Date(Date.now() + 60 * 60_000),
      },
    ],
  })
  runtime.presented = [
    {
      request: {
        identifier: 'delivered',
        content: { data: { reminder: { kind: 'contact', id: 'c' } } },
      },
    },
  ]
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-contact-c' }])
  expect(runtime.presented).toHaveLength(1)
  await act(async () => {
    useContacts.setState({ contacts: [] })
  })
  expect(runtime.scheduled).toEqual([])
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
    'delivered'
  )
  expect(runtime.presented).toEqual([])
})

it("drops a Plan's reminder once another device's deletion merges in", async () => {
  runtime.platform = 'ios'
  const { mergePayload } = await import('@/app/sync/merge')
  const plan: DayPlan = {
    id: 'p',
    date: new Date(Date.now() + 2 * 24 * 60 * 60_000),
    startTimeInMinutes: 600,
    minutes: 60,
    notifyMe: true,
    updatedAt: Date.now() - 5_000,
  }
  useServiceReport.setState({ dayPlans: [plan] })
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.scheduled).toEqual([{ identifier: 'witness-work-plan-p' }])

  const merged = mergePayload(
    {
      contacts: [],
      deletedContacts: [],
      customFieldDefs: [],
      deletedCustomFieldDefs: [],
      conversations: [],
      deletedConversations: [],
      serviceReports: {},
      dayPlans: [plan],
      recurringPlans: [],
      deletedServiceReports: [],
      categories: [],
      deletedCategories: [],
      vehicles: [],
      fuels: [],
      fuelPrices: [],
      vehicleSetups: [],
      trips: [],
      deletedMileageRecords: [],
      preferencesValues: {},
      preferenceUpdatedAt: {},
      profileValues: {},
      profileUpdatedAt: {},
    },
    {
      version: 1,
      writtenAt: Date.now(),
      deviceId: 'phone',
      contactStore: { contacts: [], deletedContacts: [] },
      conversationStore: { conversations: [] },
      serviceReportStore: {
        serviceReports: {},
        dayPlans: [],
        recurringPlans: [],
        deletedDayPlans: [{ id: 'p', deletedAt: Date.now() - 1_000 }],
      },
      preferencesStore: { values: {}, updatedAt: {} },
    }
  )
  // What a pull applies to the store.
  await act(async () => {
    useServiceReport.setState({ dayPlans: merged.dayPlans })
  })

  expect(merged.dayPlans).toEqual([])
  expect(runtime.scheduled).toEqual([])
})
