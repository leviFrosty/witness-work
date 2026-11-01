import { describe, expect, it } from 'vitest'
import keys from '@/app/watch/watchStringKeys.json'
import { ANNOUNCE_ORDER } from '@/lib/badges/catalog'
import { BADGE_LEVELS } from '@/types/badges'

describe("the Notification Service Extension's strings", () => {
  it('include every badge name and level it may word', () => {
    expect(keys.notificationStrings).toEqual(
      expect.arrayContaining([
        ...ANNOUNCE_ORDER.map((id) => `badge_${id}_name`),
        ...BADGE_LEVELS.map((level) => `badgeLevel_${level}`),
        'badges_titleWithLevel',
      ])
    )
  })
})
