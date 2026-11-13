import { describe, expect, it } from 'vitest'
import {
  guestLinkDays,
  guestLinkLifetimeMs,
  linkDaysLeft,
} from '@/features/territories/lib/linkLifetime'

describe('guest link lifetime', () => {
  it('keeps a saved choice it offers, and falls back to a day', () => {
    expect(guestLinkDays(7)).toBe(7)
    expect(guestLinkDays(30)).toBe(30)
    for (const saved of [undefined, null, 0, 2, 31, '7'])
      expect(guestLinkDays(saved)).toBe(1)
  })

  it('counts whole days', () => {
    expect(guestLinkLifetimeMs(3)).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('names the choice a link still matches, until half a day has gone', () => {
    const DAY = 24 * 60 * 60 * 1000
    expect(linkDaysLeft(7 * DAY, 0)).toBe(7)
    expect(linkDaysLeft(7 * DAY, DAY / 4)).toBe(7)
    expect(linkDaysLeft(7 * DAY, DAY)).toBeNull()
    expect(linkDaysLeft(DAY, DAY / 4)).toBe(1)
    expect(linkDaysLeft(undefined, 0)).toBeNull()
  })
})
