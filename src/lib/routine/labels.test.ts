import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})
import { chaptersLabel, habitLabel, portionLabel } from '@/lib/routine/labels'
import { planPortion } from '@/lib/routine/readingPlans'

describe('routine labels', () => {
  it('names a portion by book and chapter range', () => {
    const portion = planPortion(
      { kind: 'canonical', startBook: undefined, chaptersPerDay: undefined },
      0
    )!
    expect(portionLabel(portion)).toBe('Genesis 1–3')
  })

  it('joins ranges that cross into the next book', () => {
    expect(
      chaptersLabel([
        { book: 0, chapter: 50 },
        { book: 1, chapter: 1 },
        { book: 1, chapter: 2 },
      ])
    ).toBe('Genesis 50; Exodus 1–2')
  })

  it('reads nothing for no chapters', () => {
    expect(chaptersLabel([])).toBe('')
  })

  it('names worship for the household', () => {
    expect(habitLabel('worship')).toBe('Family worship')
    expect(habitLabel('worship', 'personal')).toBe('Personal worship evening')
    expect(habitLabel('bibleReading', 'personal')).toBe('Bible reading')
  })
})
