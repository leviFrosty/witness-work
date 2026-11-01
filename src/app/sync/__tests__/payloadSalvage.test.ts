import {
  buildPayload,
  parsePayload,
  type PayloadRejection,
} from '@/app/sync/payload'
import { sanitizeNoteDocs } from '@/app/sync/payloadNotes'
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
vi.mock('@/app/sync/payloadNotes', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/app/sync/payloadNotes')>()
  return { sanitizeNoteDocs: vi.fn(actual.sanitizeNoteDocs) }
})

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

  it('reads a file from an older build that still has a removed setting', () => {
    const json = payloadWith((p) => {
      p.preferencesStore.values.displayDetailsOnProgressBarHomeScreen = true
      p.preferencesStore.values.offDays = [0]
      p.preferencesStore.updatedAt = {
        displayDetailsOnProgressBarHomeScreen: 300,
        offDays: 300,
      }
    })
    const dropped: string[] = []
    const parsed = parsePayload(json, (paths) => dropped.push(...paths))
    expect(parsed).not.toBeNull()
    expect(parsed?.preferencesStore.values).not.toHaveProperty(
      'displayDetailsOnProgressBarHomeScreen'
    )
    expect(parsed?.preferencesStore.values.offDays).toEqual([0])
    expect(dropped).toEqual([])
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

  it('round-trips the pet slice and drops only an unreadable pet record', async () => {
    const { default: usePet } = await import('@/stores/pet')
    usePet
      .getState()
      .adopt({ species: 'cat', coat: 'calico', today: '2026-09-01' })
    usePet.getState().updateRoom({ floor: 'brick' })
    const { pet, room } = usePet.getState()
    try {
      const parsed = parsePayload(payloadWith(() => {}))
      expect(parsed?.petStore).toEqual({
        pets: [pet],
        petRooms: [room],
        deletedPetRecords: [],
      })

      const dropped: string[] = []
      const salvaged = parsePayload(
        payloadWith((p) => {
          p.petStore.pets[0].adoptedOn = 'yesterday'
        }),
        (paths) => dropped.push(...paths)
      )
      expect(salvaged?.petStore?.pets).toEqual([])
      expect(salvaged?.petStore?.petRooms).toEqual([room])
      expect(dropped).toEqual(['petStore.pets.adoptedOn:invalid_string'])
    } finally {
      usePet.getState()._WARNING_forceDeletePet()
    }
  })

  it('still rejects a file without the payload frame', () => {
    expect(parsePayload(payloadWith((p) => delete p.deviceId))).toBeNull()
    expect(
      parsePayload(payloadWith((p) => (p.contactStore.contacts = 'none')))
    ).toBeNull()
  })
})

describe('parsePayload rejection reasons', () => {
  function reject(json: string) {
    const rejections: PayloadRejection[] = []
    const dropped: string[] = []
    const parsed = parsePayload(
      json,
      (fields) => dropped.push(...fields),
      (rejection) => rejections.push(rejection)
    )
    expect(parsed).toBeNull()
    expect(rejections).toHaveLength(1)
    return { rejection: rejections[0], dropped }
  }

  it('reports JSON that does not parse', () => {
    const json = payloadWith(() => {})
    expect(reject(json.slice(0, json.length / 2)).rejection).toEqual({
      reason: 'invalid-json',
    })
    expect(reject('').rejection).toEqual({ reason: 'invalid-json' })
  })

  it('reports unsafe keys', () => {
    const json = payloadWith(() => {}).replace(
      '"contacts":[',
      '"__proto__":{},"contacts":['
    )
    expect(reject(json).rejection).toEqual({ reason: 'unsafe-keys' })
  })

  it('reports a newer version without its dropped entries', () => {
    const { rejection, dropped } = reject(
      payloadWith((p) => {
        p.version = 99
        p.contactStore.contacts = [contact('b', { name: 42 })]
      })
    )
    expect(rejection).toEqual({ reason: 'newer-version' })
    expect(dropped).toEqual([])
  })

  it('reports frame issues as path and code', () => {
    const { rejection } = reject(
      payloadWith((p) => {
        p.contactStore.customFieldDefs = null
        p.serviceReportStore.serviceReports = { 2025: [entry('t1')] }
      })
    )
    expect(rejection).toEqual({
      reason: 'invalid-frame',
      issues: [
        'contactStore.customFieldDefs:invalid_type',
        'serviceReportStore.serviceReports.*:invalid_type',
      ],
    })
  })

  it('de-duplicates and caps frame issues', () => {
    const { rejection } = reject(
      payloadWith((p) => {
        delete p.deviceId
        delete p.writtenAt
        p.contactStore = 'none'
        p.conversationStore = 'none'
        p.preferencesStore = 'none'
        p.serviceReportStore.serviceReports = { 2024: [], 2025: [] }
      })
    )
    expect(rejection.issues).toHaveLength(5)
    expect(new Set(rejection.issues).size).toBe(5)
  })

  it('reports dropped entries when the frame still fails', () => {
    const { rejection, dropped } = reject(
      payloadWith((p) => {
        p.contactStore.contacts = [contact('a'), contact('b', { name: 42 })]
        p.serviceReportStore = 'unreadable'
      })
    )
    expect(dropped).toEqual(['contactStore.contacts.name:invalid_type'])
    expect(rejection).toEqual({
      reason: 'invalid-frame',
      issues: ['serviceReportStore:invalid_type'],
    })
  })

  it('reports the step and error name when normalizing throws', () => {
    vi.mocked(sanitizeNoteDocs).mockImplementationOnce(() => {
      throw new TypeError('Secret Name')
    })
    expect(reject(payloadWith(() => {})).rejection).toEqual({
      reason: 'threw',
      step: 'notes',
      error: 'TypeError',
    })
  })

  it('never reports values or user-written keys', () => {
    const secret = 'Secret Name'
    const { rejection } = reject(
      payloadWith((p) => {
        p.deviceId = secret
        p.deviceName = 7
        p.contactStore.contacts = [contact('a', { name: { secret } })]
        p.serviceReportStore.serviceReports = { [secret]: secret }
        p.preferencesStore.updatedAt = secret
      })
    )
    expect(rejection.reason).toBe('invalid-frame')
    expect(JSON.stringify(rejection)).not.toContain('Secret')
    expect(JSON.stringify(rejection)).not.toContain('peer')
  })
})
