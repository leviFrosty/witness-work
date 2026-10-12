import { buildPayload, parsePayload } from '@/app/sync/payload'
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new' }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

// One unreadable record, setting or profile value used to make the whole file
// unreadable, so a second device never synced (1.44.0).

const contact = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Contact ${id}`,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: 100,
  ...extra,
})

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  date: '2025-03-04T12:00:00.000Z',
  hours: 1,
  minutes: 30,
  updatedAt: 100,
  ...extra,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payloadWith(edit: (payload: any) => void) {
  const payload = JSON.parse(JSON.stringify(buildPayload({ deviceId: 'peer' })))
  edit(payload)
  return JSON.stringify(payload)
}

describe('parsePayload salvage', () => {
  it('keeps a record whose optional field is null', () => {
    const json = payloadWith((p) => {
      p.contactStore.contacts = [
        contact('a', { phone: null, address: { city: null, line1: 'Main' } }),
      ]
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed?.contactStore.contacts).toEqual([
      contact('a', { address: { line1: 'Main' } }),
    ])
    expect(dropped).toEqual([])
  })

  it('drops only the unreadable record and keeps the rest', () => {
    const json = payloadWith((p) => {
      p.contactStore.contacts = [contact('a'), contact('b', { name: 42 })]
      p.conversationStore.conversations = [
        { id: 'v', contact: { id: 'a' }, date: 'not a date' },
      ]
      p.serviceReportStore.serviceReports = {
        2025: { 2: [entry('t1'), entry('t2', { hours: 'one' })] },
      }
      p.serviceReportStore.deletedDayPlans = [{ id: 'p', deletedAt: -1 }]
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed?.contactStore.contacts.map((c) => c.id)).toEqual(['a'])
    expect(parsed?.conversationStore.conversations).toEqual([])
    expect(parsed?.serviceReportStore.serviceReports).toEqual({
      2025: { 2: [entry('t1')] },
    })
    expect(parsed?.serviceReportStore.deletedDayPlans).toEqual([])
    expect(dropped).toEqual([
      'contactStore.contacts.name:invalid_type',
      'conversationStore.conversations.date:custom',
      'serviceReportStore.deletedDayPlans.deletedAt:too_small',
      'serviceReportStore.serviceReports.hours:invalid_type',
    ])
  })

  it('reads a visit without isBibleStudy as not a study, like 1.43', () => {
    const visit = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      contact: { id: 'a' },
      date: '2025-03-04T12:00:00.000Z',
      updatedAt: 100,
      ...extra,
    })
    const json = payloadWith((p) => {
      p.conversationStore.conversations = [
        visit('missing'),
        visit('null', { isBibleStudy: null }),
        visit('study', { isBibleStudy: true }),
        visit('text', { isBibleStudy: 'yes' }),
      ]
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed?.conversationStore.conversations).toEqual([
      visit('missing', { isBibleStudy: false }),
      visit('null', { isBibleStudy: false }),
      visit('study', { isBibleStudy: true }),
    ])
    expect(dropped).toEqual([
      'conversationStore.conversations.isBibleStudy:invalid_type',
    ])
  })

  it('drops an unreadable setting with its stamps and keeps the rest', () => {
    const json = payloadWith((p) => {
      p.preferencesStore.values.publisherHours = 'lots'
      p.preferencesStore.values.showBadges = null
      p.preferencesStore.values.offDays = [0]
      p.preferencesStore.updatedAt = {
        publisherHours: 300,
        'publisherHours:publisher': 300,
        showBadges: 300,
        offDays: 300,
        // A NaN stamp is written as null.
        locale: null,
      }
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed).not.toBeNull()
    expect(parsed?.preferencesStore.values).not.toHaveProperty('publisherHours')
    expect(parsed?.preferencesStore.values).not.toHaveProperty('showBadges')
    expect(parsed?.preferencesStore.values.offDays).toEqual([0])
    expect(parsed?.preferencesStore.updatedAt).toEqual({ offDays: 300 })
    expect(dropped).toEqual([
      'preferencesStore.updatedAt.locale',
      'preferencesStore.publisherHours',
      'preferencesStore.showBadges',
    ])
  })

  it('drops an unreadable profile value and keeps the name', () => {
    const json = payloadWith((p) => {
      p.profileStore.values = { name: 'Sam', avatar: { type: 'gif' } }
      p.profileStore.updatedAt = { name: 300, avatar: 300 }
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed?.profileStore?.values).toEqual({ name: 'Sam' })
    expect(parsed?.profileStore?.updatedAt).toEqual({ name: 300 })
    expect(dropped).toEqual(['profileStore.avatar'])
  })

  it('still rejects a file without the payload frame', () => {
    expect(parsePayload(payloadWith((p) => delete p.deviceId))).toBeNull()
    expect(
      parsePayload(payloadWith((p) => (p.contactStore.contacts = 'none')))
    ).toBeNull()
  })
})
