import { describe, expect, it, vi } from 'vitest'
import { ROOM_PARTS } from '@/features/pet/art'
import {
  lockedNoteText,
  roomOptionLabel,
  roomSectionLabel,
  roomTabLabel,
  unlockBadgeText,
  unlockNoteText,
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
  it('counts the active months a locked item still needs', () => {
    expect(unlockBadgeText(1)).toBe('1 more month')
    expect(unlockBadgeText(2)).toBe('2 more months')
    expect(unlockBadgeText(11)).toBe('11 more months')
  })

  it('says a locked item’s streak or months in words', () => {
    expect(unlockRequirementText({ by: 'streak', count: 1 })).toBe(
      'At a streak of 1'
    )
    expect(unlockRequirementText({ by: 'streak', count: 7 })).toBe(
      'At a streak of 7'
    )
    const months = (monthsNeeded: number, thisMonthCounts: boolean) =>
      unlockRequirementText({ by: 'months', monthsNeeded, thisMonthCounts })
    expect(months(1, true)).toBe(
      'Opens once you log time or save a visit or plan this month.'
    )
    expect(months(3, true)).toBe(
      'Opens after 3 months in which you log time or save a visit or plan, this month included.'
    )
    expect(months(1, false)).toBe(
      'Opens the next month you log time or save a visit or plan.'
    )
    expect(months(3, false)).toBe(
      'Opens after 3 more months in which you log time or save a visit or plan, starting next month.'
    )
  })

  it('explains how locked items open up, by mode and streak kind', () => {
    expect(unlockNoteText('streak', 'plans')).toBe(
      'Each item opens up when your streak reaches its number. Plan your ministry and keep your plans to grow it.'
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
    // Hats keep their own pace in months mode.
    expect(unlockNoteText('months', 'plans', 'hat')).toBe(
      'Three open up the first month you log time or save a visit or plan, then one more each month you do.'
    )
    expect(unlockNoteText('streak', 'plans', 'hat')).toBe(
      unlockNoteText('streak', 'plans')
    )
  })

  it('never says how a secret opens up', () => {
    expect(unlockRequirementText({ by: 'secret' })).toBe(
      'A surprise, waiting in its own time.'
    )
    expect(unlockPillText({ by: 'secret' })).toBe('?')
    expect(unlockPillText({ by: 'streak', count: 7 })).toBe('7')
    expect(
      unlockPillText({ by: 'months', monthsNeeded: 1, thisMonthCounts: true })
    ).toBe('1 more month')
  })

  it('adds the secrets to the locked note only while one is locked', () => {
    const regular = unlockNoteText('streak', 'plans', 'bed')
    const note = (locked: { regular: boolean; secret: boolean }) =>
      lockedNoteText('streak', 'plans', 'bed', locked)
    expect(note({ regular: false, secret: false })).toBeNull()
    expect(note({ regular: true, secret: false })).toBe(regular)
    expect(note({ regular: false, secret: true })).toBe(
      'Some items are secrets. They show up along the way.'
    )
    expect(note({ regular: true, secret: true })).toBe(
      `${regular} Some items are secrets. They show up along the way.`
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
