import { describe, expect, it } from 'vitest'
import {
  getOpenFollowUp,
  getUpNext,
} from '@/features/contacts/lib/visitTimeline'
import { Visit } from '@/types/visit'

const NOW = new Date('2026-11-10T12:00:00')
const day = 86400000
const at = (days: number) => new Date(NOW.getTime() + days * day)

const visit = (
  id: string,
  days: number,
  extra: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: 'c' },
  date: at(days),
  isBibleStudy: false,
  ...extra,
})

describe('getUpNext', () => {
  it('keeps a follow-up ahead when a same-day try found no one home', () => {
    const visits = [
      visit('a', -3, { followUp: { date: at(0.25), notifyMe: false } }),
      visit('b', -0.1, { notAtHome: true }),
    ]
    expect(getUpNext(visits, NOW)).toMatchObject({ visit: { id: 'a' } })
  })

  it('drops a follow-up once a conversation answers it', () => {
    const visits = [
      visit('a', -3, { followUp: { date: at(0.25), notifyMe: false } }),
      visit('b', -0.1),
    ]
    expect(getUpNext(visits, NOW)).toBeNull()
  })
})

describe('getOpenFollowUp', () => {
  it('returns a follow-up whose date passed with no later visit', () => {
    const visits = [
      visit('a', -10, {
        followUp: { date: at(-2), notifyMe: false, topic: ' Brochure ' },
      }),
    ]
    expect(getOpenFollowUp(visits, NOW)).toMatchObject({
      visit: { id: 'a' },
      date: at(-2),
      topic: 'Brochure',
      attempted: false,
    })
    expect(getUpNext(visits, NOW)).toBeNull()
  })

  it('stays open when the only later visits found no one home', () => {
    const visits = [
      visit('a', -10, { followUp: { date: at(-2), notifyMe: false } }),
      visit('b', -1, { notAtHome: true }),
    ]
    expect(getOpenFollowUp(visits, NOW)).toMatchObject({
      visit: { id: 'a' },
      attempted: true,
    })
  })

  it('ignores follow-ups that are ahead, kept by a conversation, or dismissed', () => {
    const ahead = [
      visit('a', -3, { followUp: { date: at(2), notifyMe: true } }),
    ]
    const kept = [
      visit('a', -10, { followUp: { date: at(-5), notifyMe: false } }),
      visit('b', -4, { notAtHome: true }),
      visit('c', -3),
    ]
    const dismissed = [
      visit('a', -10, {
        followUp: { date: at(-5), notifyMe: false, dismissed: true },
      }),
    ]
    expect(getOpenFollowUp(ahead, NOW)).toBeNull()
    expect(getOpenFollowUp(kept, NOW)).toBeNull()
    expect(getOpenFollowUp(dismissed, NOW)).toBeNull()
  })

  it('returns nothing without visits', () => {
    expect(getOpenFollowUp([], NOW)).toBeNull()
  })
})
