import React from 'react'
import moment from 'moment'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan, TimeEntriesByYear } from '@/types/timeEntry'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
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
vi.mock('@/features/notifications/stores/notificationsTray', async () => ({
  useNotificationsTray: (await import('zustand')).create(() => ({
    unread: null as number | null,
  })),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [],
}))
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
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
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
  useServiceReport.setState({
    dayPlans: [],
    recurringPlans: [],
    serviceReports: {},
  })
  usePreferences.setState({
    dataProtectionMode: false,
    unloggedDayReminders: false,
  })
  useNotificationsTray.setState({ unread: null })
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

const badges = () =>
  vi
    .mocked(Notifications.scheduleNotificationAsync)
    .mock.calls.map(([request]) => [
      request.identifier,
      (request.content as { badge?: number }).badge,
    ])

const followUps = (ids: string[]): Visit[] =>
  ids.map((id, index) => ({
    id,
    date: new Date(),
    isBibleStudy: false,
    contact: { id: 'c' },
    followUp: {
      date: new Date(Date.now() + (index + 1) * 24 * 60 * 60_000),
      notifyMe: true,
    },
  }))

it('badges each iOS reminder with the unread count it will leave', async () => {
  runtime.platform = 'ios'
  useConversations.setState({ conversations: followUps(['first', 'second']) })
  useNotificationsTray.setState({ unread: 2 })
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(badges()).toEqual([
    ['witness-work-visit-first', 3],
    ['witness-work-visit-second', 4],
  ])
  vi.mocked(Notifications.scheduleNotificationAsync).mockClear()
  await act(async () => {
    useNotificationsTray.setState({ unread: 0 })
  })
  expect(badges()).toEqual([
    ['witness-work-visit-first', 1],
    ['witness-work-visit-second', 2],
  ])
})

it('leaves the badge alone until the bell has counted', async () => {
  runtime.platform = 'ios'
  useConversations.setState({ conversations: followUps(['one']) })
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(badges()).toEqual([['witness-work-visit-one', undefined]])
})

it('never badges Android reminders or reschedules for the unread count', async () => {
  runtime.platform = 'android'
  useConversations.setState({ conversations: followUps(['one']) })
  useNotificationsTray.setState({ unread: 2 })
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(badges()).toEqual([['witness-work-visit-one', undefined]])
  await act(async () => {
    useNotificationsTray.setState({ unread: 0 })
  })
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledOnce()
})

it('cancels and clears reminders to log time once the day has time', async () => {
  runtime.platform = 'ios'
  const today = new Date()
  const day = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  const key = (date: Date) => moment(date).format('YYYY-MM-DD')
  const logged = (dates: Date[]): TimeEntriesByYear => {
    const years: TimeEntriesByYear = {}
    for (const date of dates.map(normalizeDateForStorage)) {
      const months = (years[date.getUTCFullYear()] ??= {})
      ;(months[date.getUTCMonth()] ??= []).push({
        id: date.toISOString(),
        hours: 1,
        minutes: 0,
        date,
      })
    }
    return years
  }
  const plan = (offset: number): DayPlan => ({
    id: `p${offset}`,
    date: normalizeDateForStorage(day(offset)),
    minutes: 120,
    startTimeInMinutes: 9 * 60,
  })
  useServiceReport.setState({ dayPlans: [plan(-1), plan(2)] })
  usePreferences.setState({
    unloggedDayReminders: true,
    unloggedDayReminderTime: 20 * 60,
    unloggedDayRemindersEnabledAt: 0,
    role: 'regularPioneer',
    roleHistory: null,
    logsHours: false,
  })
  // Yesterday's reminder was already delivered.
  runtime.presented = [
    {
      request: {
        identifier: 'delivered',
        content: {
          data: { reminder: { kind: 'unloggedDay', id: key(day(-1)) } },
        },
      },
    },
  ]
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.scheduled).toEqual([
    { identifier: `witness-work-unloggedDay-${key(day(2))}` },
  ])
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      trigger: expect.objectContaining({
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 2,
          20
        ),
      }),
    })
  )
  expect(runtime.presented).toHaveLength(1)
  await act(async () => {
    useServiceReport.setState({ serviceReports: logged([day(-1), day(2)]) })
  })
  expect(runtime.scheduled).toEqual([])
  expect(runtime.presented).toEqual([])
})

it.each([
  ['the Plan is deleted', () => useServiceReport.setState({ dayPlans: [] })],
  [
    'the setting is turned off',
    () => usePreferences.setState({ unloggedDayReminders: false }),
  ],
])('clears a delivered reminder to log time when %s', async (_, change) => {
  runtime.platform = 'ios'
  const today = new Date()
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1
  )
  useServiceReport.setState({
    dayPlans: [
      {
        id: 'p',
        date: normalizeDateForStorage(yesterday),
        minutes: 60,
        startTimeInMinutes: 9 * 60,
      },
    ],
  })
  usePreferences.setState({
    unloggedDayReminders: true,
    unloggedDayReminderTime: 20 * 60,
    unloggedDayRemindersEnabledAt: 0,
    role: 'regularPioneer',
    roleHistory: null,
    logsHours: false,
  })
  runtime.presented = [
    {
      request: {
        identifier: 'delivered',
        content: {
          data: {
            reminder: {
              kind: 'unloggedDay',
              id: moment(yesterday).format('YYYY-MM-DD'),
            },
          },
        },
      },
    },
  ]
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(runtime.presented).toHaveLength(1)
  await act(async () => {
    change()
  })
  expect(runtime.presented).toEqual([])
})
