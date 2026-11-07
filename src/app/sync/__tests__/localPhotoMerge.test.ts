import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import {
  MARKER_PROFILE,
  markerForContact,
} from '@/lib/syncTransport/imageNames'
import type { Contact } from '@/types/contact'

type LocalState = Parameters<typeof mergePayload>[0]

const NOW = Date.now()
const OLD = NOW - 10_000
const NEWER = NOW - 1_000

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
const BLOB_URL =
  'blob:http://localhost:8081/0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d'
const FILE_URL = 'file:///test/Documents/contact-c1-avatar-r1.jpg?t=1'

const contact = (updatedAt: number, avatarValue: string, extra = {}) =>
  ({
    id: 'c1',
    name: 'Ana Ruiz',
    createdAt: new Date(0),
    updatedAt,
    avatar: { type: 'image', value: avatarValue, revision: 'r1' },
    ...extra,
  }) as unknown as Contact

const localState = (
  contactAvatar: string,
  profileAvatar: string
): LocalState => ({
  contacts: [contact(OLD, contactAvatar)],
  deletedContacts: [],
  customFieldDefs: [],
  deletedCustomFieldDefs: [],
  conversations: [],
  deletedConversations: [],
  serviceReports: {},
  dayPlans: [],
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
  pets: [],
  petRooms: [],
  deletedPetRecords: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {
    name: 'Sam',
    avatar: { type: 'image', value: profileAvatar, revision: 'p1' },
  },
  profileUpdatedAt: { name: OLD, avatar: OLD },
})

const phoneEdit = (revisions = { contact: 'r1', profile: 'p1' }): SyncPayload =>
  ({
    version: 1,
    writtenAt: NEWER,
    deviceId: 'phone',
    contactStore: {
      contacts: [
        {
          ...contact(NEWER, markerForContact('c1')),
          name: 'Ana Ruiz Soto',
          avatar: {
            type: 'image',
            value: markerForContact('c1'),
            revision: revisions.contact,
          },
        },
      ],
      deletedContacts: [],
      customFieldDefs: [],
      deletedCustomFieldDefs: [],
    },
    conversationStore: { conversations: [], deletedConversations: [] },
    serviceReportStore: {
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
      deletedServiceReports: [],
    },
    categoryStore: { categories: [], deletedCategories: [] },
    preferencesStore: { values: {}, updatedAt: {} },
    profileStore: {
      values: {
        name: 'Sam',
        avatar: {
          type: 'image',
          value: MARKER_PROFILE,
          revision: revisions.profile,

          backgroundColor: '#336699',
        },
      },
      updatedAt: { name: OLD, avatar: NEWER },
    },
  }) as unknown as SyncPayload

describe('mergePayload — photos kept on this device', () => {
  it.each([
    ['a data: URL (the web)', DATA_URL],
    ['a blob: URL (the web)', BLOB_URL],
    ['a file:// URI (a phone)', FILE_URL],
  ])(
    'keeps a Contact photo held as %s when a newer remote edit wins',
    (_, value) => {
      const result = mergePayload(localState(value, value), phoneEdit())

      const merged = result.contacts.find((c) => c.id === 'c1')!
      expect(merged.name).toBe('Ana Ruiz Soto')
      expect(merged.avatar).toEqual({
        type: 'image',
        value,
        revision: 'r1',
      })
    }
  )

  it.each([
    ['a data: URL (the web)', DATA_URL],
    ['a blob: URL (the web)', BLOB_URL],
    ['a file:// URI (a phone)', FILE_URL],
  ])(
    'keeps the profile photo held as %s when a newer remote edit wins',
    (_, value) => {
      const result = mergePayload(localState(value, value), phoneEdit())

      expect(result.profileValues.avatar).toEqual({
        type: 'image',
        value,
        revision: 'p1',
        backgroundColor: '#336699',
      })
      expect(result.profileUpdatedAt.avatar).toBe(NEWER)
    }
  )

  it('takes the remote marker when the photo itself changed', () => {
    const result = mergePayload(
      localState(DATA_URL, DATA_URL),
      phoneEdit({ contact: 'r2', profile: 'p2' })
    )

    expect(result.contacts[0].avatar).toEqual({
      type: 'image',
      value: markerForContact('c1'),
      revision: 'r2',
    })
    expect(result.profileValues.avatar).toMatchObject({
      value: MARKER_PROFILE,
      revision: 'p2',
    })
  })

  describe('against a copy with no photo', () => {
    const phoneCopy = (avatar?: object): SyncPayload => {
      const payload = phoneEdit()
      const [c] = payload.contactStore.contacts as Contact[]
      const { avatar: _photo, ...rest } = c
      payload.contactStore.contacts = [
        (avatar ? { ...rest, avatar } : rest) as Contact,
      ]
      const values = payload.profileStore!.values as Record<string, unknown>
      if (avatar) values.avatar = avatar
      else delete values.avatar
      return payload
    }

    it.each([
      ['none', { type: 'none', value: '' }],
      ['absent', undefined],
    ])('keeps the web’s own photo when the newer copy has %s', (_, avatar) => {
      const result = mergePayload(
        localState(DATA_URL, BLOB_URL),
        phoneCopy(avatar)
      )

      expect(result.contacts[0].name).toBe('Ana Ruiz Soto')
      expect(result.contacts[0].avatar).toEqual({
        type: 'image',
        value: DATA_URL,
        revision: 'r1',
      })
      if (avatar)
        expect(result.profileValues.avatar).toEqual({
          type: 'image',
          value: BLOB_URL,
          revision: 'p1',
        })
    })

    it('takes a removal of a phone’s own photo', () => {
      const result = mergePayload(
        localState(FILE_URL, FILE_URL),
        phoneCopy({ type: 'none', value: '' })
      )
      expect(result.contacts[0].avatar).toEqual({ type: 'none', value: '' })
      expect(result.profileValues.avatar).toEqual({ type: 'none', value: '' })
    })

    it('takes an emoji chosen on another device', () => {
      const emoji = { type: 'emoji', value: '🌻' }
      const result = mergePayload(
        localState(DATA_URL, DATA_URL),
        phoneCopy(emoji)
      )
      expect(result.contacts[0].avatar).toEqual(emoji)
      expect(result.profileValues.avatar).toEqual(emoji)
    })
  })

  it("doesn't keep a marker or a remote URL as if it were local", () => {
    const result = mergePayload(
      localState(markerForContact('c1'), 'https://example.com/a.jpg'),
      phoneEdit()
    )

    expect(result.contacts[0].avatar?.value).toBe(markerForContact('c1'))
    expect((result.profileValues.avatar as { value: string }).value).toBe(
      MARKER_PROFILE
    )
  })
})
