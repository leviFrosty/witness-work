import { describe, expect, it } from 'vitest'
import {
  followUpCardKey,
  isFollowUpCardDismissed,
} from '@/features/visits/lib/followUpCards'
import type { Visit } from '@/types/visit'

const visit = (id: string, date: string): Visit =>
  ({
    id,
    contact: { id: `contact-${id}` },
    date: new Date('2026-01-01'),
    followUp: { date: new Date(date), notifyMe: false },
  }) as Visit

describe('features/visits/lib/followUpCards', () => {
  const a = visit('a', '2026-02-01T10:00:00Z')
  const b = visit('b', '2026-02-02T10:00:00Z')

  it('shows a card that was never closed', () => {
    expect(isFollowUpCardDismissed([a], undefined)).toBe(false)
  })

  it('keeps a closed card hidden while it shows the same follow-ups', () => {
    const closed = [a, b].map(followUpCardKey)
    expect(isFollowUpCardDismissed([a, b], closed)).toBe(true)
    // One was handled since: still nothing new.
    expect(isFollowUpCardDismissed([b], closed)).toBe(true)
  })

  it('brings a closed card back for a new follow-up', () => {
    const closed = [a].map(followUpCardKey)
    expect(isFollowUpCardDismissed([a, b], closed)).toBe(false)
  })

  it('brings a closed card back when a follow-up is rescheduled', () => {
    const closed = [a].map(followUpCardKey)
    const rescheduled = visit('a', '2026-02-09T10:00:00Z')
    expect(isFollowUpCardDismissed([rescheduled], closed)).toBe(false)
  })
})
