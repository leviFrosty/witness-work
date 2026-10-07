import { afterEach, describe, expect, it, vi } from 'vitest'
import { alignPayloadClock } from '@/app/sync/clockSkew'
import {
  expireDeletedContactDetails,
  DELETED_CONTACT_RETENTION_MS,
} from '@/lib/contactRetention'
import { reconcileSyncDefinitions } from '@/app/sync/definitionReconciliation'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import { payloadReferencesPhotos } from '@/app/sync/photoReferences'
import { payloadSchema, validSettingValues } from '@/app/sync/payloadValidation'
import { hasUnsafeKeys } from '@/lib/recordValidation'
import { contactEditPatch, mayApplyGeocode } from '@/lib/contactEdits'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { migrateTagsToCategories } from '@/lib/categories'
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Category } from '@/types/category'
import type { Contact } from '@/types/contact'
import type { SyncPayload } from '@/app/sync/payload'

const now = Date.UTC(2026, 8, 30)
const contact = (patch: Partial<Contact> = {}): Contact => ({
  id: 'c',
  name: 'Name',
  createdAt: new Date(0),
  ...patch,
})
const payload = (): SyncPayload => ({
  version: 1,
  writtenAt: now,
  deviceId: 'peer',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [] },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})
const definitions = () => ({
  contacts: [] as Contact[],
  deletedContacts: [] as Contact[],
  categories: [
    { id: 'a', name: 'Work', isCredit: false, updatedAt: 1 },
    { id: 'b', name: 'Work', isCredit: false, updatedAt: 1 },
  ] as Category[],
  customFieldDefs: [
    { id: 'x', label: 'Field', order: 0, createdAt: 1, updatedAt: 1 },
    { id: 'y', label: 'Field', order: 0, createdAt: 1, updatedAt: 1 },
  ] as CustomFieldDefinition[],
  serviceReports: {
    '2026': {
      '8': [
        {
          id: 'time',
          date: new Date(now),
          hours: 1,
          minutes: 0,
          categoryId: 'b',
        },
      ],
    },
  },
  dayPlans: [{ id: 'plan', date: new Date(now), minutes: 30, categoryId: 'b' }],
  recurringPlans: [],
})
afterEach(() => vi.useRealTimers())

describe('clock and external payload boundaries', () => {
  it('rejects a late map geocode after an address or pin changes', () => {
    const requested = contact({ address: { line1: 'Old' } })
    expect(
      mayApplyGeocode(requested, contact({ address: { line1: 'New' } }))
    ).toBe(false)
    expect(
      mayApplyGeocode(requested, {
        ...requested,
        coordinate: { latitude: 1, longitude: 2 },
      })
    ).toBe(false)
    expect(
      mayApplyGeocode(requested, { ...requested, userDraggedCoordinate: true })
    ).toBe(false)
    expect(mayApplyGeocode(requested, { ...requested, name: 'Edited' })).toBe(
      true
    )
  })
  it.each([
    'visit-note',
    'visit-buddies',
    'override-note',
    'override-time',
    'recurring-location',
  ])('rejects malformed known nested fields: %s', (field) => {
    const remote = payload()
    if (field.startsWith('visit'))
      remote.conversationStore.conversations = [
        {
          id: 'v',
          contact: { id: 'c' },
          date: new Date(now).toISOString(),
          isBibleStudy: false,
          ...(field === 'visit-note'
            ? { note: {} }
            : {
                followUp: {
                  date: new Date(now).toISOString(),
                  notifyMe: true,
                  buddies: {},
                },
              }),
        },
      ]
    else
      remote.serviceReportStore.recurringPlans = [
        {
          id: 'p',
          startDate: new Date(now).toISOString(),
          minutes: 30,
          recurrence: { frequency: 0, interval: 1, endDate: null },
          ...(field === 'recurring-location'
            ? { location: { address: {} } }
            : {
                overrides: [
                  {
                    date: new Date(now).toISOString(),
                    minutes: 30,
                    ...(field === 'override-note'
                      ? { note: {} }
                      : { startTimeInMinutes: {} }),
                  },
                ],
              }),
        },
      ]
    expect(payloadSchema.safeParse(remote).success).toBe(false)
  })
  it.each([-365, 365])(
    'translates a legacy writer clock skewed by %i days',
    (days) => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
      const remote = payload(),
        delta = days * 24 * 60 * 60_000
      remote.writtenAt += delta
      remote.contactStore.contacts = [
        contact({ updatedAt: now + delta - 1000 }),
      ]
      remote.conversationStore.deletedConversations = [
        { id: 'gone', deletedAt: now + delta - 500 },
      ]
      const aligned = alignPayloadClock(remote, now)
      expect(aligned.contactStore.contacts[0].updatedAt).toBe(now - 1000)
      expect(aligned.conversationStore.deletedConversations![0].deletedAt).toBe(
        now - 500
      )
      expect(aligned.contactStore.contacts[0].createdAt).toEqual(new Date(0))
    }
  )
  it('does not promote old calibrated records when iCloud replicates late', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const remote = payload()
    remote.calibratedClock = true
    remote.writtenAt -= 24 * 60 * 60_000
    remote.contactStore.contacts = [contact({ updatedAt: remote.writtenAt })]
    expect(
      alignPayloadClock(remote, now).contactStore.contacts[0].updatedAt
    ).toBe(remote.writtenAt)
  })
  it.each([null, {}, 'text', [null]])(
    'rejects malformed contact collections: %j',
    (value) => {
      const remote = payload()
      remote.contactStore.contacts = value as never
      expect(
        payloadSchema.safeParse(JSON.parse(JSON.stringify(remote))).success
      ).toBe(false)
    }
  )
  it('rejects malformed nested records and unsafe dictionary keys', () => {
    const remote = payload()
    remote.serviceReportStore.serviceReports = { '2026': { '8': [null] } }
    expect(payloadSchema.safeParse(remote).success).toBe(false)
    expect(
      hasUnsafeKeys(JSON.parse('{"values":{"__proto__":{"polluted":true}}}'))
    ).toBe(true)
    expect(
      validSettingValues(
        { roleHistory: { initial: 'publisher', changes: null } },
        {}
      )
    ).toBe(false)
    expect(
      validSettingValues({ monthlyGoalOverrides: { '2026-09': 'bad' } }, {})
    ).toBe(false)
  })
  it('recognizes a profile-only photo restore', () => {
    const remote = payload()
    remote.profileStore = {
      values: { avatar: { type: 'image', value: 'icloud://profile' } },
      updatedAt: {},
    }
    expect(payloadReferencesPhotos(remote)).toBe(true)
  })
})

describe('definition migration and deletion retention', () => {
  it('repairs duplicate definitions and alias deletions in a single-peer restore', () => {
    const source = payload()
    source.categoryStore = { categories: definitions().categories }
    source.contactStore = {
      contacts: [contact({ customFields: { x: 'private' } })],
      deletedContacts: [],
      customFieldDefs: [
        {
          id: 'x',
          label: 'Field',
          order: 0,
          createdAt: 1,
          updatedAt: 100,
          legacyIds: ['y'],
        },
      ],
      deletedCustomFieldDefs: [{ id: 'y', deletedAt: 200 }],
    }
    const restored = foldRemotePayloads([source])!
    expect(restored.categoryStore!.categories).toHaveLength(1)
    expect(restored.contactStore.customFieldDefs).toEqual([])
    expect(restored.contactStore.contacts[0].customFields).toEqual({})
  })
  it('joins overlapping alias groups before resolving renamed definitions', () => {
    const a = {
      id: 'a',
      legacyIds: ['z'],
      name: 'Renamed A',
      isCredit: false,
      updatedAt: 200,
    }
    const b = {
      id: 'b',
      legacyIds: ['z'],
      name: 'Renamed B',
      isCredit: false,
      updatedAt: 100,
    }
    const state = definitions()
    state.serviceReports['2026']['8'][0].categoryId = 'z'
    const forward = reconcileSyncDefinitions({ ...state, categories: [a, b] })
    const reverse = reconcileSyncDefinitions({ ...state, categories: [b, a] })
    expect(forward).toEqual(reverse)
    expect(forward.categories).toEqual([{ ...a, legacyIds: ['b', 'z'] }])
    expect(forward.serviceReports['2026']['8'][0].categoryId).toBe('a')
  })
  it('creates the same migrated identities on independently upgraded devices', () => {
    const args = {
      legacyLabels: ['Field'],
      contacts: [contact({ customFields: { Field: 'value' } })],
      deletedContacts: [],
    }
    expect(migrateCustomFieldsToIds({ ...args, now }).defs).toEqual(
      migrateCustomFieldsToIds({ ...args, now: now + 999 }).defs
    )
    const tags = { serviceReports: {}, legacyTags: ['Work'] }
    expect(migrateTagsToCategories({ ...tags, now }).categories).toEqual(
      migrateTagsToCategories({ ...tags, now: now + 999 }).categories
    )
  })
  it('deduplicates old definitions and rewrites their references without losing values', () => {
    const state = definitions()
    state.contacts = [contact({ customFields: { y: 'value' } })]
    const repaired = reconcileSyncDefinitions(state)
    expect(repaired.categories).toHaveLength(1)
    expect(repaired.categories[0].legacyIds).toEqual(['b'])
    expect(repaired.dayPlans[0].categoryId).toBe('a')
    expect(repaired.serviceReports['2026']['8'][0].categoryId).toBe('a')
    expect(repaired.contacts[0].customFields).toEqual({ x: 'value' })
    expect(reconcileSyncDefinitions(repaired)).toEqual(repaired)
    const stale = {
      ...repaired,
      categories: [
        ...repaired.categories,
        { id: 'b', name: 'Renamed', isCredit: false, updatedAt: 100 },
      ],
    }
    expect(reconcileSyncDefinitions(stale).categories).toEqual([
      {
        id: 'a',
        name: 'Renamed',
        isCredit: false,
        updatedAt: 100,
        legacyIds: ['b'],
      },
    ])
  })
  it('preserves duplicate fields when combining them would destroy different values', () => {
    const state = definitions()
    state.contacts = [contact({ customFields: { x: 'first', y: 'second' } })]
    expect(reconcileSyncDefinitions(state).customFieldDefs).toHaveLength(2)
  })
  it('preserves conflicting values revealed after an earlier alias cleanup', () => {
    const state = definitions()
    state.customFieldDefs = [
      { ...state.customFieldDefs[0], legacyIds: ['y'] },
    ] as typeof state.customFieldDefs
    state.contacts = [contact({ customFields: { x: 'first', y: 'second' } })]
    const repaired = reconcileSyncDefinitions(state)
    expect(repaired.contacts[0].customFields).toEqual({
      x: 'first',
      y: 'second',
    })
    expect(repaired.customFieldDefs.map((def) => def.id).sort()).toEqual([
      'x',
      'y',
    ])
  })
  it('strips expired deleted details while retaining deletion identity', () => {
    const deleted = contact({
      updatedAt: now - DELETED_CONTACT_RETENTION_MS - 1,
      phone: 'private',
      avatar: { type: 'image', value: 'file:///private.jpg' },
    })
    const [expired] = expireDeletedContactDetails([deleted], now)
    expect(expired).toMatchObject({
      id: 'c',
      updatedAt: deleted.updatedAt,
      redacted: true,
      name: '',
    })
    expect(expired.phone).toBeUndefined()
    expect(expired.avatar).toBeUndefined()
    const [legacy] = expireDeletedContactDetails([contact()], now)
    expect(legacy.name).toBe('Name')
    expect(
      expireDeletedContactDetails(
        [legacy],
        now + DELETED_CONTACT_RETENTION_MS
      )[0].redacted
    ).toBe(true)
  })
})

describe('local reminder intent and stale forms', () => {
  it('keeps remote field edits when a stale form saves its own changed fields', () => {
    const original = contact({
      phone: 'old',
      customFields: { a: 'old', b: 'old' },
    })
    const edited = {
      ...original,
      name: 'Edited here',
      customFields: { a: 'new', b: 'old' },
    }
    const current = {
      ...original,
      phone: 'Edited remotely',
      customFields: { a: 'old', b: 'remote' },
      isFavorite: true,
    }
    expect({
      ...current,
      ...contactEditPatch(original, edited, current),
    }).toMatchObject({
      name: 'Edited here',
      phone: 'Edited remotely',
      isFavorite: true,
      customFields: { a: 'new', b: 'remote' },
    })
  })
  it('rebuilds future reminders, respects custom offsets, and omits deleted/dismissed follow-ups', () => {
    const date = new Date(now + 60 * 60_000)
    const followUp = {
      date,
      notifyMe: true,
      notifications: [{ id: 'foreign', date: new Date(now + 30 * 60_000) }],
    }
    const schedule = buildReminderSchedule({
      contacts: [contact()],
      visits: [
        {
          id: 'v',
          date: new Date(now),
          contact: { id: 'c' },
          isBibleStudy: false,
          followUp,
        },
        {
          id: 'deleted',
          date,
          contact: { id: 'gone' },
          isBibleStudy: false,
          followUp,
        },
        {
          id: 'dismissed',
          date,
          contact: { id: 'c' },
          isBibleStudy: false,
          followUp: { ...followUp, dismissed: true },
        },
      ],
      plans: [
        {
          id: 'p',
          date: new Date(now + 24 * 60 * 60_000),
          minutes: 30,
          notifyMe: true,
        },
      ],
      visitOffset: { amount: 5, unit: 'minutes' },
      planOffset: { amount: 10, unit: 'minutes' },
      now,
    })
    expect(schedule.map((item) => item.id)).toEqual([
      'witness-work-visit-v',
      'witness-work-plan-p',
    ])
    expect(schedule[0].date).toEqual(followUp.notifications[0].date)
    expect(
      buildReminderSchedule({
        contacts: [],
        visits: [],
        plans: [],
        visitOffset: { amount: 5, unit: 'minutes' },
        planOffset: { amount: 5, unit: 'minutes' },
        now,
      })
    ).toEqual([])
  })
})
