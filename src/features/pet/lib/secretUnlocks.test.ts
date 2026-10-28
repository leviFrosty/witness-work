import { describe, expect, it } from 'vitest'
import { ALL_BADGE_KEYS } from '@/lib/badges/catalog'
import { SECRET_ROOM_ITEMS } from '@/types/pet'
import {
  isSecretItem,
  SECRET_UNLOCKS,
  secretItemsEarnedBy,
  secretRuleMet,
  type SecretProgress,
} from '@/features/pet/lib/secretUnlocks'

const NOTHING: SecretProgress = {
  badges: new Set(),
  keepsakes: 0,
  gold: false,
  monthsOut: 0,
}

describe('secret room items', () => {
  it('has at least ten secrets in every part, each with a rule', () => {
    const parts = new Map<string, number>()
    for (const item of SECRET_ROOM_ITEMS) {
      const part = item.split(':')[0]
      parts.set(part, (parts.get(part) ?? 0) + 1)
      expect(SECRET_UNLOCKS[item]).toBeDefined()
    }
    expect([...parts.keys()].sort()).toEqual(
      [
        'bed',
        'floor',
        'hat',
        'lamp',
        'shelf',
        'wallColor',
        'wallPattern',
      ].sort()
    )
    for (const count of parts.values()) expect(count).toBeGreaterThanOrEqual(10)
    expect(new Set(SECRET_ROOM_ITEMS).size).toBe(SECRET_ROOM_ITEMS.length)
  })

  it('only asks for badges the catalog awards, and none that need Buddies', () => {
    for (const rule of Object.values(SECRET_UNLOCKS)) {
      if (rule.by !== 'badge') continue
      expect(ALL_BADGE_KEYS).toContain(rule.badge)
      expect(rule.badge).not.toMatch(/^(together|firstBuddy)/)
    }
  })

  it('opens no badge more than two secrets', () => {
    const counts = new Map<string, number>()
    for (const rule of Object.values(SECRET_UNLOCKS))
      if (rule.by === 'badge')
        counts.set(rule.badge, (counts.get(rule.badge) ?? 0) + 1)
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2)
  })

  it('opens nothing for a new User', () => {
    expect(secretItemsEarnedBy(NOTHING)).toEqual([])
  })

  it('opens a badge’s secrets once the badge is earned', () => {
    const earned = secretItemsEarnedBy({
      ...NOTHING,
      badges: new Set(['monthsShared.1']),
    })
    expect(earned).toEqual(['hat:duck', 'bed:donut'])
  })

  it('counts badges, keepsakes and gold', () => {
    const five = new Set(ALL_BADGE_KEYS.slice(0, 5))
    expect(
      secretRuleMet({ by: 'badges', count: 5 }, { ...NOTHING, badges: five })
    ).toBe(true)
    expect(
      secretRuleMet({ by: 'badges', count: 6 }, { ...NOTHING, badges: five })
    ).toBe(false)
    expect(
      secretRuleMet({ by: 'keepsakes', count: 3 }, { ...NOTHING, keepsakes: 3 })
    ).toBe(true)
    expect(
      secretRuleMet({ by: 'keepsakes', count: 3 }, { ...NOTHING, keepsakes: 2 })
    ).toBe(false)
    expect(secretRuleMet({ by: 'gold' }, { ...NOTHING, gold: true })).toBe(true)
    expect(secretRuleMet({ by: 'gold' }, NOTHING)).toBe(false)
  })

  it('opens a long run after that many months with a day out', () => {
    const rule = { by: 'longRun', months: 15 } as const
    expect(secretRuleMet(rule, { ...NOTHING, monthsOut: 15 })).toBe(true)
    expect(secretRuleMet(rule, { ...NOTHING, monthsOut: 14 })).toBe(false)
  })

  it('tells secrets from other items', () => {
    expect(isSecretItem('hat:duck')).toBe(true)
    expect(isSecretItem('hat:bow')).toBe(false)
    expect(isSecretItem('floor:wood')).toBe(false)
  })
})
