import { describe, expect, it, vi } from 'vitest'
import { ROOM_PARTS } from '@/features/pet/art'
import {
  roomOptionLabel,
  roomSectionLabel,
  roomTabLabel,
  unlockBadgeText,
  unlockNoteText,
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
  it('says when a locked item opens up', () => {
    expect(unlockBadgeText(0)).toBe('This month')
    expect(unlockBadgeText(1)).toBe('Next month')
    expect(unlockBadgeText(2)).toBe('In 2 months')
    expect(unlockBadgeText(11)).toBe('In 11 months')
  })

  it('says a locked item’s streak or months in words', () => {
    expect(unlockRequirementText({ by: 'streak', count: 1 })).toBe(
      'At a streak of 1'
    )
    expect(unlockRequirementText({ by: 'streak', count: 7 })).toBe(
      'At a streak of 7'
    )
    expect(unlockRequirementText({ by: 'months', monthsFromNow: 1 })).toBe(
      'Next month'
    )
  })

  it('explains how locked items open up, by mode and streak kind', () => {
    expect(unlockNoteText('streak', 'plans')).toBe(
      'Each item opens up when your streak reaches its number. Keep your plans to grow it.'
    )
    expect(unlockNoteText('streak', 'months')).toBe(
      'Each item opens up when your streak reaches its number. Share in the ministry each month to grow it.'
    )
    expect(unlockNoteText('months', 'plans')).toBe(
      'One more opens up each month you log time or save a visit or plan.'
    )
    expect(unlockNoteText('months', 'months')).toBe(
      unlockNoteText('months', 'plans')
    )
  })

  it('names every tab, section and option', () => {
    expect(ROOM_TABS.map(roomTabLabel)).toEqual([
      'Window',
      'Wall',
      'Floor',
      'Bed',
      'Shelf',
      'Light',
      'Sign',
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
  })
})
