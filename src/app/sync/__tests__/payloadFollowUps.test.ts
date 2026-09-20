import { describe, expect, it } from 'vitest'
import { normalizeLegacyFollowUps } from '@/app/sync/payloadFollowUps'
import type { Visit } from '@/types/visit'

const visit = (overrides: Partial<Visit>): Visit => ({
  id: 'v',
  contact: { id: 'c' },
  date: new Date('2026-09-01T10:00:00Z'),
  isBibleStudy: false,
  ...overrides,
})

const placeholder = () =>
  visit({
    id: 'placeholder',
    updatedAt: 10,
    followUp: { date: new Date('2026-09-08T10:00:00Z'), notifyMe: false },
  })

describe('normalizeLegacyFollowUps', () => {
  it('strips placeholder follow-ups from a payload without the marker', () => {
    const withTopic = visit({
      id: 'topic',
      followUp: {
        date: new Date('2026-09-08T10:00:00Z'),
        notifyMe: false,
        topic: 'Ch. 3',
      },
    })
    const d = {
      conversationStore: { conversations: [placeholder(), withTopic] },
    }
    normalizeLegacyFollowUps(d)
    const [a, b] = d.conversationStore.conversations
    expect(a.followUp).toBeUndefined()
    expect(a.updatedAt).toBe(10)
    expect(b.followUp?.topic).toBe('Ch. 3')
  })

  it('leaves a marked payload untouched so date-only follow-ups survive', () => {
    const d = {
      conversationStore: {
        conversations: [placeholder()],
        explicitFollowUps: true,
      },
    }
    normalizeLegacyFollowUps(d)
    expect(d.conversationStore.conversations[0].followUp).toBeDefined()
  })

  it('no-ops on missing or malformed conversation stores', () => {
    expect(() => normalizeLegacyFollowUps({})).not.toThrow()
    expect(() =>
      normalizeLegacyFollowUps({ conversationStore: null })
    ).not.toThrow()
    expect(() =>
      normalizeLegacyFollowUps({ conversationStore: { conversations: null } })
    ).not.toThrow()
  })
})
