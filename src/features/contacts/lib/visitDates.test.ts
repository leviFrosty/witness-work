import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import moment from 'moment'
import { applyFormatRegion, formatDate } from '@/lib/dates'
import { visitDayLabel } from '@/features/contacts/lib/visitDates'

const NOW = new Date('2026-10-14T12:00:00')
const LAST_YEAR = '2025-06-05T09:00:00'

beforeEach(() => applyFormatRegion({ language: 'en' }))

describe('visitDayLabel', () => {
  it('shows the weekday and medium date for another year', () => {
    expect(visitDayLabel(LAST_YEAR, NOW)).toBe('Thu, Jun 5, 2025')
  })

  it.each(['en', 'es', 'de', 'fr', 'pt-br', 'ru', 'ja', 'zh-cn', 'ko'])(
    'reads as before in %s',
    (language) => {
      applyFormatRegion({ language })
      const m = moment(LAST_YEAR)
      expect(visitDayLabel(LAST_YEAR, NOW)).toBe(
        `${m.format('ddd')}, ${formatDate(m, { style: 'medium' })}`
      )
    }
  )

  it('uses the Arabic comma and digits in Arabic', () => {
    applyFormatRegion({ language: 'ar', region: 'ar' })
    const label = visitDayLabel(LAST_YEAR, NOW)
    expect(label).not.toContain(',')
    expect(label).not.toMatch(/[0-9]/)
    expect(label).toBe(
      `${moment(LAST_YEAR).format('ddd')}، ${formatDate(LAST_YEAR, { style: 'medium' })}`
    )
  })
})
