import { describe, expect, it, vi } from 'vitest'
import { ROOM_PARTS } from '@/features/pet/art'
import {
  coinsText,
  currencyInfoText,
  gainedText,
  lockedNoteText,
  priceText,
  roomOptionLabel,
  roomSectionLabel,
  roomTabLabel,
  unlockPillText,
  unlockRequirementText,
} from '@/features/pet/lib/roomLabels'
import { ROOM_TABS, type RoomChoicePart } from '@/features/pet/lib/roomOptions'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})

describe('Decorate Room labels', () => {
  it('says amounts of coins in words', () => {
    expect(coinsText(1)).toBe('1 coin')
    expect(coinsText(6)).toBe('6 coins')
    expect(priceText(7)).toBe('7 coins')
    expect(gainedText(3)).toBe('Earned 3 coins')
    expect(gainedText(0)).toBeNull()
  })

  it('says how coins are earned, with the real numbers', () => {
    expect(currencyInfoText({ monthlyHearts: false, streaks: true })).toBe(
      "Earn 1 coin each day you go out in the ministry (log time or a visit), and 1 more when it's a planned day you keep. Each streak milestone earns 10 coins more. Spend them in the Shop."
    )
    expect(currencyInfoText({ monthlyHearts: true, streaks: false })).toBe(
      'Earn at least 8 coins each month you share in the ministry. Spend them in the Shop.'
    )
  })

  it('says what a locked item costs in the Shop', () => {
    const price = 7
    expect(unlockRequirementText({ by: 'price', price })).toBe(
      'Costs 7 coins in the Shop.'
    )
    expect(unlockPillText({ by: 'price', price })).toBe('7')
  })

  it('never says how a secret opens up', () => {
    expect(unlockRequirementText({ by: 'secret' })).toBe(
      'A surprise, waiting in its own time.'
    )
    expect(unlockPillText({ by: 'secret' })).toBe('?')
  })

  it('adds the secrets to the locked note only while one is locked', () => {
    const shop = 'Get the rest in the Shop with coins.'
    const secrets = 'Some items are secrets. They show up along the way.'
    expect(lockedNoteText({ regular: false, secret: false })).toBeNull()
    expect(lockedNoteText({ regular: true, secret: false })).toBe(shop)
    expect(lockedNoteText({ regular: false, secret: true })).toBe(secrets)
    expect(lockedNoteText({ regular: true, secret: true })).toBe(
      `${shop} ${secrets}`
    )
  })

  it('names every tab, section and option', () => {
    expect(ROOM_TABS.map(roomTabLabel)).toEqual([
      'Hat',
      'Wall',
      'Floor',
      'Bed',
      'Shelf',
      'Light',
      'Sign',
      'Window',
    ])
    expect(roomSectionLabel('windowTime')).toBe('Time of day')
    expect(roomSectionLabel('wallPattern')).toBe('Pattern')
    expect(roomSectionLabel('floor')).toBeNull()
    for (const part of Object.keys(ROOM_PARTS) as RoomChoicePart[])
      for (const option of ROOM_PARTS[part].options)
        expect(roomOptionLabel(part, option)).not.toMatch(/missing|\[/i)
    expect(
      ROOM_PARTS.sign.options.map((option) => roomOptionLabel('sign', option))
    ).toEqual([
      'Nothing',
      'Hours this month',
      'Hours this year',
      'Shared in ministry',
      'Next plan',
      'Conversations',
    ])
    expect(roomOptionLabel('hat', 'none')).toBe('No hat')
    expect(roomOptionLabel('hat', 'tophat')).toBe('Top hat')
  })
})
