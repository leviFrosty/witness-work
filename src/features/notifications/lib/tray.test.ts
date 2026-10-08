import { describe, expect, it } from 'vitest'

import type { NotificationItem } from '@/types/notifications'
import {
  clearableIds,
  hasUnreadNews,
  pruned,
  stamped,
  trayEntries,
  trayGroups,
  TRAY_BOOK_RETENTION_MS,
  unreadCount,
  visibleIds,
} from '@/features/notifications/lib/tray'

const now = Date.parse('2026-09-28T12:00:00.000Z')
const item = (
  id: string,
  extra: Partial<NotificationItem> = {}
): NotificationItem => ({ id, kind: 'backup', title: id, ...extra })
const empty = { arrivals: {}, dismissed: {}, seen: {} }

describe('trayEntries', () => {
  it('lists undismissed items newest first', () => {
    const entries = trayEntries(
      [item('old', { at: now - 2000 }), item('gone'), item('new', { at: now })],
      { ...empty, dismissed: { gone: now - 1000 } },
      now
    )
    expect(entries.map((entry) => entry.item.id)).toEqual(['new', 'old'])
  })

  it('times an item without its own timestamp by when it arrived', () => {
    const [entry] = trayEntries(
      [item('report')],
      { ...empty, arrivals: { report: now - 5000 } },
      now
    )
    expect(entry.at).toBe(now - 5000)
  })

  it('treats anything not yet seen as unread', () => {
    const entries = trayEntries(
      [item('a', { at: 1 }), item('b', { at: 2 })],
      { ...empty, seen: { a: now } },
      now
    )
    expect(unreadCount(entries)).toBe(1)
    expect(entries.find((entry) => entry.unread)?.item.id).toBe('b')
  })
})

describe("buddies' news", () => {
  const entries = (seen: Record<string, number> = {}) =>
    trayEntries(
      [
        item('invite', { at: 1, kind: 'buddies', sticky: true }),
        item('badge', { at: 3, kind: 'buddies', social: true }),
        item('report', { at: 2 }),
        item('reaction', { at: 4, kind: 'buddies', social: true }),
      ],
      { ...empty, seen },
      now
    )

  it('never counts toward the bell or the app icon', () => {
    expect(unreadCount(entries())).toBe(2)
    expect(unreadCount(entries({ invite: now, report: now }))).toBe(0)
  })

  it('shows the quiet dot only while some news is unread', () => {
    expect(hasUnreadNews(entries({ badge: now }))).toBe(true)
    expect(hasUnreadNews(entries({ badge: now, reaction: now }))).toBe(false)
  })

  it('groups news below everything else, each newest first', () => {
    const { main, news } = trayGroups(entries())
    expect(main.map((entry) => entry.item.id)).toEqual(['report', 'invite'])
    expect(news.map((entry) => entry.item.id)).toEqual(['reaction', 'badge'])
  })

  it('clears with Clear All', () => {
    expect(clearableIds(entries())).toEqual(['reaction', 'badge', 'report'])
  })
})

describe('clearableIds', () => {
  it('keeps sticky items through Clear All', () => {
    const entries = trayEntries(
      [item('invite', { sticky: true }), item('backup')],
      empty,
      now
    )
    expect(clearableIds(entries)).toEqual(['backup'])
  })
})

describe('stamped', () => {
  it('keeps the first stamp and the same record when nothing is new', () => {
    const record = { a: 1 }
    expect(stamped(record, ['a'], now)).toBe(record)
    expect(stamped(record, ['a', 'b'], now)).toEqual({ a: 1, b: now })
  })
})

describe('pruned', () => {
  it('forgets entries older than the retention window', () => {
    expect(
      pruned({ fresh: now - 1000, stale: now - TRAY_BOOK_RETENTION_MS }, now)
    ).toEqual({ fresh: now - 1000 })
  })
})

describe('visibleIds', () => {
  const layouts = {
    top: { y: 0, height: 100 },
    half: { y: 250, height: 100 },
    below: { y: 320, height: 100 },
    tall: { y: 400, height: 1000 },
  }

  it('counts rows at least half on screen as shown', () => {
    expect(visibleIds(layouts, { offset: 0, height: 300 })).toEqual([
      'top',
      'half',
    ])
  })

  it('follows scrolling, and a row taller than the viewport', () => {
    expect(visibleIds(layouts, { offset: 300, height: 300 })).toEqual([
      'half',
      'below',
      'tall',
    ])
  })

  it('shows nothing before the viewport is measured', () => {
    expect(visibleIds(layouts, { offset: 0, height: 0 })).toEqual([])
  })
})
