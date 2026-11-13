import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})
import { hourTicks, pointsText } from '@/features/territories/lib/insightsText'

describe('hourTicks', () => {
  it('labels every other hour, naming AM and PM where they start', () => {
    expect([...hourTicks(9, 18)]).toEqual([
      [9, '9 AM'],
      [11, '11'],
      [13, '1 PM'],
      [15, '3'],
      [17, '5'],
    ])
  })

  it('names PM on the first tick of an afternoon chart', () => {
    expect([...hourTicks(14, 19).values()]).toEqual(['2 PM', '4', '6'])
  })
})

describe('pointsText', () => {
  it('signs each difference in percentage points', () => {
    expect(pointsText(0.224)).toBe('+22')
    expect(pointsText(-0.35)).toBe('−35')
    expect(pointsText(0.001)).toBe('0')
  })
})
