import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: { show: vi.fn() },
  dismissContact: vi.fn(),
  dismissContacts: vi.fn(),
  undismissContacts: vi.fn(),
  capture: vi.fn(),
  granted: true,
  schedule: vi.fn(async () => 'new-reminder'),
  cancel: vi.fn(async () => {}),
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: mocks.granted }),
  scheduleNotificationAsync: mocks.schedule,
  cancelScheduledNotificationAsync: mocks.cancel,
  SchedulableTriggerInputTypes: { DATE: 'date' },
}))
vi.mock('@tamagui/toast', () => ({ useToastController: () => mocks.toast }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/dates', () => ({
  formatDate: () => 'Jan 1',
  formatTime: () => '1:00 PM',
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))
vi.mock('@/stores/contactsStore', () => ({
  default: {
    getState: () => ({
      dismissContact: mocks.dismissContact,
      dismissContacts: mocks.dismissContacts,
      undismissContacts: mocks.undismissContacts,
    }),
  },
}))
vi.mock('@/stores/preferences', () => ({ usePreferences: vi.fn() }))

import useDismissContact, {
  dismissOptions,
  useDismissContacts,
  useUndismissContacts,
} from '@/hooks/useDismissContact'
import type { Contact } from '@/types/contact'

const contact = (id: string, overrides: Partial<Contact> = {}) =>
  ({ id, name: `Name ${id}`, createdAt: new Date(), ...overrides }) as Contact

const oneWeek = dismissOptions[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.granted = true
})

describe('useDismissContact', () => {
  it('replaces an earlier reminder when changing the duration', async () => {
    await useDismissContact()(
      contact('a', { dismissedNotificationId: 'old-reminder' }),
      oneWeek
    )
    expect(mocks.cancel).toHaveBeenCalledWith('old-reminder')
    expect(mocks.dismissContact).toHaveBeenCalledWith(
      'a',
      expect.any(Date),
      'new-reminder'
    )
    expect(mocks.toast.show).toHaveBeenCalledTimes(1)
  })

  it('skips the reminder without notification permission', async () => {
    mocks.granted = false
    await useDismissContact()(contact('a'), oneWeek)
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.dismissContact).toHaveBeenCalledWith(
      'a',
      expect.any(Date),
      undefined
    )
  })
})

describe('useDismissContacts', () => {
  it('dismisses every contact in one update with one toast', async () => {
    await useDismissContacts()(
      [contact('a', { dismissedNotificationId: 'old' }), contact('b')],
      oneWeek
    )
    expect(mocks.cancel).toHaveBeenCalledWith('old')
    expect(mocks.dismissContacts).toHaveBeenCalledTimes(1)
    expect(mocks.dismissContacts).toHaveBeenCalledWith([
      {
        id: 'a',
        dismissedUntil: expect.any(Date),
        dismissedNotificationId: 'new-reminder',
      },
      {
        id: 'b',
        dismissedUntil: expect.any(Date),
        dismissedNotificationId: 'new-reminder',
      },
    ])
    expect(mocks.capture).toHaveBeenCalledTimes(2)
    expect(mocks.toast.show).toHaveBeenCalledTimes(1)
    expect(mocks.toast.show.mock.calls[0][1].message).toContain('"count":2')
  })
})

describe('useUndismissContacts', () => {
  it('cancels reminders and undismisses every contact at once', async () => {
    await useUndismissContacts()([
      contact('a', { dismissedNotificationId: 'r1' }),
      contact('b'),
    ])
    expect(mocks.cancel).toHaveBeenCalledTimes(1)
    expect(mocks.cancel).toHaveBeenCalledWith('r1')
    expect(mocks.undismissContacts).toHaveBeenCalledTimes(1)
    expect(mocks.undismissContacts).toHaveBeenCalledWith(['a', 'b'])
    expect(mocks.toast.show).toHaveBeenCalledTimes(1)
  })
})
