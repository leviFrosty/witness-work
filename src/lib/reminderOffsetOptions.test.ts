import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [],
}))

vi.mock('@/lib/minutes', () => ({ formatMinutes: vi.fn() }))

import {
  isReminderPreset,
  REMINDER_OFFSET_OTHER,
  reminderOffsetLabel,
  reminderOffsetOptions,
} from '@/lib/reminderOffsetOptions'

describe('reminderOffsetLabel', () => {
  it('words a reminder at the start time on its own', () => {
    expect(reminderOffsetLabel(0)).toBe('reminderOffset_atTime')
  })

  it('words a lead time in its largest whole unit', () => {
    expect(reminderOffsetLabel(15)).toBe(
      'reminderOffset_before {"lead":"reminderLeadMinutes {\\"count\\":15}"}'
    )
    expect(reminderOffsetLabel(120)).toBe(
      'reminderOffset_before {"lead":"reminderLeadHours {\\"count\\":2}"}'
    )
    expect(reminderOffsetLabel(1440)).toBe(
      'reminderOffset_before {"lead":"reminderLeadDays {\\"count\\":1}"}'
    )
    expect(reminderOffsetLabel(90)).toBe(
      'reminderOffset_before {"lead":"reminderLeadMinutes {\\"count\\":90}"}'
    )
  })
})

describe('reminderOffsetOptions', () => {
  it('offers the presets from the start time to a day before, then Other', () => {
    expect(reminderOffsetOptions().map((option) => option.value)).toEqual([
      0,
      5,
      10,
      15,
      30,
      60,
      120,
      1440,
      REMINDER_OFFSET_OTHER,
    ])
    expect(reminderOffsetOptions().at(-1)?.label).toBe(
      'reminderOffset_otherLeadTime'
    )
  })
})

describe('isReminderPreset', () => {
  it('tells a preset from a lead time that needs Other', () => {
    expect(isReminderPreset(30)).toBe(true)
    expect(isReminderPreset(0)).toBe(true)
    expect(isReminderPreset(45)).toBe(false)
    expect(isReminderPreset(2 * 7 * 1440)).toBe(false)
    expect(isReminderPreset(null)).toBe(false)
  })
})
