import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})

import { notesImportScheduleCopy } from '@/features/notes-import/lib/notesImportScheduleCopy'

describe('notesImportScheduleCopy', () => {
  it('uses singular English grammar for configured allowances of one', () => {
    expect(
      notesImportScheduleCopy({
        imports: { free: 1, supporter: 2 },
        refinements: { free: 1, supporter: 2 },
        windowDays: 1,
      })
    ).toEqual({
      freeImports: '1 / 1-day window',
      supporterImports: '2 / 1-day window',
      freeRefinements: '1 refinement per import',
      supporterRefinements: '2 refinements per import',
    })
  })
})
