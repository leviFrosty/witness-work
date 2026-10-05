import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated-field' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { mergePayload } from '@/app/sync/merge'
import { payloadSchema } from '@/app/sync/payloadValidation'
import type { SyncPayload } from '@/app/sync/payload'
import { emptyDevice } from '@/__tests__/helpers/syncPeer'
import useConversations from '@/stores/conversationStore'
import type {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'
import type { Visit } from '@/types/visit'

const now = Date.now()

const publication: CustomFieldDefinition = {
  id: 'field-publication',
  label: 'Publication',
  order: 0,
  createdAt: now - 10_000,
  updatedAt: now - 10_000,
}

const visit = (
  id: string,
  customFields?: Record<string, string>,
  updatedAt = now - 5_000
): Visit => ({
  id,
  contact: { id: 'contact-1' },
  date: new Date('2026-01-01T12:00:00.000Z'),
  isBibleStudy: false,
  updatedAt,
  ...(customFields ? { customFields } : {}),
})

const remote = (
  conversationStore: Partial<SyncPayload['conversationStore']>
): SyncPayload => ({
  version: 1,
  writtenAt: now,
  deviceId: 'remote-device',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [], ...conversationStore },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})

beforeEach(() => {
  useConversations.getState().set({
    conversations: [],
    deletedConversations: [],
    conversationFieldDefs: [],
    deletedConversationFieldDefs: [],
  })
})

describe('conversation field definitions', () => {
  it('adds a trimmed field and returns the existing one for a duplicate', () => {
    const store = useConversations.getState()
    const created = store.addConversationFieldDef('  Publication ')
    expect(created).toMatchObject({ label: 'Publication', order: 0 })
    expect(store.addConversationFieldDef('Publication')).toEqual(created)
    expect(store.addConversationFieldDef('   ')).toBeNull()
    expect(useConversations.getState().conversationFieldDefs).toHaveLength(1)
  })

  it('archives before purging, and purging strips every visit value', () => {
    useConversations.getState().set({
      conversationFieldDefs: [publication],
      conversations: [
        visit('v1', { [publication.id]: 'Enjoy Life', other: 'kept' }),
        visit('v2'),
      ],
    })
    const store = useConversations.getState()

    store.purgeConversationFieldDef(publication.id)
    expect(useConversations.getState().conversationFieldDefs).toHaveLength(1)

    store.archiveConversationFieldDef(publication.id)
    store.purgeConversationFieldDef(publication.id)
    const state = useConversations.getState()
    expect(state.conversationFieldDefs).toEqual([])
    expect(state.deletedConversationFieldDefs.map((t) => t.id)).toEqual([
      publication.id,
    ])
    expect(state.conversations[0].customFields).toEqual({ other: 'kept' })
    expect(state.conversations[1]).toEqual(visit('v2'))
  })

  it('drops values for deleted fields when a visit is saved', () => {
    useConversations.getState().set({
      deletedConversationFieldDefs: [{ id: publication.id, deletedAt: now }],
    })
    const store = useConversations.getState()
    store.addConversation(visit('v1', { [publication.id]: 'stale', a: 'x' }))
    expect(useConversations.getState().conversations[0].customFields).toEqual({
      a: 'x',
    })
    store.updateConversation({
      id: 'v1',
      customFields: { [publication.id]: 'stale', a: 'y' },
    })
    expect(useConversations.getState().conversations[0].customFields).toEqual({
      a: 'y',
    })
  })
})

describe('mergePayload — conversation fields', () => {
  it('adopts remote definitions and visit values', () => {
    const result = mergePayload(
      emptyDevice(),
      remote({
        conversations: [visit('v1', { [publication.id]: 'Enjoy Life' })],
        conversationFieldDefs: [publication],
      })
    )
    expect(result.changed).toBe(true)
    expect(result.conversationFieldDefs).toEqual([publication])
    expect(result.conversations[0].customFields).toEqual({
      [publication.id]: 'Enjoy Life',
    })
  })

  it('keeps local definitions when a peer predates conversation fields', () => {
    const result = mergePayload(
      emptyDevice({ conversationFieldDefs: [publication] }),
      remote({})
    )
    expect(result.changed).toBe(false)
    expect(result.conversationFieldDefs).toEqual([publication])
  })

  it('applies a remote purge to definitions and to stale local values', () => {
    const tombstone: CustomFieldTombstone = {
      id: publication.id,
      deletedAt: now - 1_000,
    }
    const stale = visit('v1', { [publication.id]: 'Enjoy Life' })
    const result = mergePayload(
      emptyDevice({
        conversationFieldDefs: [{ ...publication, updatedAt: now - 500 }],
        conversations: [stale],
      }),
      remote({ deletedConversationFieldDefs: [tombstone] })
    )
    expect(result.conversationFieldDefs).toEqual([])
    expect(result.deletedConversationFieldDefs).toEqual([tombstone])
    expect(result.conversations[0].customFields).toEqual({})
    // Cleanup keeps the visit's LWW timestamp.
    expect(result.conversations[0].updatedAt).toBe(stale.updatedAt)
  })

  it('validates the new payload keys', () => {
    const payload = remote({
      conversations: [visit('v1', { [publication.id]: 'Enjoy Life' })],
      conversationFieldDefs: [publication],
      deletedConversationFieldDefs: [{ id: 'gone', deletedAt: now }],
    })
    const parsed = payloadSchema.parse(JSON.parse(JSON.stringify(payload)))
    expect(parsed.conversationStore.conversationFieldDefs).toHaveLength(1)
    expect(parsed.conversationStore.conversations[0].customFields).toEqual({
      [publication.id]: 'Enjoy Life',
    })
  })
})
