import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))

vi.mock('@/lib/locales', async () => {
  const { default: enUS } = await import('@/locales/en-US.json')
  return {
    default: {
      t: (key: string, options: Record<string, string>) =>
        ((enUS as Record<string, unknown>)[key] as string).replace(
          /{{(\w+)}}/g,
          (_, name: string) => options[name]
        ),
    },
  }
})

import { applyFormatRegion } from '@/lib/dates'
import { planTimeLabel } from '@/features/plans/lib/planTime'

const at = (hours: number, minutes = 0) =>
  new Date(2026, 10, 16, hours, minutes)

beforeEach(() => {
  applyFormatRegion({ language: 'en' })
})

describe('planTimeLabel', () => {
  it('shows only the start until the Plan has a length', () => {
    expect(planTimeLabel(at(9), 0)).toBe('9:00 AM')
  })

  it('derives the end from the length', () => {
    expect(planTimeLabel(at(9), 120)).toBe('9:00 AM – 11:00 AM')
    expect(planTimeLabel(at(9, 30), 45)).toBe('9:30 AM – 10:15 AM')
  })

  it('marks an end past midnight', () => {
    expect(planTimeLabel(at(23), 120)).toBe('11:00 PM – 1:00 AM +1')
  })
})
