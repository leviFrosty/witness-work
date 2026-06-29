import { describe, expect, it } from 'vitest'
import {
  normalizeNotesImportCredits,
  shouldShowNotesImportSupporterCta,
} from '@/features/notes-import/lib/notesImportUsage'

describe('normalizeNotesImportCredits', () => {
  it('fills the pre-usage-contract response without crashing the UI', () => {
    expect(
      normalizeNotesImportCredits({ remaining: 4, isSupporter: false })
    ).toEqual({
      remaining: 4,
      limit: 5,
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    })
  })

  it('preserves authoritative limits from the current proxy contract', () => {
    expect(
      normalizeNotesImportCredits({
        remaining: 7,
        limit: 9,
        isSupporter: false,
        refinements: { remaining: 2, limit: 4 },
      })
    ).toEqual({
      remaining: 7,
      limit: 9,
      isSupporter: false,
      refinements: { remaining: 2, limit: 4 },
    })
  })

  it('treats authenticated dev-bypass usage as unlimited imports', () => {
    expect(
      normalizeNotesImportCredits(
        { remaining: 2, isSupporter: false },
        { unlimitedImports: true }
      )
    ).toEqual({
      remaining: null,
      limit: null,
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    })
  })

  it('shows the Supporter CTA for unlimited dev usage without an entitlement', () => {
    const credits = normalizeNotesImportCredits(
      { remaining: 2, isSupporter: false },
      { unlimitedImports: true }
    )
    expect(shouldShowNotesImportSupporterCta(credits)).toBe(true)
  })

  it('corrects the transitional dev proxy response that conflated bypass with Supporter', () => {
    const credits = normalizeNotesImportCredits(
      { remaining: null, isSupporter: true },
      { unlimitedImports: true }
    )
    expect(credits.isSupporter).toBe(false)
    expect(shouldShowNotesImportSupporterCta(credits)).toBe(true)
  })
})
