import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))

import { migrateConversationsPersistedState } from '@/stores/conversationStore'
import { Visit } from '@/types/visit'

const visit = (overrides: Partial<Visit>): Visit => ({
  id: 'v',
  contact: { id: 'c' },
  date: new Date('2026-09-01T10:00:00Z'),
  isBibleStudy: false,
  ...overrides,
})

describe('persist migrate v0 → v1', () => {
  it('strips placeholder follow-ups and keeps intentional ones', () => {
    const placeholder = visit({
      id: 'placeholder',
      updatedAt: 5,
      followUp: { date: new Date('2026-09-08T10:00:00Z'), notifyMe: false },
    })
    const withTopic = visit({
      id: 'topic',
      followUp: {
        date: new Date('2026-09-08T10:00:00Z'),
        notifyMe: false,
        topic: 'Ch. 2',
      },
    })
    const withReminder = visit({
      id: 'reminder',
      followUp: { date: new Date('2026-09-08T10:00:00Z'), notifyMe: true },
    })
    const none = visit({ id: 'none' })

    const migrated = migrateConversationsPersistedState(
      {
        conversations: [placeholder, withTopic, withReminder, none],
        deletedConversations: [{ id: 'gone', deletedAt: 1 }],
      },
      0
    )

    const byId = new Map(
      (migrated.conversations as Visit[]).map((c) => [c.id, c])
    )
    expect(byId.get('placeholder')?.followUp).toBeUndefined()
    // updatedAt is deliberately untouched so an un-upgraded peer neither
    // wins nor loses against the stripped copy.
    expect(byId.get('placeholder')?.updatedAt).toBe(5)
    expect(byId.get('topic')?.followUp?.topic).toBe('Ch. 2')
    expect(byId.get('reminder')?.followUp?.notifyMe).toBe(true)
    expect(byId.get('none')?.followUp).toBeUndefined()
    expect(migrated.deletedConversations).toEqual([
      { id: 'gone', deletedAt: 1 },
    ])
  })

  it('is a no-op from version 1 onward', () => {
    const state = {
      conversations: [
        visit({ followUp: { date: new Date(), notifyMe: false } }),
      ],
    }
    expect(migrateConversationsPersistedState(state, 1)).toBe(state)
  })

  it('tolerates missing conversations', () => {
    expect(migrateConversationsPersistedState({}, 0)).toEqual({
      conversations: [],
    })
  })
})
