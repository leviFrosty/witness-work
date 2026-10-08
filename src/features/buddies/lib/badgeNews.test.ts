import { describe, expect, it } from 'vitest'

import { buddyNews, newsWhen } from '@/features/buddies/lib/badgeNews'
import type { BuddyNotification } from '@/features/buddies/lib/state'

const now = new Date(2026, 9, 8, 15, 0).getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const entry = (
  id: string,
  hoursAgo: number,
  extra: Partial<BuddyNotification> = {}
): BuddyNotification => ({
  id,
  kind: 'badge',
  at: now - hoursAgo * HOUR,
  read: false,
  from: 'tomas',
  name: 'Tomás',
  badges: [{ c: 'prepared', l: 2 }],
  ...extra,
})

describe('buddyNews', () => {
  it("folds a buddy's badges within 20 hours of their newest into one row", () => {
    const rows = buddyNews([
      entry('older', 9, { badges: [{ c: 'conversations', l: 2 }] }),
      entry('newest', 1, {
        badges: [
          { c: 'yearRound', l: 1 },
          { c: 'prepared', l: 2 },
        ],
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].ids).toEqual(['newest', 'older'])
    expect(rows[0].entry.id).toBe('newest')
    expect(rows[0].entry.badges).toEqual([
      { c: 'yearRound', l: 1 },
      { c: 'prepared', l: 2 },
      { c: 'conversations', l: 2 },
    ])
  })

  it('starts a new row once news is 20 hours older than the newest', () => {
    const rows = buddyNews([
      entry('a', 1),
      entry('b', 15),
      entry('c', 21),
      entry('d', 30),
    ])
    expect(rows.map((row) => row.ids)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('keeps buddies apart, newest first', () => {
    const rows = buddyNews([
      entry('tomas', 5),
      entry('grace', 2, { from: 'grace', name: 'Grace' }),
      entry('tomas-2', 1),
    ])
    expect(rows.map((row) => row.ids)).toEqual([
      ['tomas-2', 'tomas'],
      ['grace'],
    ])
  })

  it('names a collection once, at its highest level', () => {
    const [row] = buddyNews([
      entry('old', 6, { badges: [{ c: 'yearRound', l: 1 }] }),
      entry('new', 1, { badges: [{ c: 'yearRound', l: 2 }] }),
    ])
    expect(row.entry.badges).toEqual([{ c: 'yearRound', l: 2 }])
    const [stale] = buddyNews([
      entry('old', 6, {
        badges: [
          { c: 'prepared', l: 1 },
          { c: 'yearRound', l: 3 },
        ],
      }),
      entry('new', 1, { badges: [{ c: 'yearRound', l: 2 }] }),
    ])
    expect(stale.entry.badges).toEqual([
      { c: 'yearRound', l: 3 },
      { c: 'prepared', l: 1 },
    ])
  })

  it('is read only once every entry in the row is', () => {
    const [unread] = buddyNews([entry('a', 1, { read: true }), entry('b', 2)])
    expect(unread.entry.read).toBe(false)
    const [read] = buddyNews([
      entry('a', 1, { read: true }),
      entry('b', 2, { read: true }),
    ])
    expect(read.entry.read).toBe(true)
  })

  it('lists reactions as they are and leaves out logistics', () => {
    const rows = buddyNews([
      entry('reaction', 2, {
        kind: 'badgeReaction',
        reaction: 'clap',
        badges: [{ c: 'yearRound', l: 1 }],
      }),
      entry('reaction-2', 3, {
        kind: 'badgeReaction',
        reaction: 'party',
        badges: [{ c: 'prepared', l: 1 }],
      }),
      entry('invite', 1, { kind: 'shareInvite', badges: undefined }),
    ])
    expect(rows.map((row) => row.ids)).toEqual([['reaction'], ['reaction-2']])
  })
})

describe('newsWhen', () => {
  it('says only Today, This week, or Earlier', () => {
    expect(newsWhen(now - 14 * HOUR, now)).toBe('today')
    expect(newsWhen(now + 5 * 60 * 1000, now)).toBe('today')
    expect(newsWhen(now - 16 * HOUR, now)).toBe('thisWeek')
    expect(newsWhen(now - 6 * DAY, now)).toBe('thisWeek')
    expect(newsWhen(now - 8 * DAY, now)).toBe('earlier')
  })
})
